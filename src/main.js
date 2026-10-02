import './style.css';
import confetti from 'canvas-confetti';
import { Chart, registerables } from 'chart.js';
import { db, normalizeIngenicoSerial, getDefaultBundledProducts } from './storage.js';
import { sounds } from './audio.js';
import { Icons } from './icons.js';
import { scannerManager } from './scanner.js';
import { generateBarcodeSvg, getQrCodeImageUrl } from './labelGenerator.js';

// Register Chart.js components
Chart.register(...registerables);

// Application State
let activeNav = 'dashboard'; // 'dashboard', 'pos', 'list', 'search', 'export'
let activeTab = 'all'; // for table filtering
let activeModal = null; // 'scan', 'borrow', 'return', 'edit-loan', 'add-pos', 'label', 'history'
let targetLoanForEdit = null;
let currentChartInstances = [];

// Search Filter State (for Search page)
let searchFilter = {
  date: '',
  eid: '',
  sku: '',
  product: ''
};

// POS Page S/N Scan State
let posPageScannedSn = '';

// Scanner Targeting State
let scannerTarget = 'sn'; // 'sn', 'borrow-eid', 'return-eid', 'search-eid', 'stockin-sku', 'stockin-sn'
let pendingBorrowSerial = '';
let pendingReturnSerial = '';
let pendingStockinSku = '';

// DOM Mounting
const app = document.getElementById('app');

function init() {
  renderApp();
  setupGlobalBarcodeGunListener();
}

function setupGlobalBarcodeGunListener() {
  let barcodeBuffer = '';
  let lastKeyTime = Date.now();

  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      return;
    }

    const now = Date.now();
    if (now - lastKeyTime > 150) {
      barcodeBuffer = '';
    }
    lastKeyTime = now;

    if (e.key === 'Enter') {
      if (barcodeBuffer.length >= 4) {
        e.preventDefault();
        handleScannedCode(barcodeBuffer);
        barcodeBuffer = '';
      }
    } else if (e.key.length === 1) {
      barcodeBuffer += e.key;
    }
  });
}

function handleScannedCode(scannedText) {
  const raw = String(scannedText || '').trim();
  if (!raw) return;

  // // sounds.playScanBeep();

  // 1. If scanning Employee ID for Borrow Modal
  if (scannerTarget === 'borrow-eid') {
    const empId = raw;
    closeModal();
    openBorrowModal(pendingBorrowSerial || '');
    setTimeout(() => {
      const empInput = document.getElementById('borrow-emp-id');
      if (empInput) {
        empInput.value = empId;
        const staff = db.getStaffById(empId);
        if (staff) {
          document.getElementById('borrow-name').value = staff.fullName || '';
          document.getElementById('borrow-phone').value = staff.phone || '';
          document.getElementById('borrow-email').value = staff.email || '';
          document.getElementById('borrow-branch').value = staff.branch || '';
        }
      }
    }, 60);
    scannerTarget = 'sn';
    return;
  }

  // 2. If scanning Employee ID for Return Modal
  if (scannerTarget === 'return-eid') {
    const empId = raw;
    closeModal();
    openReturnModal(pendingReturnSerial || '');
    setTimeout(() => {
      const empInput = document.getElementById('return-employee-id');
      if (empInput) empInput.value = empId;
    }, 60);
    scannerTarget = 'sn';
    return;
  }

  // 3. If scanning Employee ID for Search Filter
  if (scannerTarget === 'search-eid') {
    searchFilter.eid = raw;
    scannerTarget = 'sn';
    activeNav = 'search';
    closeModal();
    renderApp();
    return;
  }

  // 4. Double-Scan Stock-In: Step 1 (Scan SKU)
  if (scannerTarget === 'stockin-sku') {
    pendingStockinSku = raw.toUpperCase().replace(/\s+/g, '-');
    // sounds.playSuccessChime();
    scannerTarget = 'stockin-sn';
    openScannerModal('stockin-sn');
    return;
  }

  // 5. Double-Scan Stock-In: Step 2 (Scan S/N)
  if (scannerTarget === 'stockin-sn') {
    const sn = normalizeIngenicoSerial(raw);
    const sku = pendingStockinSku || 'ING-MOVE5000-4G';
    let model = 'Ingenico Move/5000 4G';
    if (sku.toLowerCase().includes('3500')) model = 'Ingenico Move/3500 Compact';
    else if (sku.toLowerCase().includes('dx8000') || sku.toLowerCase().includes('axium')) model = 'Ingenico AXIUM DX8000';
    else if (sku.toLowerCase().includes('desk') || sku.toLowerCase().includes('d5k')) model = 'Ingenico Desk/5000';

    try {
      db.addPos({
        serialNumber: sn,
        model: model,
        sku: sku,
        brand: 'Ingenico',
        status: 'AVAILABLE'
      });
      // sounds.playSuccessChime();
      confetti({ particleCount: 75, spread: 70 });
      posPageScannedSn = sn;
      activeNav = 'pos';
      closeModal();
      renderApp();
      alert(`✓ Smart Double-Scan Completed!\n\n1. SKU: ${sku}\n2. S/N: ${sn}\n\nIngenico terminal successfully registered into fleet with bundled accessories!`);
    } catch (err) {
      // sounds.playWarningBuzz();
      alert(err.message);
      closeModal();
    }
    scannerTarget = 'sn';
    pendingStockinSku = '';
    return;
  }

  // 6. Default: Serial Number or Auto-detect Staff Badge
  const code = normalizeIngenicoSerial(raw);

  // Check if this matches a staff member badge while not matching an existing device
  const staff = db.getStaffById(raw);
  if (staff && !db.getPosBySerial(code)) {
    closeModal();
    openBorrowModal('');
    setTimeout(() => {
      const empInput = document.getElementById('borrow-emp-id');
      if (empInput) {
        empInput.value = staff.employeeId;
        document.getElementById('borrow-name').value = staff.fullName || '';
        document.getElementById('borrow-phone').value = staff.phone || '';
        document.getElementById('borrow-email').value = staff.email || '';
        document.getElementById('borrow-branch').value = staff.branch || '';
      }
    }, 60);
    return;
  }

  // If on POS Page, set the scanned S/N to display related products
  if (activeNav === 'pos') {
    posPageScannedSn = code;
    renderApp();
    return;
  }

  // If in Borrow Modal, auto-fill serial
  if (activeModal === 'borrow') {
    const input = document.getElementById('borrow-serial');
    if (input) {
      input.value = code;
      handleBorrowSerialChange(code);
    }
    closeModal();
    return;
  }

  // If in Return Modal, auto-fill serial
  if (activeModal === 'return') {
    const input = document.getElementById('return-serial');
    if (input) {
      input.value = code;
      handleReturnSerialLookup(code);
    }
    closeModal();
    return;
  }

  // Smart Routing from Camera / Scanner
  const activeLoan = db.getActiveLoanBySerial(code);
  if (activeLoan) {
    closeModal();
    openReturnModal(code);
  } else {
    closeModal();
    openBorrowModal(code);
  }
}

// Helpers
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Master Render
function renderApp() {
  destroyCharts();

  app.innerHTML = `
    <div class="app-container">
      <!-- Header -->
      <header class="header-bar">
        <div class="brand-wrapper">
          <div class="brand-logo-icon">
            ${Icons.pos}
          </div>
          <div>
            <div class="brand-title">
              Track<span>POS</span> Pro
              <span class="brand-badge">Ingenico Fleet</span>
            </div>
            <div class="brand-subtitle">One-to-Many Hardware Dispatch &amp; Live Barcode Tracker</div>
          </div>
        </div>

        <div class="header-actions">
          <button class="btn btn-outline-cyan" id="btn-top-scanner">
            ${Icons.camera} <strong>Scan S/N</strong>
          </button>
          <button class="btn btn-success" id="btn-top-return">
            ${Icons.checkin} Check-in Return
          </button>
          <button class="btn btn-primary" id="btn-top-borrow">
            ${Icons.plus} New Borrow
          </button>
          <button class="btn btn-secondary" id="btn-toggle-sound" title="${sounds.isMuted ? 'Unmute Sound' : 'Mute Sound'}">
            ${sounds.isMuted ? Icons.soundOff : Icons.soundOn}
          </button>
        </div>
      </header>

      <!-- Navigation System -->
      <nav class="main-nav-bar" style="display:flex; background:rgba(15,23,42,0.85); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:6px; margin-bottom:24px; gap:6px; overflow-x:auto;">
        <button class="nav-tab-btn ${activeNav === 'dashboard' ? 'active' : ''}" data-nav="dashboard">
          ${Icons.grid} 📊 Dashboard (Graphs)
        </button>
        <button class="nav-tab-btn ${activeNav === 'pos' ? 'active' : ''}" data-nav="pos">
          ${Icons.pos} 📦 POS (One-to-Many)
        </button>
        <button class="nav-tab-btn ${activeNav === 'list' ? 'active' : ''}" data-nav="list">
          ${Icons.list} 📋 List of Borrow/Return
        </button>
        <button class="nav-tab-btn ${activeNav === 'search' ? 'active' : ''}" data-nav="search">
          ${Icons.search} 🔍 Search
        </button>
        <button class="nav-tab-btn ${activeNav === 'export' ? 'active' : ''}" data-nav="export">
          ${Icons.download} 📤 Export Data &amp; Telegram
        </button>
      </nav>

      <!-- Active Page Content -->
      <main id="main-content">
        ${renderActivePage()}
      </main>
    </div>

    <!-- Floating Action Button for Mobile -->
    <button class="mobile-fab-scan" id="btn-mobile-fab-scan">
      ${Icons.camera} Scan S/N
    </button>

    <!-- Modal Container -->
    <div id="modal-container"></div>
  `;

  attachNavListeners();

  // If Dashboard is active, render Chart.js graphs
  if (activeNav === 'dashboard') {
    renderDashboardCharts();
  }
}

function renderActivePage() {
  switch (activeNav) {
    case 'dashboard':
      return renderDashboardPage();
    case 'pos':
      return renderPosOneToManyPage();
    case 'list':
      return renderBorrowReturnListPage();
    case 'search':
      return renderSearchPage();
    case 'export':
      return renderExportTelegramPage();
    default:
      return renderDashboardPage();
  }
}

// -------------------------------------------------------------
// Page 1: Dashboard with Visual Graphs (Chart.js)
// -------------------------------------------------------------
function renderDashboardPage() {
  const loans = db.getLoans();
  const posList = db.getPosList();

  const total = posList.length;
  const available = posList.filter(p => p.status === 'AVAILABLE').length;
  const active = loans.filter(l => l.status === 'ACTIVE').length;
  const overdue = loans.filter(l => l.status === 'OVERDUE').length;

  return `
    <!-- Top Metrics Row -->
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-info">
          <h4>Total Ingenico Fleet</h4>
          <div class="metric-value">${total}</div>
          <div class="metric-subtext">Registered Terminals</div>
        </div>
        <div class="metric-icon-wrap icon-blue">${Icons.pos}</div>
      </div>

      <div class="metric-card">
        <div class="metric-info">
          <h4>In Stock (Available)</h4>
          <div class="metric-value">${available}</div>
          <div class="metric-subtext">Ready for Checkout</div>
        </div>
        <div class="metric-icon-wrap icon-emerald">${Icons.checkCircle}</div>
      </div>

      <div class="metric-card">
        <div class="metric-info">
          <h4>Active Loans In Field</h4>
          <div class="metric-value">${active}</div>
          <div class="metric-subtext">In Use Across Branches</div>
        </div>
        <div class="metric-icon-wrap icon-amber">${Icons.clock}</div>
      </div>

      <div class="metric-card">
        <div class="metric-info">
          <h4>Overdue Returns</h4>
          <div class="metric-value">${overdue}</div>
          <div class="metric-subtext">Requires Immediate Attention</div>
        </div>
        <div class="metric-icon-wrap icon-rose">${Icons.alertTriangle}</div>
      </div>
    </div>

    <!-- Charts Row -->
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap:20px; margin-bottom:24px;">
      <!-- Chart 1: Fleet Status Distribution -->
      <div class="dashboard-panel" style="padding:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h3 style="font-size:15px; font-weight:700;">Fleet Status Breakdown</h3>
          <span style="font-size:11px; color:var(--text-muted);">Real-time</span>
        </div>
        <div style="height:260px; position:relative;">
          <canvas id="chart-status-pie"></canvas>
        </div>
      </div>

      <!-- Chart 2: Loans by Branch -->
      <div class="dashboard-panel" style="padding:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h3 style="font-size:15px; font-weight:700;">Branch / Department Allocations</h3>
          <span style="font-size:11px; color:var(--text-muted);">In-Field Units</span>
        </div>
        <div style="height:260px; position:relative;">
          <canvas id="chart-branches-bar"></canvas>
        </div>
      </div>
    </div>

    <!-- Recent Loan Timeline Summary -->
    <div class="dashboard-panel">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="font-size:16px; font-weight:700;">Recent Dispatch &amp; Return Activity</h3>
        <button class="btn btn-secondary btn-sm" onclick="document.querySelector('[data-nav=list]').click()">
          View Full Master Sheet &rarr;
        </button>
      </div>

      <div class="table-container">
        <table class="modern-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Borrower (EID)</th>
              <th>Contact &amp; Branch</th>
              <th>Terminal S/N</th>
              <th>Borrowed Date</th>
              <th>Expected Return</th>
            </tr>
          </thead>
          <tbody>
            ${loans.slice(0, 5).map(l => `
              <tr>
                <td><span class="status-pill ${l.status === 'AVAILABLE' ? 'status-available' : (l.status === 'OVERDUE' ? 'status-overdue' : (l.status === 'RETURNED' ? 'status-returned' : 'status-active'))}">${l.status}</span></td>
                <td>
                  <strong>${escapeHtml(l.staffName)}</strong><br/>
                  <span class="emp-badge">${escapeHtml(l.employeeId)}</span>
                </td>
                <td>
                  <div style="font-size:12.5px;">${escapeHtml(l.branch)}</div>
                  <div style="font-size:11.5px; color:var(--accent-cyan); font-family:var(--font-mono);">${escapeHtml(l.phone)}</div>
                </td>
                <td>
                  <strong>${escapeHtml(l.model)}</strong><br/>
                  <span class="sn-badge">${escapeHtml(l.serialNumber)}</span>
                </td>
                <td>${formatDate(l.borrowedAt)} <span style="color:var(--text-dim); font-size:11px;">${l.borrowTime || ''}</span></td>
                <td>${l.returnedAt ? `<span style="color:var(--status-available-text);">✓ Returned: ${formatDate(l.returnedAt)}</span>` : formatDate(l.expectedReturnAt)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderDashboardCharts() {
  const posList = db.getPosList();
  const loans = db.getLoans();

  const available = posList.filter(p => p.status === 'AVAILABLE').length;
  const active = loans.filter(l => l.status === 'ACTIVE').length;
  const overdue = loans.filter(l => l.status === 'OVERDUE').length;

  // Chart 1: Status Doughnut
  const ctxStatus = document.getElementById('chart-status-pie');
  if (ctxStatus) {
    const chart = new Chart(ctxStatus, {
      type: 'doughnut',
      data: {
        labels: ['Available (Stock)', 'Active in Field', 'Overdue Loans'],
        datasets: [{
          data: [available, active, overdue],
          backgroundColor: ['#10b981', '#38bdf8', '#ef4444'],
          borderColor: '#0f172a',
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 12 } } }
        }
      }
    });
    currentChartInstances.push(chart);
  }

  // Chart 2: Branches Bar Chart
  const branchMap = {};
  loans.filter(l => l.status === 'ACTIVE' || l.status === 'OVERDUE').forEach(l => {
    const b = l.branch || 'Other';
    branchMap[b] = (branchMap[b] || 0) + 1;
  });

  const branchLabels = Object.keys(branchMap);
  const branchData = Object.values(branchMap);

  const ctxBranch = document.getElementById('chart-branches-bar');
  if (ctxBranch) {
    const chart = new Chart(ctxBranch, {
      type: 'bar',
      data: {
        labels: branchLabels.length ? branchLabels : ['HQ Inventory'],
        datasets: [{
          label: 'Terminals in Use',
          data: branchData.length ? branchData : [available],
          backgroundColor: '#6366f1',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } },
          y: { ticks: { color: '#94a3b8', precision: 0 }, grid: { color: 'rgba(255,255,255,0.05)' } }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
    currentChartInstances.push(chart);
  }
}

function destroyCharts() {
  currentChartInstances.forEach(c => c.destroy());
  currentChartInstances = [];
}

// -------------------------------------------------------------
// Page 2: POS (One-to-Many: Scan S/N & Auto-Sort Products)
// -------------------------------------------------------------
function renderPosOneToManyPage() {
  const posList = db.getPosList();
  const matchedPos = posPageScannedSn ? db.getPosBySerial(posPageScannedSn) : null;
  const activeLoan = posPageScannedSn ? db.getActiveLoanBySerial(posPageScannedSn) : null;

  return `
    <!-- Top Hero Section: Scan S/N to Auto-Sort Products -->
    <div class="dashboard-panel" style="margin-bottom:24px; border-color:rgba(56,189,248,0.4);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; flex-wrap:wrap; gap:12px;">
        <div>
          <div style="font-size:11.5px; text-transform:uppercase; color:var(--accent-cyan); font-weight:700; letter-spacing:0.8px;">
            One-to-Many Hardware Mapping Engine
          </div>
          <h2 style="font-size:19px; font-weight:800; margin-top:2px;">
            Scan POS Serial Number &rarr; Auto-Sort Bundled Products
          </h2>
          <p style="font-size:12.5px; color:var(--text-muted);">
            Scan or enter an Ingenico S/N. The system automatically locates the terminal and loads all bundled accessories (Dock, Charger, SIM, Cable).
          </p>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-outline-cyan btn-sm" id="btn-double-scan-stockin">
            ⚡ Double-Scan (Stock-In)
          </button>
          <button class="btn btn-outline-cyan btn-sm" id="btn-pos-scan-camera">
            ${Icons.camera} Scan S/N
          </button>
          <button class="btn btn-primary btn-sm" id="btn-add-pos-unit">
            ${Icons.plus} Register New POS
          </button>
        </div>
      </div>

      <!-- S/N Scanner Input -->
      <div style="display:flex; gap:10px; max-width:540px;">
        <input 
          type="text" 
          id="pos-page-sn-input" 
          class="form-input" 
          placeholder="Scan Barcode or Type S/N (e.g. 212857310045)..."
          value="${escapeHtml(posPageScannedSn)}"
          style="font-family:var(--font-mono); font-size:14.5px;"
        />
        <button class="btn btn-primary" id="btn-pos-page-lookup">
          Lookup
        </button>
      </div>

      <!-- Scanned S/N Result Card with One-to-Many Bundled Products -->
      ${matchedPos ? `
        <div style="margin-top:20px; background:rgba(15,23,42,0.9); border:1px solid rgba(56,189,248,0.4); border-radius:var(--radius-lg); padding:20px; animation:fadeIn 0.25s ease;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
            <div>
              <span class="status-pill ${matchedPos.status === 'AVAILABLE' ? 'status-available' : (matchedPos.status === 'OVERDUE' ? 'status-overdue' : 'status-active')}">
                ${matchedPos.status}
              </span>
              <h3 style="font-size:18px; font-weight:800; margin-top:6px;">${escapeHtml(matchedPos.model)}</h3>
              <div style="font-family:var(--font-mono); font-size:13px; color:var(--accent-cyan);">
                S/N: ${escapeHtml(matchedPos.serialNumber)} &bull; SKU: ${escapeHtml(matchedPos.sku)}
              </div>
            </div>

            <div style="display:flex; gap:8px;">
              ${activeLoan ? `
                <button class="btn btn-success btn-sm btn-return-row" data-sn="${escapeHtml(matchedPos.serialNumber)}">
                  ${Icons.checkin} Check-in Return
                </button>
              ` : `
                <button class="btn btn-primary btn-sm btn-borrow-device" data-sn="${escapeHtml(matchedPos.serialNumber)}">
                  ${Icons.checkout} Check Out Loan
                </button>
              `}
              <button class="btn btn-secondary btn-sm btn-print-label" data-sn="${escapeHtml(matchedPos.serialNumber)}">
                ${Icons.printer} Label
              </button>
            </div>
          </div>

          ${activeLoan ? `
            <div style="background:rgba(30,41,59,0.7); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:12px; margin-bottom:16px; font-size:12.5px;">
              👤 Currently Loaned to: <strong>${escapeHtml(activeLoan.staffName)}</strong> (<span class="emp-badge">${escapeHtml(activeLoan.employeeId)}</span>) &bull; 📞 ${escapeHtml(activeLoan.phone)} &bull; 🏢 ${escapeHtml(activeLoan.branch)}
            </div>
          ` : ''}

          <!-- One-to-Many Bundled Products Header -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
            <h4 style="font-size:12.5px; text-transform:uppercase; letter-spacing:0.6px; color:var(--text-muted); margin:0;">
              Bundled Products &amp; Accessories (One-to-Many Relationship):
            </h4>
            <button class="btn btn-outline-cyan btn-sm" id="btn-add-manual-product" data-sn="${escapeHtml(matchedPos.serialNumber)}">
              ${Icons.plus} Fill / Add Product Manually
            </button>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:10px;">
            ${(matchedPos.products && matchedPos.products.length > 0) ? matchedPos.products.map((p, idx) => `
              <div style="background:rgba(11,17,30,0.85); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div style="font-weight:700; font-size:13px;">${escapeHtml(p.name)}</div>
                  <div style="font-size:11px; color:var(--text-dim); font-family:var(--font-mono);">${escapeHtml(p.sku)} &bull; ${escapeHtml(p.category || 'Accessory')}</div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span class="tech-tag" style="background:rgba(99,102,241,0.15); color:#a5b4fc;">x${p.qty || 1}</span>
                  <button class="btn-remove-bundled-prod" data-sn="${escapeHtml(matchedPos.serialNumber)}" data-idx="${idx}" title="Remove accessory" style="background:transparent; border:none; color:#f87171; cursor:pointer; font-size:14px; padding:2px 6px; border-radius:4px; line-height:1;">
                    ✕
                  </button>
                </div>
              </div>
            `).join('') : `
              <div style="grid-column: 1 / -1; color:var(--text-muted); font-size:12.5px; padding:12px; background:rgba(0,0,0,0.2); border-radius:8px;">
                No bundled accessories attached yet. Click <strong>"Fill / Add Product Manually"</strong> to add items.
              </div>
            `}
          </div>
        </div>
      ` : (posPageScannedSn ? `
        <div style="margin-top:16px; padding:14px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:var(--radius-md); color:#f87171; font-size:13px;">
          ⚠️ No registered Ingenico terminal matches S/N: "<strong>${escapeHtml(posPageScannedSn)}</strong>". Click "Register New POS" to add it.
        </div>
      ` : '')}
    </div>

    <!-- Complete Fleet List with One-to-Many Counts -->
    <div class="dashboard-panel">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="font-size:16px; font-weight:700;">All Ingenico Terminals (${posList.length} Units in Fleet)</h3>
        <span style="font-size:12px; color:var(--text-dim);">Scale tested for 1,000+ devices</span>
      </div>

      <div class="table-container">
        <table class="modern-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Serial Number (S/N)</th>
              <th>Model Name</th>
              <th>SKU</th>
              <th>Bundled Products (One-to-Many)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${posList.map(pos => `
              <tr>
                <td><span class="status-pill ${pos.status === 'AVAILABLE' ? 'status-available' : (pos.status === 'OVERDUE' ? 'status-overdue' : 'status-active')}">${pos.status}</span></td>
                <td><span class="sn-badge" style="font-size:13px; font-weight:700;">${escapeHtml(pos.serialNumber)}</span></td>
                <td><strong>${escapeHtml(pos.model)}</strong></td>
                <td><code>${escapeHtml(pos.sku)}</code></td>
                <td>
                  <span class="tech-tag" style="background:rgba(56,189,248,0.15); color:var(--accent-cyan); font-weight:700;">
                    ${(pos.products || []).length} Bundled Items
                  </span>
                  <span style="font-size:11px; color:var(--text-dim); margin-left:6px;">
                    ${(pos.products || []).slice(0, 2).map(p => p.name).join(', ')}...
                  </span>
                </td>
                <td>
                  <div style="display:flex; gap:6px;">
                    <button class="btn btn-sm btn-outline-cyan btn-pos-inspect" data-sn="${escapeHtml(pos.serialNumber)}">
                      Inspect
                    </button>
                    <button class="btn btn-sm btn-secondary btn-print-label" data-sn="${escapeHtml(pos.serialNumber)}">
                      ${Icons.printer}
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// Page 3: List of Borrow/Return (Excel-like Sheet with Add & Edit)
// -------------------------------------------------------------
function renderBorrowReturnListPage() {
  const loans = db.getLoans();

  return `
    <div class="dashboard-panel">
      <!-- Toolbar -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; flex-wrap:wrap; gap:12px;">
        <div>
          <h2 style="font-size:18px; font-weight:800;">Master Borrow &amp; Return Register</h2>
          <div style="font-size:12.5px; color:var(--text-muted);">
            Excel-style editable ledger with full audit tracking. Click <strong>{Edit}</strong> on any row to modify dates, times, or staff info.
          </div>
        </div>

        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary" id="btn-list-add-new">
            ${Icons.plus} Add New Record
          </button>
          <button class="btn btn-secondary" id="btn-list-export">
            ${Icons.download} Export CSV
          </button>
        </div>
      </div>

      <!-- Master Ledger Table -->
      <div class="table-container" style="max-height:650px; overflow-y:auto;">
        <table class="modern-table" style="font-size:13px;">
          <thead>
            <tr>
              <th style="width:60px;"># List</th>
              <th>Status</th>
              <th>Borrower (EID &amp; Name)</th>
              <th>Contact</th>
              <th>SKU --- Related Product</th>
              <th>Serial Number (S/N)</th>
              <th>Borrow Date</th>
              <th>Borrow Time</th>
              <th>Return EID</th>
              <th>Return Date</th>
              <th>Return Time</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${loans.length === 0 ? `
              <tr><td colspan="12" style="text-align:center; padding:40px;">No loan records found.</td></tr>
            ` : loans.map(l => `
              <tr>
                <td style="font-family:var(--font-mono); color:var(--text-dim);">${l.listNumber || '-'}</td>
                <td>
                  <span class="status-pill ${l.status === 'AVAILABLE' ? 'status-available' : (l.status === 'OVERDUE' ? 'status-overdue' : (l.status === 'RETURNED' ? 'status-returned' : 'status-active'))}" style="font-size:10.5px;">
                    ${l.status}
                  </span>
                </td>
                <td>
                  <span class="emp-badge">${escapeHtml(l.employeeId)}</span>
                  <strong style="margin-left:6px;">${escapeHtml(l.staffName)}</strong>
                </td>
                <td>
                  <div style="font-family:var(--font-mono); font-size:12px; color:var(--accent-cyan);">${escapeHtml(l.phone || '')}</div>
                  <div style="font-size:11px; color:var(--text-dim);">${escapeHtml(l.email || '')}</div>
                </td>
                <td>
                  <strong>${escapeHtml(l.sku || 'N/A')}</strong><br/>
                  <span style="font-size:11.5px; color:var(--text-muted);">${escapeHtml(l.model || '')}</span>
                </td>
                <td><span class="sn-badge">${escapeHtml(l.serialNumber)}</span></td>
                <td>${escapeHtml(l.borrowDate || formatDate(l.borrowedAt))}</td>
                <td style="font-family:var(--font-mono); color:var(--text-muted);">${escapeHtml(l.borrowTime || formatTime(l.borrowedAt))}</td>
                <td>${l.returnEmployeeId ? `<span class="emp-badge">${escapeHtml(l.returnEmployeeId)}</span>` : '<span style="color:var(--text-dim);">-</span>'}</td>
                <td>${l.returnDate ? escapeHtml(l.returnDate) : '<span style="color:var(--text-dim);">-</span>'}</td>
                <td style="font-family:var(--font-mono); color:var(--text-muted);">${l.returnTime ? escapeHtml(l.returnTime) : '-'}</td>
                <td>
                  <div style="display:flex; gap:6px;">
                    <button class="btn btn-sm btn-outline-cyan btn-edit-loan" data-id="${l.id}">
                      Edit
                    </button>
                    ${l.status !== 'RETURNED' ? `
                      <button class="btn btn-sm btn-success btn-return-row" data-sn="${escapeHtml(l.serialNumber)}">
                        Return
                      </button>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// Page 4: Search (4 Facets: by Date, EID, SKU, Product)
// -------------------------------------------------------------
function renderSearchPage() {
  const loans = db.getLoans();

  const results = loans.filter(l => {
    if (searchFilter.date) {
      const matchBorrow = l.borrowDate === searchFilter.date;
      const matchReturn = l.returnDate === searchFilter.date;
      if (!matchBorrow && !matchReturn) return false;
    }
    if (searchFilter.eid) {
      const q = searchFilter.eid.toLowerCase();
      const matchBorrower = l.employeeId && l.employeeId.toLowerCase().includes(q);
      const matchReturner = l.returnEmployeeId && l.returnEmployeeId.toLowerCase().includes(q);
      if (!matchBorrower && !matchReturner) return false;
    }
    if (searchFilter.sku) {
      const q = searchFilter.sku.toLowerCase();
      if (!l.sku || !l.sku.toLowerCase().includes(q)) return false;
    }
    if (searchFilter.product) {
      const q = searchFilter.product.toLowerCase();
      const matchModel = l.model && l.model.toLowerCase().includes(q);
      const matchSn = l.serialNumber && l.serialNumber.toLowerCase().includes(q);
      if (!matchModel && !matchSn) return false;
    }
    return true;
  });

  return `
    <div class="dashboard-panel" style="margin-bottom:24px;">
      <h2 style="font-size:18px; font-weight:800; margin-bottom:14px;">Multi-Facet Search Portal</h2>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">📅 Filter by Date (Borrow or Return)</label>
          <input type="date" id="search-date" class="form-input" value="${searchFilter.date || ''}" />
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">👤 Filter by Employee ID (EID)</label>
          <div class="input-with-action">
            <input type="text" id="search-eid" class="form-input" placeholder="e.g. 90028288" value="${escapeHtml(searchFilter.eid || '')}" />
            <button type="button" class="btn btn-outline-cyan btn-sm" id="btn-scan-search-eid" title="Scan Employee ID Badge Barcode">${Icons.camera}</button>
          </div>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">🏷️ Filter by SKU Code</label>
          <input type="text" id="search-sku" class="form-input" placeholder="e.g. ING-MOVE5000-4G" value="${escapeHtml(searchFilter.sku || '')}" />
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">📦 Filter by Product / S/N</label>
          <input type="text" id="search-product" class="form-input" placeholder="e.g. Move/5000 or 212857310045" value="${escapeHtml(searchFilter.product || '')}" />
        </div>
      </div>
      <div style="margin-top:14px; display:flex; justify-content:flex-end;">
        <button class="btn btn-secondary btn-sm" id="btn-clear-search">Clear Filters</button>
      </div>
    </div>

    <!-- Search Results -->
    <div class="dashboard-panel">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <h3 style="font-size:15px; font-weight:700;">Matching Results (${results.length} Found)</h3>
      </div>

      <div class="table-container">
        <table class="modern-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Borrower (EID &amp; Name)</th>
              <th>SKU &amp; Product</th>
              <th>Serial Number (S/N)</th>
              <th>Borrow Date</th>
              <th>Borrow Time</th>
              <th>Return EID</th>
              <th>Return Date &amp; Time</th>
            </tr>
          </thead>
          <tbody>
            ${results.length === 0 ? `
              <tr><td colspan="8" style="text-align:center; padding:32px;">No matching records found for current filters.</td></tr>
            ` : results.map(l => `
              <tr>
                <td><span class="status-pill ${l.status === 'AVAILABLE' ? 'status-available' : (l.status === 'OVERDUE' ? 'status-overdue' : (l.status === 'RETURNED' ? 'status-returned' : 'status-active'))}">${l.status}</span></td>
                <td><span class="emp-badge">${escapeHtml(l.employeeId)}</span> <strong>${escapeHtml(l.staffName)}</strong></td>
                <td><strong>${escapeHtml(l.sku)}</strong><br/><span style="font-size:11.5px; color:var(--text-muted);">${escapeHtml(l.model)}</span></td>
                <td><span class="sn-badge">${escapeHtml(l.serialNumber)}</span></td>
                <td>${escapeHtml(l.borrowDate || formatDate(l.borrowedAt))}</td>
                <td>${escapeHtml(l.borrowTime || formatTime(l.borrowedAt))}</td>
                <td>${l.returnEmployeeId ? `<span class="emp-badge">${escapeHtml(l.returnEmployeeId)}</span>` : '-'}</td>
                <td>${l.returnDate ? `${escapeHtml(l.returnDate)} ${escapeHtml(l.returnTime || '')}` : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// Page 5: Export Data & Telegram Bot Automated Reporting
// -------------------------------------------------------------
function renderExportTelegramPage() {
  const config = db.getTelegramConfig();

  return `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(420px, 1fr)); gap:20px;">
      <!-- Export Section -->
      <div class="dashboard-panel">
        <h2 style="font-size:18px; font-weight:800; margin-bottom:8px;">📊 Export Ledger &amp; Reports</h2>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:18px;">
          Download a complete CSV audit spreadsheet formatted for Excel, accounting, and cross-branch device reconciliations.
        </p>

        <div style="background:rgba(15,23,42,0.8); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px; margin-bottom:18px;">
          <div style="font-weight:700; font-size:14px; margin-bottom:4px;">Full Fleet &amp; Dispatch Audit CSV</div>
          <div style="font-size:12px; color:var(--text-dim); margin-bottom:12px;">Includes List #, Borrower EID, Return EID, SKU, Product, S/N, and Exact Timestamps.</div>
          <button class="btn btn-primary" id="btn-export-csv-direct">
            ${Icons.download} Download CSV Spreadsheet
          </button>
        </div>
      </div>

      <!-- Telegram Bot Integration -->
      <div class="dashboard-panel" style="border-color:rgba(56,189,248,0.4);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <div>
            <h2 style="font-size:18px; font-weight:800;">🤖 Telegram Bot Daily Reporting</h2>
            <div style="font-size:12.5px; color:var(--text-muted);">
              Automatically dispatches daily summary reports to your team's Telegram group or bot chat.
            </div>
          </div>
          <span style="font-size:24px;">✈️</span>
        </div>

        <form id="form-telegram-config" style="margin-top:16px;">
          <div class="form-group">
            <label class="form-label">Telegram Bot Token *</label>
            <input 
              type="text" 
              id="tg-bot-token" 
              class="form-input" 
              placeholder="e.g. 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
              value="${escapeHtml(config.botToken || '')}"
            />
            <div style="font-size:11px; color:var(--text-dim); margin-top:4px;">Obtained from @BotFather on Telegram</div>
          </div>

          <div class="form-group">
            <label class="form-label">Telegram Chat ID / Channel ID *</label>
            <input 
              type="text" 
              id="tg-chat-id" 
              class="form-input" 
              placeholder="e.g. -1001234567890 or your User ID"
              value="${escapeHtml(config.chatId || '')}"
            />
            <div style="font-size:11px; color:var(--text-dim); margin-top:4px;">Group Chat ID or private Channel ID to receive the daily report</div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Scheduled Daily Auto-Send Time</label>
              <input type="time" id="tg-time" class="form-input" value="${config.scheduledTime || '18:00'}" />
            </div>
            <div class="form-group" style="display:flex; flex-direction:column; justify-content:flex-end;">
              <button type="submit" class="btn btn-secondary">
                Save Bot Settings
              </button>
            </div>
          </div>

          <hr style="border:none; border-top:1px solid var(--border-subtle); margin:18px 0;" />

          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:11.5px; color:var(--text-muted);">
                Last Dispatched: <strong>${config.lastSentDate ? formatDate(config.lastSentDate) + ' ' + formatTime(config.lastSentDate) : 'Never'}</strong>
              </div>
            </div>
            <button type="button" class="btn btn-success" id="btn-send-tg-now">
              🚀 Send Report to Telegram Now
            </button>
          </div>
          <div id="tg-status-log" style="font-size:12px; margin-top:10px;"></div>
        </form>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// Navigation & Global Event Handlers
// -------------------------------------------------------------
function attachNavListeners() {
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeNav = btn.getAttribute('data-nav');
      renderApp();
    });
  });

  // Top header actions
  document.getElementById('btn-top-scanner')?.addEventListener('click', openScannerModal);
  document.getElementById('btn-mobile-fab-scan')?.addEventListener('click', openScannerModal);
  document.getElementById('btn-top-return')?.addEventListener('click', () => openReturnModal());
  document.getElementById('btn-top-borrow')?.addEventListener('click', () => openBorrowModal());
  document.getElementById('btn-toggle-sound')?.addEventListener('click', () => {
    sounds.toggleMute();
    renderApp();
  });

  // POS Page events
  const posInput = document.getElementById('pos-page-sn-input');
  if (posInput) {
    posInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        posPageScannedSn = normalizeIngenicoSerial(posInput.value);
        renderApp();
      }
    });
    document.getElementById('btn-pos-page-lookup')?.addEventListener('click', () => {
      posPageScannedSn = normalizeIngenicoSerial(posInput.value);
      renderApp();
    });
    document.getElementById('btn-pos-scan-camera')?.addEventListener('click', () => openScannerModal('sn'));
    document.getElementById('btn-double-scan-stockin')?.addEventListener('click', () => openScannerModal('stockin-sku'));
    document.getElementById('btn-add-pos-unit')?.addEventListener('click', openAddPosModal);
    document.getElementById('btn-add-manual-product')?.addEventListener('click', (e) => {
      const sn = e.currentTarget.getAttribute('data-sn');
      if (sn) openAddManualProductModal(sn);
    });
    document.querySelectorAll('.btn-remove-bundled-prod').forEach(btn => {
      btn.addEventListener('click', () => {
        const sn = btn.getAttribute('data-sn');
        const idx = parseInt(btn.getAttribute('data-idx'));
        if (confirm('Remove this bundled item from this POS unit?')) {
          db.removeBundledProduct(sn, idx);
          sounds.playWarningBuzz();
          renderApp();
        }
      });
    });
    document.querySelectorAll('.btn-pos-inspect').forEach(btn => {
      btn.addEventListener('click', () => {
        posPageScannedSn = btn.getAttribute('data-sn');
        renderApp();
      });
    });
  }

  // List Page events
  document.getElementById('btn-list-add-new')?.addEventListener('click', () => openBorrowModal());
  document.getElementById('btn-list-export')?.addEventListener('click', exportToCsv);
  document.querySelectorAll('.btn-edit-loan').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const loan = db.getLoans().find(l => l.id === id);
      if (loan) openEditLoanModal(loan);
    });
  });

  // Row delegates
  document.querySelectorAll('.btn-return-row').forEach(btn => {
    btn.addEventListener('click', () => {
      openReturnModal(btn.getAttribute('data-sn'));
    });
  });
  document.querySelectorAll('.btn-borrow-device').forEach(btn => {
    btn.addEventListener('click', () => {
      openBorrowModal(btn.getAttribute('data-sn'));
    });
  });
  document.querySelectorAll('.btn-print-label').forEach(btn => {
    btn.addEventListener('click', () => {
      openLabelModal(btn.getAttribute('data-sn'));
    });
  });

  // Search Page events
  const sDate = document.getElementById('search-date');
  const sEid = document.getElementById('search-eid');
  const sSku = document.getElementById('search-sku');
  const sProd = document.getElementById('search-product');

  if (sDate) {
    sDate.addEventListener('input', (e) => { searchFilter.date = e.target.value; renderApp(); });
    sEid.addEventListener('input', (e) => { searchFilter.eid = e.target.value; renderApp(); });
    sSku.addEventListener('input', (e) => { searchFilter.sku = e.target.value; renderApp(); });
    sProd.addEventListener('input', (e) => { searchFilter.product = e.target.value; renderApp(); });
    document.getElementById('btn-scan-search-eid')?.addEventListener('click', () => openScannerModal('search-eid'));
    document.getElementById('btn-clear-search')?.addEventListener('click', () => {
      searchFilter = { date: '', eid: '', sku: '', product: '' };
      renderApp();
    });
  }

  // Export & Telegram Page events
  document.getElementById('btn-export-csv-direct')?.addEventListener('click', exportToCsv);

  const formTg = document.getElementById('form-telegram-config');
  if (formTg) {
    formTg.addEventListener('submit', (e) => {
      e.preventDefault();
      const token = document.getElementById('tg-bot-token').value.trim();
      const chat = document.getElementById('tg-chat-id').value.trim();
      const time = document.getElementById('tg-time').value;

      db.saveTelegramConfig({
        ...db.getTelegramConfig(),
        botToken: token,
        chatId: chat,
        scheduledTime: time
      });
      sounds.playSuccessChime();
      alert('✓ Telegram Bot Configuration Saved!');
    });

    document.getElementById('btn-send-tg-now')?.addEventListener('click', async () => {
      const logEl = document.getElementById('tg-status-log');
      if (logEl) logEl.innerHTML = `<span style="color:#38bdf8;">✈️ Sending summary report to Telegram API...</span>`;
      try {
        await db.sendTelegramReportNow();
        sounds.playSuccessChime();
        confetti({ particleCount: 50, spread: 60 });
        if (logEl) logEl.innerHTML = `<span style="color:#10b981;">✓ Successfully delivered daily report to Telegram!</span>`;
      } catch (err) {
        sounds.playWarningBuzz();
        if (logEl) logEl.innerHTML = `<span style="color:#f87171;">⚠️ Failed: ${escapeHtml(err.message)}</span>`;
      }
    });
  }
}

// -------------------------------------------------------------
// Modals
// -------------------------------------------------------------

// Edit Loan Modal (Edit Name, Time, Date, EID, Phone, Email)
function openEditLoanModal(loan) {
  activeModal = 'edit-loan';
  const modalContainer = document.getElementById('modal-container');

  modalContainer.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-card" style="max-width:640px;">
        <div class="modal-header">
          <div class="modal-title">
            Edit Borrow / Return Record (${escapeHtml(loan.id)})
          </div>
          <button class="btn-close" id="btn-close-edit">${Icons.x}</button>
        </div>

        <form id="form-edit-loan">
          <div class="modal-body">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Borrower Employee ID (EID) *</label>
                <input type="text" class="form-input" id="edit-emp-id" required value="${escapeHtml(loan.employeeId || '')}" />
              </div>
              <div class="form-group">
                <label class="form-label">Staff Full Name *</label>
                <input type="text" class="form-input" id="edit-name" required value="${escapeHtml(loan.staffName || '')}" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Phone Number *</label>
                <input type="tel" class="form-input" id="edit-phone" required value="${escapeHtml(loan.phone || '')}" />
              </div>
              <div class="form-group">
                <label class="form-label">Email Address</label>
                <input type="email" class="form-input" id="edit-email" value="${escapeHtml(loan.email || '')}" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Borrow Date *</label>
                <input type="date" class="form-input" id="edit-borrow-date" required value="${loan.borrowDate || ''}" />
              </div>
              <div class="form-group">
                <label class="form-label">Borrow Time *</label>
                <input type="time" class="form-input" id="edit-borrow-time" required value="${loan.borrowTime || ''}" />
              </div>
            </div>

            <hr style="border:none; border-top:1px solid var(--border-subtle); margin:14px 0;" />

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Return Employee ID (Verifier)</label>
                <input type="text" class="form-input" id="edit-return-eid" placeholder="Optional" value="${escapeHtml(loan.returnEmployeeId || '')}" />
              </div>
              <div class="form-group">
                <label class="form-label">Status</label>
                <select class="form-select" id="edit-status">
                  <option value="ACTIVE" ${loan.status === 'ACTIVE' ? 'selected' : ''}>ACTIVE (Borrowed)</option>
                  <option value="RETURNED" ${loan.status === 'RETURNED' ? 'selected' : ''}>RETURNED</option>
                  <option value="OVERDUE" ${loan.status === 'OVERDUE' ? 'selected' : ''}>OVERDUE</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Return Date</label>
                <input type="date" class="form-input" id="edit-return-date" value="${loan.returnDate || ''}" />
              </div>
              <div class="form-group">
                <label class="form-label">Return Time</label>
                <input type="time" class="form-input" id="edit-return-time" value="${loan.returnTime || ''}" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Return Notes / Inspection Remarks</label>
              <textarea class="form-textarea" id="edit-notes" rows="2">${escapeHtml(loan.returnNotes || '')}</textarea>
            </div>
          </div>

          <div class="modal-footer" style="justify-content:space-between;">
            <button type="button" class="btn btn-secondary" id="btn-delete-loan" style="color:#ef4444;">
              Delete Record
            </button>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-secondary" id="btn-cancel-edit">Cancel</button>
              <button type="submit" class="btn btn-primary">Save Changes</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('form-edit-loan')?.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      db.updateLoan(loan.id, {
        employeeId: document.getElementById('edit-emp-id').value.trim(),
        staffName: document.getElementById('edit-name').value.trim(),
        phone: document.getElementById('edit-phone').value.trim(),
        email: document.getElementById('edit-email').value.trim(),
        borrowDate: document.getElementById('edit-borrow-date').value,
        borrowTime: document.getElementById('edit-borrow-time').value,
        returnEmployeeId: document.getElementById('edit-return-eid').value.trim() || null,
        status: document.getElementById('edit-status').value,
        returnDate: document.getElementById('edit-return-date').value || null,
        returnTime: document.getElementById('edit-return-time').value || null,
        returnNotes: document.getElementById('edit-notes').value.trim()
      });

      sounds.playSuccessChime();
      closeModal();
      renderApp();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('btn-delete-loan')?.addEventListener('click', () => {
    if (confirm(`Are you sure you want to delete Record #${loan.listNumber}?`)) {
      db.deleteLoan(loan.id);
      closeModal();
      renderApp();
    }
  });

  document.getElementById('btn-close-edit')?.addEventListener('click', closeModal);
  document.getElementById('btn-cancel-edit')?.addEventListener('click', closeModal);
}

// Add New POS Modal
function openAddPosModal() {
  activeModal = 'add-pos';
  const modalContainer = document.getElementById('modal-container');

  modalContainer.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-card" style="max-width:600px;">
        <div class="modal-header">
          <div class="modal-title">
            Register New Ingenico Terminal to Fleet
          </div>
          <button class="btn-close" id="btn-close-add-pos">${Icons.x}</button>
        </div>

        <form id="form-new-pos">
          <div class="modal-body">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Serial Number (S/N) *</label>
                <input type="text" class="form-input" id="new-pos-sn" required placeholder="e.g. 231847302919" />
              </div>
              <div class="form-group">
                <label class="form-label">Model Name *</label>
                <input type="text" class="form-input" id="new-pos-model" required placeholder="e.g. Ingenico Move/5000 4G/WiFi/BT" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">SKU Code *</label>
                <input type="text" class="form-input" id="new-pos-sku" required placeholder="e.g. ING-MOVE5000-4G" />
              </div>
              <div class="form-group">
                <label class="form-label">Brand</label>
                <input type="text" class="form-input" value="Ingenico" readonly style="opacity:0.85;" />
              </div>
            </div>

            <div style="font-size:12px; color:var(--text-muted); margin-top:8px;">
              * Standard bundled products (Dock, 5V Power Supply, Cable, SIM card) will be automatically attached (One-to-Many).
            </div>
          </div>

          <div style="padding:0 24px 14px;">
            <button type="button" class="btn btn-outline-cyan btn-sm" id="btn-modal-double-scan" style="width:100%; justify-content:center; padding:9px 14px;">
              ⚡ Auto-Fill via Smart Double-Scan (1. Scan SKU ➜ 2. Scan S/N)
            </button>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="btn-cancel-add-pos">Cancel</button>
            <button type="submit" class="btn btn-primary">Save to Fleet</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('btn-modal-double-scan')?.addEventListener('click', () => {
    closeModal();
    openScannerModal('stockin-sku');
  });

  document.getElementById('form-new-pos')?.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const sn = normalizeIngenicoSerial(document.getElementById('new-pos-sn').value.trim());
      const model = document.getElementById('new-pos-model').value.trim();
      const sku = document.getElementById('new-pos-sku').value.trim();

      db.addPos({
        serialNumber: sn,
        model: model,
        sku: sku,
        brand: 'Ingenico',
        status: 'AVAILABLE'
      });

      sounds.playSuccessChime();
      posPageScannedSn = sn;
      closeModal();
      renderApp();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('btn-close-add-pos')?.addEventListener('click', closeModal);
  document.getElementById('btn-cancel-add-pos')?.addEventListener('click', closeModal);
}

// Add / Fill Bundled Product Manually (One-to-Many)
function openAddManualProductModal(serialNumber) {
  activeModal = 'add-product';
  const modalContainer = document.getElementById('modal-container');
  const pos = db.getPosBySerial(serialNumber);

  modalContainer.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-card" style="max-width:520px;">
        <div class="modal-header">
          <div class="modal-title">
            ${Icons.plus} Fill / Add Product Manually
          </div>
          <button class="btn-close" id="btn-close-add-prod">${Icons.x}</button>
        </div>

        <form id="form-add-bundled-prod">
          <div class="modal-body">
            <div style="font-size:12.5px; color:var(--text-muted); margin-bottom:14px; background:rgba(15,23,42,0.6); padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle);">
              Attaching accessory to: <strong>${escapeHtml(pos?.model || 'Ingenico POS')}</strong> (S/N: <code>${escapeHtml(serialNumber)}</code>)
            </div>

            <div class="form-group">
              <label class="form-label">Product / Accessory Name *</label>
              <input type="text" class="form-input" id="new-prod-name" required placeholder="e.g. Ingenico Stylus Touch Pen" />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">SKU Code</label>
                <input type="text" class="form-input" id="new-prod-sku" placeholder="e.g. ACC-STYLUS-M5K" />
              </div>
              <div class="form-group">
                <label class="form-label">Quantity *</label>
                <input type="number" class="form-input" id="new-prod-qty" min="1" max="99" value="1" required />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Category</label>
              <select class="form-select" id="new-prod-category">
                <option value="Accessory">Accessory / Peripheral</option>
                <option value="Docking">Charging Dock / Base</option>
                <option value="Power">Power Adapter / Cable</option>
                <option value="Cable">Interface / USB Cable</option>
                <option value="SIM / Network">SIM Card / 4G Modem</option>
                <option value="Consumable">Thermal Paper / Roll</option>
                <option value="Terminal">Terminal Unit</option>
              </select>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="btn-cancel-add-prod">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Bundled Product</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('form-add-bundled-prod')?.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const name = document.getElementById('new-prod-name').value.trim();
      const sku = document.getElementById('new-prod-sku').value.trim() || 'ACC-GEN';
      const qty = parseInt(document.getElementById('new-prod-qty').value) || 1;
      const category = document.getElementById('new-prod-category').value;

      db.addBundledProduct(serialNumber, { name, sku, qty, category });
      sounds.playSuccessChime();
      closeModal();
      renderApp();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('btn-close-add-prod')?.addEventListener('click', closeModal);
  document.getElementById('btn-cancel-add-prod')?.addEventListener('click', closeModal);
}

// Live Camera Barcode & S/N Scanner Modal (Supports Multi-Target: S/N, EID, SKU)
function openScannerModal(target = 'sn') {
  scannerTarget = target;
  activeModal = 'scan';
  const modalContainer = document.getElementById('modal-container');
  const availablePosList = db.getPosList();
  const staffList = db.getStaffList();

  // Dynamic titles, instructions, and simulation tags
  let title = `${Icons.camera} Live Ingenico Barcode &amp; S/N Scanner`;
  let desc = `Position the Ingenico serial number sticker inside the viewfinder. Automatically cleans <code>S/N:</code> and <code>12S</code> prefixes.`;
  let simTitle = `${Icons.sparkles} Quick Test Simulation (Click any Ingenico S/N or Sticker format)`;
  let simTagsHtml = '';

  if (target === 'borrow-eid') {
    title = `${Icons.camera} Scan Borrower Employee ID (EID) Badge`;
    desc = `Scan staff barcode or QR code on ID badge (e.g. <code>90028288</code>). System automatically loads borrower name and contact.`;
    simTitle = `👤 Quick Test: Click an Employee Badge to Auto-Fill`;
    simTagsHtml = staffList.map(s => `
      <button class="sim-tag-btn" data-sim="${escapeHtml(s.employeeId)}">
        👤 ${escapeHtml(s.fullName)} (${escapeHtml(s.employeeId)})
      </button>
    `).join('');
  } else if (target === 'return-eid') {
    title = `${Icons.camera} Scan Return Verifier Employee ID Badge`;
    desc = `Scan staff badge barcode of the receiving inspector verifying this return.`;
    simTitle = `👤 Quick Test: Click Return Staff Badge`;
    simTagsHtml = staffList.map(s => `
      <button class="sim-tag-btn" data-sim="${escapeHtml(s.employeeId)}">
        👤 ${escapeHtml(s.fullName)} (${escapeHtml(s.employeeId)})
      </button>
    `).join('');
  } else if (target === 'search-eid') {
    title = `${Icons.camera} Scan Employee ID to Filter Ledger`;
    desc = `Scan staff badge barcode to filter all loans borrowed or returned by this employee.`;
    simTitle = `👤 Quick Test: Filter by Employee Badge`;
    simTagsHtml = staffList.map(s => `
      <button class="sim-tag-btn" data-sim="${escapeHtml(s.employeeId)}">
        👤 ${escapeHtml(s.fullName)} (${escapeHtml(s.employeeId)})
      </button>
    `).join('');
  } else if (target === 'stockin-sku') {
    title = `⚡ Double-Scan Step 1 of 2: Scan Product SKU`;
    desc = `Scan the SKU barcode printed on the Ingenico package box (e.g. <code>ING-MOVE5000-4G</code>).`;
    simTitle = `📦 Step 1 Simulation: Click a Product SKU to Scan`;
    simTagsHtml = [
      'ING-MOVE5000-4G',
      'ING-MOVE3500-WIFI',
      'ING-AXIUM-DX8000',
      'ING-DESK5000-ETH'
    ].map(sku => `
      <button class="sim-tag-btn" data-sim="${sku}" style="border-color:var(--accent-cyan); color:var(--accent-cyan);">
        📦 ${sku}
      </button>
    `).join('');
  } else if (target === 'stockin-sn') {
    title = `⚡ Double-Scan Step 2 of 2: Scan Terminal S/N`;
    desc = `Now scan the Ingenico terminal serial sticker. System will register unit with SKU "<strong>${escapeHtml(pendingStockinSku)}</strong>".`;
    simTitle = `🟢 Step 2 Simulation: Click a New Serial Number`;
    simTagsHtml = [
      '231847302925',
      '231847302926',
      '212857310055',
      '220817349130'
    ].map(sn => `
      <button class="sim-tag-btn" data-sim="${sn}" style="border-color:#10b981; color:#10b981;">
        🟢 S/N: ${sn}
      </button>
    `).join('');
  } else {
    simTagsHtml = availablePosList.map(pos => `
      <button class="sim-tag-btn" data-sim="${escapeHtml(pos.serialNumber)}" title="${escapeHtml(pos.model)}">
        ${pos.status === 'BORROWED' ? '🔴' : '🟢'} ${escapeHtml(pos.serialNumber)}
      </button>
    `).join('') + `
      <button class="sim-tag-btn" data-sim="S/N: 212857310045" style="border-color:var(--accent-cyan); color:var(--accent-cyan);">
        🏷️ S/N: 212857310045
      </button>
      <button class="sim-tag-btn" data-sim="90028288" style="border-color:var(--accent-purple); color:var(--accent-purple);">
        👤 Badge: 90028288
      </button>
    `;
  }

  modalContainer.innerHTML = `
    <div class="modal-overlay" id="scanner-modal-backdrop">
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">
            ${title}
          </div>
          <button class="btn-close" id="btn-close-scanner">${Icons.x}</button>
        </div>
        <div class="modal-body" style="text-align:center;">
          <p style="font-size:13px; color:var(--text-muted); margin-bottom:12px;">
            ${desc}
          </p>

          <div class="camera-controls-bar" id="camera-controls-bar">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-toggle-torch" style="display:none; font-size:12px;">
              ⚡ Flashlight
            </button>
            <div id="zoom-buttons-group" class="zoom-group" style="display:none;">
              <span style="font-size:11px; color:var(--text-dim); padding:0 6px;">Zoom:</span>
              <button type="button" class="btn-zoom active" data-zoom="1">1x</button>
              <button type="button" class="btn-zoom" data-zoom="2">2x Macro</button>
              <button type="button" class="btn-zoom" data-zoom="3">3x</button>
            </div>
          </div>

          <div class="scanner-viewport-box">
            <div id="camera-reader"></div>
            <div class="scanner-laser-line"></div>
            
            <div id="scan-target-hud" style="display:none; position:absolute; inset:20px; border:3px solid #10b981; border-radius:12px; background:rgba(16,185,129,0.15); z-index:20; display:flex; align-items:center; justify-content:center; flex-direction:column;">
              <span style="background:#10b981; color:#0f172a; padding:6px 14px; border-radius:20px; font-weight:800; font-size:14px; letter-spacing:1px; box-shadow:0 0 20px #10b981;">
                ✓ CODE LOCKED
              </span>
              <div id="hud-sn-value" style="font-family:var(--font-mono); font-weight:800; font-size:18px; color:#fff; margin-top:8px;"></div>
            </div>

            <div class="scanner-reticle-corners">
              <div class="corner corner-tl"></div>
              <div class="corner corner-tr"></div>
              <div class="corner corner-bl"></div>
              <div class="corner corner-br"></div>
            </div>
          </div>

          <div id="camera-status" style="font-size:12.5px; color:var(--accent-cyan); margin-bottom:8px; min-height:20px;">
            Initializing Camera Feed...
          </div>

          <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:12px; background:rgba(15,23,42,0.6); padding:6px 12px; border-radius:6px; display:inline-block;">
            💡 <strong>Industrial Tip:</strong> Hold phone 20–25cm away &amp; tap <strong>2x Macro</strong> for instant focus!
          </div>

          <div class="test-sim-bar">
            <div class="test-sim-title">
              ${simTitle}
            </div>
            <div class="sim-tags">
              ${simTagsHtml}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <label class="btn btn-outline-cyan btn-sm" style="cursor:pointer;">
            ${Icons.camera} Snap Photo (Phone)
            <input type="file" id="scanner-camera-capture" accept="image/*" capture="environment" style="display:none;" />
          </label>
          <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
            ${Icons.download} Browse Photo
            <input type="file" id="scanner-file-input" accept="image/*" style="display:none;" />
          </label>
          <button class="btn btn-secondary btn-sm" id="btn-stop-scanner">Cancel</button>
        </div>
      </div>
    </div>
  `;

  setTimeout(async () => {
    const statusEl = document.getElementById('camera-status');
    const hud = document.getElementById('scan-target-hud');
    const hudVal = document.getElementById('hud-sn-value');

    const started = await scannerManager.startCamera(
      'camera-reader',
      (decodedText) => {
        const displayVal = (target === 'sn' || target === 'stockin-sn') ? normalizeIngenicoSerial(decodedText) : decodedText.trim();
        if (hud && hudVal) {
          hud.style.display = 'flex';
          hudVal.textContent = displayVal;
        }
        statusEl.innerHTML = `<span style="color:#10b981;">✓ Decoded: <strong>${escapeHtml(displayVal)}</strong></span>`;
        scannerManager.stop();
        setTimeout(() => {
          handleScannedCode(decodedText);
        }, 350);
      },
      (err) => {
        if (statusEl) {
          statusEl.innerHTML = `<span style="color:#f87171;">⚠️ Camera access unavailable. You can click any test tag below or upload a photo.</span>`;
        }
      }
    );

    if (started && statusEl) {
      statusEl.innerHTML = `<span style="color:#34d399;">● Camera Active (60fps Accelerated) - Align Barcode Inside Viewfinder...</span>`;

      setTimeout(() => {
        if (scannerManager.hasTorch()) {
          const torchBtn = document.getElementById('btn-toggle-torch');
          if (torchBtn) {
            torchBtn.style.display = 'inline-flex';
            torchBtn.addEventListener('click', async () => {
              const on = await scannerManager.toggleTorch();
              torchBtn.innerHTML = on ? '⚡ Flashlight ON' : '⚡ Flashlight';
            });
          }
        }

        if (scannerManager.hasZoom()) {
          const zoomGroup = document.getElementById('zoom-buttons-group');
          if (zoomGroup) {
            zoomGroup.style.display = 'inline-flex';
            document.querySelectorAll('.btn-zoom').forEach(btn => {
              btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-zoom').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                scannerManager.setZoom(parseFloat(btn.getAttribute('data-zoom')));
              });
            });
          }
        }
      }, 350);
    }
  }, 100);

  const handleFileUpload = async (file) => {
    const statusEl = document.getElementById('camera-status');
    if (statusEl) statusEl.innerHTML = `<span style="color:#38bdf8;">🔄 Analyzing photo...</span>`;
    try {
      const text = await scannerManager.scanImageFile(file, 'camera-reader');
      setTimeout(() => handleScannedCode(text), 300);
    } catch (err) {
      if (statusEl) statusEl.innerHTML = `<span style="color:#f87171;">⚠️ Barcode not found in photo. Try another angle or enter S/N manually.</span>`;
    }
  };

  document.getElementById('scanner-file-input')?.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileUpload(e.target.files[0]);
  });
  document.getElementById('scanner-camera-capture')?.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileUpload(e.target.files[0]);
  });

  document.querySelectorAll('.sim-tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sn = btn.getAttribute('data-sim');
      scannerManager.stop();
      handleScannedCode(sn);
    });
  });

  const closeScanner = () => {
    scannerManager.stop();
    closeModal();
  };
  document.getElementById('btn-close-scanner')?.addEventListener('click', closeScanner);
  document.getElementById('btn-stop-scanner')?.addEventListener('click', closeScanner);
}

// Borrow Checkout Modal
function openBorrowModal(prefilledSerial = '') {
  activeModal = 'borrow';
  const modalContainer = document.getElementById('modal-container');
  const posList = db.getPosList();
  const availablePos = posList.filter(p => p.status === 'AVAILABLE' || p.serialNumber === prefilledSerial);
  const staffList = db.getStaffList();

  const defaultReturn = new Date();
  defaultReturn.setDate(defaultReturn.getDate() + 3);
  defaultReturn.setHours(18, 0, 0, 0);
  const defaultReturnStr = defaultReturn.toISOString().slice(0, 16);

  modalContainer.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">
            ${Icons.checkout} Checkout Ingenico POS (Borrowing)
          </div>
          <button class="btn-close" id="btn-close-borrow">${Icons.x}</button>
        </div>

        <form id="form-borrow">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Ingenico Serial Number (S/N) *</label>
              <div class="input-with-action">
                <input 
                  type="text" 
                  class="form-input" 
                  id="borrow-serial" 
                  required 
                  placeholder="e.g. 212857310046"
                  value="${escapeHtml(prefilledSerial)}"
                  list="pos-available-datalist"
                  autocomplete="off"
                />
                <button type="button" class="btn btn-outline-cyan" id="btn-scan-for-borrow">
                  ${Icons.camera} Scan
                </button>
              </div>
              <datalist id="pos-available-datalist">
                ${availablePos.map(p => `<option value="${escapeHtml(p.serialNumber)}">${p.model} (${p.sku})</option>`).join('')}
              </datalist>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Model Name</label>
                <input type="text" class="form-input" id="borrow-model" placeholder="Auto-detected" style="opacity:0.9;" />
              </div>
              <div class="form-group">
                <label class="form-label">SKU</label>
                <input type="text" class="form-input" id="borrow-sku" placeholder="Auto-detected" style="opacity:0.9;" />
              </div>
            </div>

            <hr style="border:none; border-top:1px solid var(--border-subtle); margin:14px 0;" />

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Employee ID (EID) *</label>
                <div class="input-with-action">
                  <input type="text" class="form-input" id="borrow-emp-id" required placeholder="e.g. 90028288" list="staff-datalist" autocomplete="off" />
                  <button type="button" class="btn btn-outline-cyan" id="btn-scan-borrow-eid" title="Scan Employee ID Badge Barcode">
                    ${Icons.camera} Scan EID
                  </button>
                </div>
                <datalist id="staff-datalist">
                  ${staffList.map(s => `<option value="${escapeHtml(s.employeeId)}">${s.fullName} - ${s.branch}</option>`).join('')}
                </datalist>
              </div>
              <div class="form-group">
                <label class="form-label">Staff Full Name *</label>
                <input type="text" class="form-input" id="borrow-name" required placeholder="e.g. Somchai Chen" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Phone Number *</label>
                <input type="tel" class="form-input" id="borrow-phone" required placeholder="e.g. +66 81-892-2881" />
              </div>
              <div class="form-group">
                <label class="form-label">Email Address</label>
                <input type="email" class="form-input" id="borrow-email" placeholder="e.g. somchai@company.com" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Borrower Branch *</label>
                <input type="text" class="form-input" id="borrow-branch" required placeholder="e.g. Branch 02 - Downtown Mall" />
              </div>
              <div class="form-group">
                <label class="form-label">Expected Return Date &amp; Time *</label>
                <input type="datetime-local" class="form-input" id="borrow-return-date" required value="${defaultReturnStr}" />
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="btn-cancel-borrow">Cancel</button>
            <button type="submit" class="btn btn-primary">Confirm &amp; Check Out</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const serialInput = document.getElementById('borrow-serial');
  serialInput.addEventListener('input', () => handleBorrowSerialChange(serialInput.value));
  if (prefilledSerial) handleBorrowSerialChange(prefilledSerial);

  const empInput = document.getElementById('borrow-emp-id');
  empInput.addEventListener('input', () => {
    const staff = db.getStaffById(empInput.value);
    if (staff) {
      document.getElementById('borrow-name').value = staff.fullName || '';
      document.getElementById('borrow-phone').value = staff.phone || '';
      document.getElementById('borrow-email').value = staff.email || '';
      document.getElementById('borrow-branch').value = staff.branch || '';
    }
  });

  document.getElementById('btn-scan-for-borrow')?.addEventListener('click', () => {
    pendingBorrowSerial = serialInput ? serialInput.value : '';
    closeModal();
    openScannerModal('sn');
  });

  document.getElementById('btn-scan-borrow-eid')?.addEventListener('click', () => {
    pendingBorrowSerial = serialInput ? serialInput.value : '';
    closeModal();
    openScannerModal('borrow-eid');
  });

  document.getElementById('form-borrow')?.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const serial = normalizeIngenicoSerial(serialInput.value.trim());
      const model = document.getElementById('borrow-model').value.trim() || 'Ingenico Move/5000';
      const sku = document.getElementById('borrow-sku').value.trim() || 'ING-MOVE5000-4G';
      const empId = document.getElementById('borrow-emp-id').value.trim();
      const name = document.getElementById('borrow-name').value.trim();
      const phone = document.getElementById('borrow-phone').value.trim();
      const email = document.getElementById('borrow-email').value.trim();
      const branch = document.getElementById('borrow-branch').value.trim();
      const returnDate = document.getElementById('borrow-return-date').value;

      if (!db.getPosBySerial(serial)) {
        db.addPos({
          serialNumber: serial,
          sku: sku,
          model: model,
          brand: 'Ingenico',
          status: 'BORROWED'
        });
      }

      db.createLoan({
        serialNumber: serial,
        model: model,
        sku: sku,
        employeeId: empId,
        staffName: name,
        phone: phone,
        email: email,
        branch: branch,
        expectedReturnAt: new Date(returnDate).toISOString()
      });

      sounds.playSuccessChime();
      confetti({ particleCount: 60, spread: 60 });
      closeModal();
      renderApp();
    } catch (err) {
      sounds.playWarningBuzz();
      alert(err.message);
    }
  });

  document.getElementById('btn-close-borrow')?.addEventListener('click', closeModal);
  document.getElementById('btn-cancel-borrow')?.addEventListener('click', closeModal);
}

function handleBorrowSerialChange(serial) {
  const clean = normalizeIngenicoSerial(serial);
  const pos = db.getPosBySerial(clean);
  const modelInput = document.getElementById('borrow-model');
  const skuInput = document.getElementById('borrow-sku');

  if (pos && modelInput && skuInput) {
    modelInput.value = pos.model;
    skuInput.value = pos.sku;
  }
}

// Return Check-in Modal
function openReturnModal(prefilledSerial = '') {
  activeModal = 'return';
  const modalContainer = document.getElementById('modal-container');
  const activeLoans = db.getLoans().filter(l => l.status === 'ACTIVE' || l.status === 'OVERDUE');

  modalContainer.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">
            ${Icons.checkin} Check-in / Return Ingenico POS
          </div>
          <button class="btn-close" id="btn-close-return">${Icons.x}</button>
        </div>

        <form id="form-return">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Scan or Select Ingenico Serial Number *</label>
              <div class="input-with-action">
                <input 
                  type="text" 
                  class="form-input" 
                  id="return-serial" 
                  required 
                  placeholder="e.g. 212857310045"
                  value="${escapeHtml(prefilledSerial)}"
                  list="active-loans-datalist"
                  autocomplete="off"
                />
                <button type="button" class="btn btn-outline-cyan" id="btn-scan-for-return">
                  ${Icons.camera} Scan
                </button>
              </div>
              <datalist id="active-loans-datalist">
                ${activeLoans.map(l => `<option value="${escapeHtml(l.serialNumber)}">${l.staffName} (${l.employeeId}) - ${l.model}</option>`).join('')}
              </datalist>
            </div>

            <div id="return-loan-details" style="display:none; margin:16px 0; background:rgba(15,23,42,0.85); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:14px;"></div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Return Employee ID (Staff who returns) *</label>
                <div class="input-with-action">
                  <input type="text" class="form-input" id="return-employee-id" required placeholder="e.g. 90028288" />
                  <button type="button" class="btn btn-outline-cyan" id="btn-scan-return-eid" title="Scan Employee ID Badge Barcode">
                    ${Icons.camera} Scan EID
                  </button>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Device Physical Condition *</label>
                <select class="form-select" id="return-condition">
                  <option value="GOOD">✓ Good Condition (Complete with all accessories)</option>
                  <option value="MISSING_PARTS">⚠️ Missing Accessories (Cable/Dock)</option>
                  <option value="DAMAGED">🔴 Damaged Screen / Defective</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Return Inspection Remarks</label>
              <textarea class="form-textarea" id="return-notes" rows="2" placeholder="e.g. Verified terminal powers on and paper feed is intact."></textarea>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="btn-cancel-return">Cancel</button>
            <button type="submit" class="btn btn-success" id="btn-confirm-return-submit" disabled>
              Complete Check-in Return
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  const serialInput = document.getElementById('return-serial');
  serialInput.addEventListener('input', () => handleReturnSerialLookup(serialInput.value));
  if (prefilledSerial) handleReturnSerialLookup(prefilledSerial);

  document.getElementById('btn-scan-for-return')?.addEventListener('click', () => {
    pendingReturnSerial = serialInput ? serialInput.value : '';
    closeModal();
    openScannerModal('sn');
  });

  document.getElementById('btn-scan-return-eid')?.addEventListener('click', () => {
    pendingReturnSerial = serialInput ? serialInput.value : '';
    closeModal();
    openScannerModal('return-eid');
  });

  document.getElementById('form-return')?.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const serial = normalizeIngenicoSerial(serialInput.value.trim());
      const returnEid = document.getElementById('return-employee-id').value.trim();
      const condition = document.getElementById('return-condition').value;
      const notes = document.getElementById('return-notes').value.trim();

      db.returnLoan(serial, returnEid, condition, notes);

      sounds.playSuccessChime();
      confetti({ particleCount: 100, spread: 70 });
      closeModal();
      renderApp();
    } catch (err) {
      sounds.playWarningBuzz();
      alert(err.message);
    }
  });

  document.getElementById('btn-close-return')?.addEventListener('click', closeModal);
  document.getElementById('btn-cancel-return')?.addEventListener('click', closeModal);
}

function handleReturnSerialLookup(rawSerial) {
  const detailsBox = document.getElementById('return-loan-details');
  const submitBtn = document.getElementById('btn-confirm-return-submit');
  const returnEidInput = document.getElementById('return-employee-id');
  const clean = normalizeIngenicoSerial(rawSerial);
  const activeLoan = db.getActiveLoanBySerial(clean);

  if (activeLoan && detailsBox && submitBtn) {
    submitBtn.removeAttribute('disabled');
    if (returnEidInput && !returnEidInput.value) {
      returnEidInput.value = activeLoan.employeeId;
    }

    detailsBox.style.display = 'block';
    detailsBox.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
        <strong style="font-size:14.5px;">${escapeHtml(activeLoan.model)}</strong>
        <span class="emp-badge">Borrower ID: ${escapeHtml(activeLoan.employeeId)}</span>
      </div>
      <div style="font-size:12.5px; color:var(--text-muted);">
        👤 Borrower: <strong>${escapeHtml(activeLoan.staffName)}</strong> &bull; 📞 ${escapeHtml(activeLoan.phone)} &bull; 🏢 ${escapeHtml(activeLoan.branch)}
      </div>
      <div style="font-size:11.5px; color:var(--text-dim); margin-top:4px;">
        📅 Borrowed: ${formatDate(activeLoan.borrowedAt)} ${activeLoan.borrowTime || ''} &bull; Bundled: ${(activeLoan.products || []).length} products
      </div>
    `;
  } else if (detailsBox && submitBtn) {
    submitBtn.setAttribute('disabled', 'true');
    detailsBox.style.display = 'block';
    detailsBox.innerHTML = `
      <div style="color:#f87171; font-size:12.5px; font-weight:600;">
        ⚠️ No active loan found for S/N: "${escapeHtml(rawSerial)}". The device may already be marked as returned.
      </div>
    `;
  }
}

// Asset Label Print Modal
function openLabelModal(serialNumber) {
  activeModal = 'label';
  const modalContainer = document.getElementById('modal-container');
  const pos = db.getPosBySerial(serialNumber) || { serialNumber, model: 'Ingenico Move/5000', sku: 'ING-MOVE5000-4G' };

  modalContainer.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-card" style="max-width:440px; text-align:center;">
        <div class="modal-header">
          <div class="modal-title">Ingenico Asset Label</div>
          <button class="btn-close" id="btn-close-label">${Icons.x}</button>
        </div>

        <div class="modal-body" style="display:flex; flex-direction:column; align-items:center;">
          <div id="printable-sticker" style="background:#ffffff; color:#0f172a; padding:18px 20px; border-radius:10px; border:2px solid #0f172a; width:100%; max-width:320px; text-align:center;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #0f172a; padding-bottom:6px; margin-bottom:10px;">
              <span style="font-weight:900; font-size:14px; letter-spacing:1px; color:#0f172a;">ingenico</span>
              <span style="font-size:9.5px; font-weight:700; color:#475569; text-transform:uppercase;">Asset Tag</span>
            </div>

            <div style="font-weight:800; font-size:13.5px; margin-bottom:2px; color:#0f172a;">${escapeHtml(pos.model)}</div>
            <div style="font-size:11px; color:#475569; margin-bottom:10px; font-family:monospace;">P/N: ${escapeHtml(pos.sku)}</div>

            <img src="${getQrCodeImageUrl(pos.serialNumber, 150)}" alt="QR Code" style="width:150px; height:150px; border:1px solid #cbd5e1; border-radius:6px; margin-bottom:8px;" />

            <div>${generateBarcodeSvg(pos.serialNumber, 40, 1.8)}</div>
          </div>
        </div>

        <div class="modal-footer" style="justify-content:center; gap:10px;">
          <button class="btn btn-primary" onclick="window.print()">${Icons.printer} Print Label</button>
          <button class="btn btn-secondary" id="btn-close-label-footer">Done</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-close-label')?.addEventListener('click', closeModal);
  document.getElementById('btn-close-label-footer')?.addEventListener('click', closeModal);
}

// CSV Export
function exportToCsv() {
  const loans = db.getLoans();
  if (loans.length === 0) {
    alert('No loans to export.');
    return;
  }

  const headers = [
    'List #',
    'Status',
    'Borrower Employee ID',
    'Borrower Name',
    'Phone',
    'Email',
    'Branch',
    'SKU',
    'Product / Model',
    'Serial Number',
    'Borrow Date',
    'Borrow Time',
    'Return Employee ID',
    'Return Date',
    'Return Time',
    'Return Condition',
    'Bundled Products Count',
    'Inspection Remarks'
  ];

  const rows = loans.map(l => [
    l.listNumber || '',
    l.status,
    l.employeeId,
    `"${(l.staffName || '').replace(/"/g, '""')}"`,
    `"${l.phone || ''}"`,
    `"${l.email || ''}"`,
    `"${(l.branch || '').replace(/"/g, '""')}"`,
    l.sku,
    `"${(l.model || '').replace(/"/g, '""')}"`,
    l.serialNumber,
    l.borrowDate || '',
    l.borrowTime || '',
    l.returnEmployeeId || '',
    l.returnDate || '',
    l.returnTime || '',
    l.returnCondition || '',
    (l.products || []).length,
    `"${(l.returnNotes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `TrackPOS_Ledger_Export_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  sounds.playSuccessChime();
}

function closeModal() {
  activeModal = null;
  const modalContainer = document.getElementById('modal-container');
  if (modalContainer) modalContainer.innerHTML = '';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Bootstrap
init();

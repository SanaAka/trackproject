// Storage and data management for TrackPOS - Enterprise Ingenico Fleet Edition
const STORAGE_KEY_POS = 'trackpos_inventory_ingenico_v3';
const STORAGE_KEY_LOANS = 'trackpos_loans_ingenico_v3';
const STORAGE_KEY_STAFF = 'trackpos_staff_ingenico_v3';
const STORAGE_KEY_TELEGRAM = 'trackpos_telegram_config_v1';

export function normalizeIngenicoSerial(rawInput) {
  if (!rawInput) return '';
  let str = String(rawInput).trim();

  // Remove common barcode prefixes
  str = str.replace(/^(S\/N|SN|SERIAL|S\.N\.|12S|ING|INGENICO)[\s:\-_]*/i, '');
  
  // Extract serial if inside complex barcode data
  const matchSN = str.match(/(?:S\/N|SN|Serial)[\s:\-_]*([A-Z0-9]{8,16})/i);
  if (matchSN && matchSN[1]) {
    return matchSN[1].trim();
  }

  const numericMatch = str.match(/\b(\d{8,14})\b/);
  if (numericMatch && numericMatch[1]) {
    return numericMatch[1];
  }

  return str.trim();
}

// Default One-to-Many bundled products for each Ingenico device type
export function getDefaultBundledProducts(modelName = '', sku = '') {
  const model = modelName.toLowerCase();
  if (model.includes('move/5000') || model.includes('move 5000')) {
    return [
      { id: 'P1', name: 'Move/5000 Main Terminal Unit', sku: 'ING-M5K-MAIN', category: 'Terminal', qty: 1 },
      { id: 'P2', name: 'Ingenico Wireless Charging Dock', sku: 'ING-BASE-M5K', category: 'Docking', qty: 1 },
      { id: 'P3', name: 'Ingenico Power Supply 5V/1A', sku: 'ING-PWR-5V1A', category: 'Power', qty: 1 },
      { id: 'P4', name: 'USB-C Spiral Heavy-Duty Cable', sku: 'ING-CAB-USBC', category: 'Cable', qty: 1 },
      { id: 'P5', name: '4G Data IoT SIM Card', sku: 'SIM-4G-AIS', category: 'Connectivity', qty: 1 },
      { id: 'P6', name: 'Thermal Paper Roll 57x40mm', sku: 'ACC-ROLL-5740', category: 'Consumable', qty: 2 }
    ];
  } else if (model.includes('move/3500') || model.includes('move 3500')) {
    return [
      { id: 'P1', name: 'Move/3500 Compact Terminal', sku: 'ING-M3500-MAIN', category: 'Terminal', qty: 1 },
      { id: 'P2', name: 'Power Adapter 5V', sku: 'ING-PWR-5V1A', category: 'Power', qty: 1 },
      { id: 'P3', name: 'Micro-USB Cable', sku: 'ING-CAB-MUSB', category: 'Cable', qty: 1 },
      { id: 'P4', name: 'Thermal Paper Roll 57x40mm', sku: 'ACC-ROLL-5740', category: 'Consumable', qty: 1 }
    ];
  } else if (model.includes('axium') || model.includes('dx8000')) {
    return [
      { id: 'P1', name: 'AXIUM DX8000 Smart Android Terminal', sku: 'ING-DX8K-MAIN', category: 'Terminal', qty: 1 },
      { id: 'P2', name: 'Fast-Charge Power Adapter 5V/2A', sku: 'ING-PWR-5V2A', category: 'Power', qty: 1 },
      { id: 'P3', name: 'USB-C Charging Cable', sku: 'ING-CAB-USBC', category: 'Cable', qty: 1 },
      { id: 'P4', name: '4G LTE SIM Card', sku: 'SIM-4G-TRUE', category: 'Connectivity', qty: 1 },
      { id: 'P5', name: 'Thermal Paper Roll 57x40mm', sku: 'ACC-ROLL-5740', category: 'Consumable', qty: 2 }
    ];
  } else if (model.includes('desk/5000') || model.includes('desk 5000')) {
    return [
      { id: 'P1', name: 'Desk/5000 Countertop Terminal', sku: 'ING-D5K-MAIN', category: 'Terminal', qty: 1 },
      { id: 'P2', name: 'Magic Box Multiplexer (Power + Eth + RS232)', sku: 'ING-MAGIC-BOX', category: 'Interface', qty: 1 },
      { id: 'P3', name: 'Cat6 Shielded Ethernet Cable (2m)', sku: 'CAB-ETH-CAT6', category: 'Network', qty: 1 },
      { id: 'P4', name: 'External Power Supply 8V/2A', sku: 'ING-PWR-8V', category: 'Power', qty: 1 }
    ];
  } else {
    return [
      { id: 'P1', name: `${modelName || 'POS Terminal'} Main Unit`, sku: sku || 'POS-UNIT', category: 'Terminal', qty: 1 },
      { id: 'P2', name: 'Power Adapter', sku: 'ACC-PWR', category: 'Power', qty: 1 },
      { id: 'P3', name: 'Connecting Cable', sku: 'ACC-CAB', category: 'Cable', qty: 1 }
    ];
  }
}

// Initial Ingenico Fleet Seed Data with One-to-Many bundled products
const DEFAULT_INGENICO_ITEMS = [
  {
    serialNumber: '212857310045',
    sku: 'ING-MOVE5000-4G',
    model: 'Ingenico Move/5000 4G/WiFi/BT',
    brand: 'Ingenico',
    type: 'High-Performance Wireless POS Terminal',
    status: 'BORROWED',
    homeBranch: 'HQ Central Inventory',
    products: getDefaultBundledProducts('Ingenico Move/5000 4G/WiFi/BT', 'ING-MOVE5000-4G'),
    createdAt: '2026-08-15T08:00:00.000Z'
  },
  {
    serialNumber: '212857310046',
    sku: 'ING-MOVE5000-4G',
    model: 'Ingenico Move/5000 4G/WiFi/BT',
    brand: 'Ingenico',
    type: 'High-Performance Wireless POS Terminal',
    status: 'AVAILABLE',
    homeBranch: 'HQ Central Inventory',
    products: getDefaultBundledProducts('Ingenico Move/5000 4G/WiFi/BT', 'ING-MOVE5000-4G'),
    createdAt: '2026-08-15T08:00:00.000Z'
  },
  {
    serialNumber: '220817349120',
    sku: 'ING-MOVE3500-WIFI',
    model: 'Ingenico Move/3500 Compact Wireless',
    brand: 'Ingenico',
    type: 'Portable Mobile Payment Terminal',
    status: 'OVERDUE',
    homeBranch: 'HQ Central Inventory',
    products: getDefaultBundledProducts('Ingenico Move/3500 Compact Wireless', 'ING-MOVE3500-WIFI'),
    createdAt: '2026-08-20T08:00:00.000Z'
  },
  {
    serialNumber: '231847302914',
    sku: 'ING-AXIUM-DX8000',
    model: 'Ingenico AXIUM DX8000 Android POS',
    brand: 'Ingenico',
    type: 'Smart Android Touchscreen Terminal with Camera & Printer',
    status: 'AVAILABLE',
    homeBranch: 'HQ Central Inventory',
    products: getDefaultBundledProducts('Ingenico AXIUM DX8000 Android POS', 'ING-AXIUM-DX8000'),
    createdAt: '2026-08-25T08:00:00.000Z'
  },
  {
    serialNumber: '231847302915',
    sku: 'ING-AXIUM-DX8000',
    model: 'Ingenico AXIUM DX8000 Android POS',
    brand: 'Ingenico',
    type: 'Smart Android Touchscreen Terminal with Camera & Printer',
    status: 'AVAILABLE',
    homeBranch: 'HQ Central Inventory',
    products: getDefaultBundledProducts('Ingenico AXIUM DX8000 Android POS', 'ING-AXIUM-DX8000'),
    createdAt: '2026-08-25T08:00:00.000Z'
  },
  {
    serialNumber: '191427301923',
    sku: 'ING-DESK5000-ETH',
    model: 'Ingenico Desk/5000 Countertop',
    brand: 'Ingenico',
    type: 'Countertop Terminal with Contactless & Multimedia Screen',
    status: 'AVAILABLE',
    homeBranch: 'HQ Central Inventory',
    products: getDefaultBundledProducts('Ingenico Desk/5000 Countertop', 'ING-DESK5000-ETH'),
    createdAt: '2026-09-01T08:00:00.000Z'
  },
  {
    serialNumber: '201127381204',
    sku: 'ING-LANE3000-USB',
    model: 'Ingenico Lane/3000 Retail PIN Pad',
    brand: 'Ingenico',
    type: 'High-Volume Retail Lane PIN Pad',
    status: 'AVAILABLE',
    homeBranch: 'HQ Central Inventory',
    products: [
      { id: 'P1', name: 'Lane/3000 PIN Pad Unit', sku: 'ING-L3K-MAIN', category: 'PIN Pad', qty: 1 },
      { id: 'P2', name: 'Powered USB Host Cable (2m)', sku: 'ING-CAB-PUSB', category: 'Cable', qty: 1 }
    ],
    createdAt: '2026-09-05T08:00:00.000Z'
  },
  {
    serialNumber: '232047381920',
    sku: 'ING-LINK2500-BT',
    model: 'Ingenico Link/2500 mPOS Companion',
    brand: 'Ingenico',
    type: 'Bluetooth Pocket Card Reader',
    status: 'AVAILABLE',
    homeBranch: 'HQ Central Inventory',
    products: [
      { id: 'P1', name: 'Link/2500 Bluetooth Reader', sku: 'ING-L2500-MAIN', category: 'mPOS', qty: 1 },
      { id: 'P2', name: 'USB-C Charging Cable', sku: 'ING-CAB-USBC', category: 'Cable', qty: 1 }
    ],
    createdAt: '2026-09-10T08:00:00.000Z'
  }
];

const DEFAULT_STAFF = [
  {
    employeeId: '90028288',
    fullName: 'Somchai Chen',
    phone: '+66 81-892-2881',
    email: 'somchai.chen@company.com',
    branch: 'Branch 02 - Downtown Mall',
    department: 'F&B Operations'
  },
  {
    employeeId: '90014720',
    fullName: 'Elena Rodriguez',
    phone: '+66 82-441-0982',
    email: 'elena.r@company.com',
    branch: 'Branch 05 - West Terminal',
    department: 'Retail Sales'
  },
  {
    employeeId: '90033104',
    fullName: 'Marcus Vance',
    phone: '+66 89-772-1144',
    email: 'marcus.v@company.com',
    branch: 'Branch 01 - Flagship Store',
    department: 'Events & Pop-up'
  },
  {
    employeeId: '90019283',
    fullName: 'Anya Kowalski',
    phone: '+66 83-552-9901',
    email: 'anya.k@company.com',
    branch: 'Branch 03 - Airport Station',
    department: 'Customer Service'
  }
];

const now = new Date();
const hoursAgo = (h) => new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();
const daysAgo = (d) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();
const daysLater = (d) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000).toISOString();

const DEFAULT_LOANS = [
  {
    id: 'LN-ING-2026-001',
    listNumber: 1,
    serialNumber: '212857310045',
    sku: 'ING-MOVE5000-4G',
    model: 'Ingenico Move/5000 4G/WiFi/BT',
    brand: 'Ingenico',
    employeeId: '90028288',
    staffName: 'Somchai Chen',
    phone: '+66 81-892-2881',
    email: 'somchai.chen@company.com',
    branch: 'Branch 02 - Downtown Mall',
    department: 'F&B Operations',
    borrowedAt: hoursAgo(5),
    borrowDate: hoursAgo(5).slice(0, 10),
    borrowTime: '10:30',
    expectedReturnAt: daysLater(3),
    returnEmployeeId: null,
    returnedAt: null,
    returnDate: null,
    returnTime: null,
    status: 'ACTIVE',
    products: getDefaultBundledProducts('Ingenico Move/5000 4G/WiFi/BT', 'ING-MOVE5000-4G'),
    purpose: 'Weekend food festival temporary counter lane',
    returnCondition: null,
    returnNotes: null
  },
  {
    id: 'LN-ING-2026-002',
    listNumber: 2,
    serialNumber: '220817349120',
    sku: 'ING-MOVE3500-WIFI',
    model: 'Ingenico Move/3500 Compact Wireless',
    brand: 'Ingenico',
    employeeId: '90014720',
    staffName: 'Elena Rodriguez',
    phone: '+66 82-441-0982',
    email: 'elena.r@company.com',
    branch: 'Branch 05 - West Terminal',
    department: 'Retail Sales',
    borrowedAt: daysAgo(4),
    borrowDate: daysAgo(4).slice(0, 10),
    borrowTime: '09:15',
    expectedReturnAt: daysAgo(1),
    returnEmployeeId: null,
    returnedAt: null,
    returnDate: null,
    returnTime: null,
    status: 'OVERDUE',
    products: getDefaultBundledProducts('Ingenico Move/3500 Compact Wireless', 'ING-MOVE3500-WIFI'),
    purpose: 'Temporary promotion pop-up lane',
    returnCondition: null,
    returnNotes: null
  },
  {
    id: 'LN-ING-2026-003',
    listNumber: 3,
    serialNumber: '191427301923',
    sku: 'ING-DESK5000-ETH',
    model: 'Ingenico Desk/5000 Countertop',
    brand: 'Ingenico',
    employeeId: '90033104',
    staffName: 'Marcus Vance',
    phone: '+66 89-772-1144',
    email: 'marcus.v@company.com',
    branch: 'Branch 01 - Flagship Store',
    department: 'Events & Pop-up',
    borrowedAt: daysAgo(2),
    borrowDate: daysAgo(2).slice(0, 10),
    borrowTime: '14:00',
    expectedReturnAt: daysAgo(1),
    returnEmployeeId: '90019283',
    returnedAt: hoursAgo(3),
    returnDate: hoursAgo(3).slice(0, 10),
    returnTime: '18:20',
    status: 'RETURNED',
    products: getDefaultBundledProducts('Ingenico Desk/5000 Countertop', 'ING-DESK5000-ETH'),
    purpose: 'VIP customer private room checkout',
    returnCondition: 'GOOD',
    returnNotes: 'Returned in mint condition with all Magic Box cables intact'
  }
];

const DEFAULT_TELEGRAM_CONFIG = {
  botToken: '',
  chatId: '',
  autoDailyReport: true,
  scheduledTime: '18:00',
  lastSentDate: null
};

class StorageService {
  constructor() {
    this.init();
  }

  init() {
    if (!localStorage.getItem(STORAGE_KEY_POS)) {
      this.savePosList(DEFAULT_INGENICO_ITEMS);
    }
    if (!localStorage.getItem(STORAGE_KEY_LOANS)) {
      this.saveLoans(DEFAULT_LOANS);
    }
    if (!localStorage.getItem(STORAGE_KEY_STAFF)) {
      this.saveStaffList(DEFAULT_STAFF);
    }
    if (!localStorage.getItem(STORAGE_KEY_TELEGRAM)) {
      this.saveTelegramConfig(DEFAULT_TELEGRAM_CONFIG);
    }
  }

  resetToDefault() {
    this.savePosList(DEFAULT_INGENICO_ITEMS);
    this.saveLoans(DEFAULT_LOANS);
    this.saveStaffList(DEFAULT_STAFF);
    this.saveTelegramConfig(DEFAULT_TELEGRAM_CONFIG);
  }

  // POS Inventory (One-to-Many products mapping)
  getPosList() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_POS);
      return data ? JSON.parse(data) : DEFAULT_INGENICO_ITEMS;
    } catch {
      return DEFAULT_INGENICO_ITEMS;
    }
  }

  savePosList(list) {
    localStorage.setItem(STORAGE_KEY_POS, JSON.stringify(list));
  }

  getPosBySerial(rawSerial) {
    const list = this.getPosList();
    const clean = normalizeIngenicoSerial(rawSerial).toLowerCase();
    return list.find(item => {
      const itemClean = normalizeIngenicoSerial(item.serialNumber).toLowerCase();
      return itemClean === clean || item.serialNumber.toLowerCase() === (rawSerial || '').trim().toLowerCase();
    });
  }

  addPos(pos) {
    const list = this.getPosList();
    const clean = normalizeIngenicoSerial(pos.serialNumber);
    if (this.getPosBySerial(clean)) {
      throw new Error(`Ingenico S/N ${clean} already exists in fleet inventory.`);
    }
    const newPos = {
      ...pos,
      serialNumber: clean,
      brand: pos.brand || 'Ingenico',
      products: pos.products && pos.products.length > 0 ? pos.products : getDefaultBundledProducts(pos.model, pos.sku),
      createdAt: new Date().toISOString()
    };
    list.unshift(newPos);
    this.savePosList(list);
    return newPos;
  }

  updatePos(serialNumber, updatedFields) {
    const list = this.getPosList();
    const clean = normalizeIngenicoSerial(serialNumber).toLowerCase();
    const idx = list.findIndex(p => normalizeIngenicoSerial(p.serialNumber).toLowerCase() === clean);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...updatedFields };
      this.savePosList(list);
      return list[idx];
    }
    return null;
  }

  updatePosStatus(rawSerial, newStatus) {
    const list = this.getPosList();
    const clean = normalizeIngenicoSerial(rawSerial).toLowerCase();
    const item = list.find(p => {
      return normalizeIngenicoSerial(p.serialNumber).toLowerCase() === clean ||
             p.serialNumber.toLowerCase() === rawSerial.toLowerCase();
    });
    if (item) {
      item.status = newStatus;
      this.savePosList(list);
    }
  }

  addBundledProduct(serialNumber, product) {
    const list = this.getPosList();
    const clean = normalizeIngenicoSerial(serialNumber).toLowerCase();
    const item = list.find(p => normalizeIngenicoSerial(p.serialNumber).toLowerCase() === clean);
    if (!item) throw new Error(`POS with serial ${serialNumber} not found.`);
    if (!item.products) item.products = [];
    const newProd = {
      id: 'P-' + Date.now().toString(36),
      name: product.name,
      sku: product.sku || 'ACC-GEN',
      category: product.category || 'Accessory',
      qty: parseInt(product.qty) || 1
    };
    item.products.push(newProd);
    this.savePosList(list);
    return item;
  }

  removeBundledProduct(serialNumber, productIndex) {
    const list = this.getPosList();
    const clean = normalizeIngenicoSerial(serialNumber).toLowerCase();
    const item = list.find(p => normalizeIngenicoSerial(p.serialNumber).toLowerCase() === clean);
    if (!item) throw new Error(`POS with serial ${serialNumber} not found.`);
    if (item.products && item.products[productIndex]) {
      item.products.splice(productIndex, 1);
      this.savePosList(list);
    }
    return item;
  }

  // Loans
  getLoans() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_LOANS);
      const list = data ? JSON.parse(data) : DEFAULT_LOANS;
      
      const current = new Date();
      return list.map(loan => {
        if (!loan.returnedAt && loan.expectedReturnAt) {
          const expected = new Date(loan.expectedReturnAt);
          if (current > expected && loan.status !== 'OVERDUE') {
            loan.status = 'OVERDUE';
          }
        }
        return loan;
      }).sort((a, b) => new Date(b.borrowedAt || 0) - new Date(a.borrowedAt || 0));
    } catch {
      return DEFAULT_LOANS;
    }
  }

  saveLoans(loans) {
    localStorage.setItem(STORAGE_KEY_LOANS, JSON.stringify(loans));
  }

  getDeviceHistory(rawSerial) {
    const clean = normalizeIngenicoSerial(rawSerial).toLowerCase();
    const loans = this.getLoans();
    return loans.filter(l => {
      const loanClean = normalizeIngenicoSerial(l.serialNumber).toLowerCase();
      return loanClean === clean || l.serialNumber.toLowerCase() === (rawSerial || '').trim().toLowerCase();
    }).sort((a, b) => new Date(b.borrowedAt) - new Date(a.borrowedAt));
  }

  getActiveLoanBySerial(rawSerial) {
    const loans = this.getLoans();
    const clean = normalizeIngenicoSerial(rawSerial).toLowerCase();
    return loans.find(l => {
      const loanClean = normalizeIngenicoSerial(l.serialNumber).toLowerCase();
      const match = loanClean === clean || l.serialNumber.toLowerCase() === (rawSerial || '').trim().toLowerCase();
      return match && !l.returnedAt && (l.status === 'ACTIVE' || l.status === 'OVERDUE');
    });
  }

  createLoan(loanData) {
    const cleanSerial = normalizeIngenicoSerial(loanData.serialNumber);
    const loans = this.getLoans();
    const existingActive = this.getActiveLoanBySerial(cleanSerial);
    if (existingActive) {
      throw new Error(`Ingenico device S/N "${cleanSerial}" is currently already borrowed by ${existingActive.staffName} (Emp ID: ${existingActive.employeeId}). It must be checked-in first.`);
    }

    const pos = this.getPosBySerial(cleanSerial);
    const bundledProducts = pos ? pos.products : getDefaultBundledProducts(loanData.model, loanData.sku);

    const nowD = new Date();
    const newLoan = {
      id: `LN-ING-${nowD.getFullYear()}-${String(loans.length + 1).padStart(3, '0')}`,
      listNumber: loans.length + 1,
      ...loanData,
      serialNumber: cleanSerial,
      brand: loanData.brand || 'Ingenico',
      products: bundledProducts,
      borrowedAt: nowD.toISOString(),
      borrowDate: nowD.toISOString().slice(0, 10),
      borrowTime: nowD.toTimeString().slice(0, 5),
      returnEmployeeId: null,
      returnedAt: null,
      returnDate: null,
      returnTime: null,
      status: 'ACTIVE'
    };

    loans.unshift(newLoan);
    this.saveLoans(loans);

    this.updatePosStatus(cleanSerial, 'BORROWED');

    this.upsertStaff({
      employeeId: loanData.employeeId,
      fullName: loanData.staffName,
      phone: loanData.phone,
      email: loanData.email,
      branch: loanData.branch,
      department: loanData.department
    });

    return newLoan;
  }

  // Update existing loan (Can edit name, time, date, employee IDs, etc.)
  updateLoan(loanId, fields) {
    const loans = this.getLoans();
    const idx = loans.findIndex(l => l.id === loanId);
    if (idx >= 0) {
      loans[idx] = { ...loans[idx], ...fields };
      this.saveLoans(loans);
      return loans[idx];
    }
    throw new Error(`Loan ID ${loanId} not found.`);
  }

  deleteLoan(loanId) {
    let loans = this.getLoans();
    const target = loans.find(l => l.id === loanId);
    if (target && !target.returnedAt) {
      this.updatePosStatus(target.serialNumber, 'AVAILABLE');
    }
    loans = loans.filter(l => l.id !== loanId);
    this.saveLoans(loans);
  }

  returnLoan(rawSerial, returnEmployeeId = '', returnCondition = 'GOOD', returnNotes = '') {
    const cleanSerial = normalizeIngenicoSerial(rawSerial);
    const loans = this.getLoans();
    const loan = loans.find(l => {
      const loanClean = normalizeIngenicoSerial(l.serialNumber).toLowerCase();
      return (loanClean === cleanSerial.toLowerCase() || l.serialNumber.toLowerCase() === rawSerial.toLowerCase()) && !l.returnedAt;
    });

    if (!loan) {
      throw new Error(`No active loan found for Ingenico S/N: "${rawSerial}". The device may already be marked as returned.`);
    }

    const nowD = new Date();
    loan.returnedAt = nowD.toISOString();
    loan.returnDate = nowD.toISOString().slice(0, 10);
    loan.returnTime = nowD.toTimeString().slice(0, 5);
    loan.returnEmployeeId = returnEmployeeId || loan.employeeId;
    loan.status = 'RETURNED';
    loan.returnCondition = returnCondition;
    loan.returnNotes = returnNotes;

    this.saveLoans(loans);

    const newPosStatus = returnCondition === 'DAMAGED' ? 'MAINTENANCE' : 'AVAILABLE';
    this.updatePosStatus(cleanSerial, newPosStatus);

    return loan;
  }

  // Staff Directory
  getStaffList() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_STAFF);
      return data ? JSON.parse(data) : DEFAULT_STAFF;
    } catch {
      return DEFAULT_STAFF;
    }
  }

  saveStaffList(list) {
    localStorage.setItem(STORAGE_KEY_STAFF, JSON.stringify(list));
  }

  getStaffById(empId) {
    const list = this.getStaffList();
    return list.find(s => (s.employeeId || '').trim() === (empId || '').trim());
  }

  upsertStaff(staff) {
    if (!staff.employeeId) return;
    const list = this.getStaffList();
    const idx = list.findIndex(s => s.employeeId.trim() === staff.employeeId.trim());
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...staff };
    } else {
      list.push(staff);
    }
    this.saveStaffList(list);
  }

  // Telegram Bot Settings & Integration
  getTelegramConfig() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_TELEGRAM);
      return data ? JSON.parse(data) : DEFAULT_TELEGRAM_CONFIG;
    } catch {
      return DEFAULT_TELEGRAM_CONFIG;
    }
  }

  saveTelegramConfig(config) {
    localStorage.setItem(STORAGE_KEY_TELEGRAM, JSON.stringify(config));
  }

  async sendTelegramReportNow() {
    const config = this.getTelegramConfig();
    if (!config.botToken || !config.chatId) {
      throw new Error('Telegram Bot Token or Chat ID is not configured. Please fill them in the Export & Telegram tab.');
    }

    const loans = this.getLoans();
    const posList = this.getPosList();
    const active = loans.filter(l => l.status === 'ACTIVE');
    const overdue = loans.filter(l => l.status === 'OVERDUE');
    const returnedToday = loans.filter(l => l.status === 'RETURNED' && l.returnDate === new Date().toISOString().slice(0, 10));

    const message = `
📊 *TrackPOS Daily Fleet & Dispatch Audit Report*
📅 *Date:* ${new Date().toLocaleDateString('en-US', { dateStyle: 'full' })}

📦 *POS Fleet Summary:*
• Total Registered: *${posList.length} Units*
• Available in Stock: *${posList.filter(p => p.status === 'AVAILABLE').length}*
• Currently Borrowed: *${active.length}*
• Overdue Warnings: *${overdue.length}* ⚠️

📑 *Active Loans in Field:*
${active.slice(0, 5).map(l => `• *${l.model}* (\`${l.serialNumber}\`)\n  👤 Borrowed by: *${l.staffName}* (ID: \`${l.employeeId}\`)\n  🏢 ${l.branch}\n  📞 ${l.phone}`).join('\n\n') || '_No active loans_'}

${overdue.length > 0 ? `🚨 *OVERDUE ALERTS:*
${overdue.map(o => `• *${o.model}* (\`${o.serialNumber}\`) - Due: ${o.expectedReturnAt?.slice(0,10)} - ${o.staffName} (${o.phone})`).join('\n')}` : '✅ *No overdue devices today!*'}

🔄 *Returned Today:* ${returnedToday.length} terminals
_Auto-generated by TrackPOS Pro System_
    `.trim();

    const url = `https://api.telegram.org/bot${encodeURIComponent(config.botToken)}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    const resJson = await response.json();
    if (!resJson.ok) {
      throw new Error(resJson.description || 'Telegram Bot API error');
    }

    config.lastSentDate = new Date().toISOString();
    this.saveTelegramConfig(config);
    return resJson;
  }
}

export const db = new StorageService();

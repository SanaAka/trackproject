const apiBase = '';
const loginView = document.querySelector('#login-view');
const adminView = document.querySelector('#admin-view');
const loginError = document.querySelector('#login-error');
const status = document.querySelector('#admin-status');
let branches = [];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
async function api(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) } });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? 'Request failed');
  return body;
}
function showStatus(message, isError = false) { status.textContent = message; status.style.color = isError ? '#b63232' : '#27633e'; }

async function loadBranches() {
  const response = await api('/api/admin/branches');
  branches = response.branches;
  document.querySelector('#branch-list').innerHTML = branches.map((branch) => `<li class="record"><span>${escapeHtml(branch.name)}</span></li>`).join('') || '<p>No branches yet.</p>';
  document.querySelector('#branch-select').innerHTML = branches.map((branch) => `<option value="${branch.id}">${escapeHtml(branch.name)}</option>`).join('');
}
async function loadStaff() {
  const response = await api('/api/admin/staff');
  document.querySelector('#staff-list').innerHTML = response.staff.map((person) => `<div class="record"><span><strong>${escapeHtml(person.name)} <small>${escapeHtml(person.employeeId)}</small></strong><small>${escapeHtml(person.role)} / ${escapeHtml(person.branch.name)} / ${person.active ? 'active' : 'inactive'}</small></span><span class="record-actions"><button data-action="pin" data-id="${person.id}" class="secondary">Reset PIN</button><button data-action="active" data-id="${person.id}" class="secondary">${person.active ? 'Deactivate' : 'Activate'}</button></span></div>`).join('') || '<p>No staff yet.</p>';
}
async function refresh() { await loadBranches(); await loadStaff(); }

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); loginError.textContent = '';
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const response = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
    if (response.staff.role !== 'ADMIN') throw new Error('Admin role required');
    loginView.hidden = true; adminView.hidden = false;
    document.querySelector('#session-summary').textContent = `${response.staff.name} / ${response.staff.branch.name}`;
    await refresh();
  } catch (error) { loginError.textContent = error.message; }
});
document.querySelector('#logout-button').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); location.reload(); });
document.querySelector('#refresh-branches').addEventListener('click', () => refresh().catch((error) => showStatus(error.message, true)));
document.querySelector('#refresh-staff').addEventListener('click', () => refresh().catch((error) => showStatus(error.message, true)));
document.querySelector('#branch-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await api('/api/admin/branches', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); event.currentTarget.reset(); await refresh(); showStatus('Branch created.'); } catch (error) { showStatus(error.message, true); } });
document.querySelector('#staff-form').addEventListener('submit', async (event) => { event.preventDefault(); try { const data = Object.fromEntries(new FormData(event.currentTarget)); data.branchId = Number(data.branchId); await api('/api/admin/staff', { method: 'POST', body: JSON.stringify(data) }); event.currentTarget.reset(); await refresh(); showStatus('Staff account created.'); } catch (error) { showStatus(error.message, true); } });
document.querySelector('#staff-list').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]'); if (!button) return;
  try {
    if (button.dataset.action === 'pin') { const pin = window.prompt('New PIN'); if (!pin) return; await api(`/api/admin/staff/${button.dataset.id}/pin`, { method: 'POST', body: JSON.stringify({ pin }) }); showStatus('PIN reset.'); }
    if (button.dataset.action === 'active') { const active = button.textContent === 'Activate'; await api(`/api/admin/staff/${button.dataset.id}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }); await loadStaff(); showStatus(`Account ${active ? 'activated' : 'deactivated'}.`); }
  } catch (error) { showStatus(error.message, true); }
});
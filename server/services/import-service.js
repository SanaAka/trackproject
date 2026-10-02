import ExcelJS from 'exceljs';
import { classifyCode, modelHint, normalizeCode } from '../../shared/codes.js';

const SHEETS = {
  DX8000: { name: 'DX8000 Stock Management', serials: [2, 7], firstQty: 3, outQty: 9, date: 4, branch: 5, asset: 13, remark: 13, merchant: 8 },
  A8: { name: 'A8 Stock Management', serials: [3, 8], firstQty: 4, outQty: 10, date: 5, branch: 6, asset: 16, remark: 14, merchant: 9 },
  T6: { name: 'TOPWISE T6', serials: [3, 8], firstQty: 4, outQty: 10, date: 5, branch: 6, asset: 15, remark: 14, merchant: 9 }
};

const issue = (report, severity, code, message, decision, detail = {}) => report.issues.push({ severity, code, message, decision, ...detail });
function value(row, column) { return row.getCell(column).value; }
function display(cellValue) { return cellValue instanceof Date ? cellValue.toISOString() : String(cellValue ?? '').trim(); }

export function parseBusinessDate(input) {
  if (input instanceof Date && !Number.isNaN(input.valueOf())) return input;
  const raw = String(input ?? '').trim();
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*([AP]M)$/i);
  if (match) {
    const [, month, day, year, hour, minute, second, meridiem] = match;
    let hours = Number(hour) % 12;
    if (meridiem.toUpperCase() === 'PM') hours += 12;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), hours - 7, Number(minute), Number(second)));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function extractAsset(raw) { return String(raw ?? '').match(/\b\d{8,9}\b/)?.[0] ?? null; }
function rowSerial(row, columns) {
  for (const column of columns) {
    const raw = display(value(row, column));
    if (!raw) continue;
    const normalized = normalizeCode(raw);
    if (classifyCode(normalized).type === 'serial') return { raw, normalized };
  }
  return null;
}

export async function inspectWorkbook(input) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input);
  const report = { sheets: [], issues: [], counts: {}, devices: [], borrows: [] };
  const seen = new Map();
  const seenAssets = new Map();
  for (const [model, config] of Object.entries(SHEETS)) {
    const sheet = workbook.getWorksheet(config.name);
    if (!sheet) {
      issue(report, 'error', 'MISSING_SHEET', `Missing sheet: ${config.name}`, 'No rows loaded', { model });
      continue;
    }
    const headers = Array.from({ length: sheet.columnCount }, (_, index) => display(value(sheet.getRow(3), index + 1)));
    report.sheets.push({ model, name: config.name, headers, rowCount: 0 });
    let sortNo = 0;
    for (let rowNumber = 4; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const cells = Array.from({ length: sheet.columnCount }, (_, index) => value(row, index + 1));
      if (cells.every((cell) => cell === null || cell === undefined || cell === '')) continue;
      if (cells.map(display).join(' ').toLowerCase().includes('total')) {
        issue(report, 'warning', 'TOTAL_ROW', `Total row found at ${config.name}:${rowNumber}`, 'Excluded from device load', { model, rowNumber });
        continue;
      }
      const serialCell = rowSerial(row, config.serials);
      if (!serialCell) {
        issue(report, 'error', 'MISSING_SERIAL', `No serial number at ${config.name}:${rowNumber}`, 'Excluded from device load', { model, rowNumber });
        continue;
      }
      const classified = classifyCode(serialCell.normalized);
      if (classified.type !== 'serial') {
        issue(report, 'error', 'INVALID_SERIAL', `Invalid serial "${serialCell.raw}"`, 'Excluded from device load', { model, rowNumber });
        continue;
      }
      if (model !== 'T6' && classified.value.length !== 12) issue(report, 'warning', 'MODEL_SERIAL_LENGTH', `${model} serial ${classified.value} has ${classified.value.length} characters`, 'Loaded unchanged for review', { model, rowNumber });
      if (modelHint(classified.value) && modelHint(classified.value) !== model) issue(report, 'warning', 'MODEL_MISMATCH', `${classified.value} hints at ${modelHint(classified.value)} but is on ${model}`, 'Loaded with workbook model', { model, rowNumber });
      if (seen.has(classified.value)) {
        issue(report, 'error', 'DUPLICATE_SERIAL', `Duplicate serial ${classified.value}`, 'Excluded duplicate row', { model, rowNumber, first: seen.get(classified.value) });
        continue;
      }
      seen.set(classified.value, `${config.name}:${rowNumber}`);
      sortNo += 1;
      const firstQty = Number(value(row, config.firstQty)) || 0;
      const outQty = Number(value(row, config.outQty)) || 0;
      const date = parseBusinessDate(value(row, config.date));
      if (value(row, config.date) && !date) {
        issue(report, 'error', 'INVALID_DATE', `Invalid date at ${config.name}:${rowNumber}`, 'Loaded as in-stock without a borrow date', { model, rowNumber });
      }
      const rawRemark = display(value(row, config.remark));
      const assetCode = model === 'DX8000' ? extractAsset(rawRemark) : display(value(row, config.asset)) || null;
      const remark = model === 'DX8000' && assetCode ? rawRemark.replace(assetCode, '').replace(/^\s*[-:]\s*/, '').trim() || null : rawRemark || null;
      const state = firstQty === 1 ? 'IN_STOCK' : outQty === 1 || date ? 'BORROWED' : 'IN_STOCK';
      const branchValue = display(value(row, config.branch));
      if (!branchValue || branchValue.toLowerCase() === 'branch') issue(report, 'warning', 'BRANCH_NORMALIZED', `Blank/generic branch at ${config.name}:${rowNumber}`, 'Used HOME_BRANCH', { model, rowNumber });
      if (assetCode && seenAssets.has(assetCode)) {
        issue(report, 'error', 'DUPLICATE_ASSET', `Duplicate asset code ${assetCode}`, 'Excluded duplicate row', { model, rowNumber, first: seenAssets.get(assetCode) });
        continue;
      }
      if (assetCode) seenAssets.set(assetCode, `${config.name}:${rowNumber}`);
      const merchantName = display(value(row, config.merchant)) || null;
      if (state === 'IN_STOCK' && merchantName) issue(report, 'warning', 'MERCHANT_ON_STOCK', `In-stock row has merchant text at ${config.name}:${rowNumber}`, 'Kept merchant text for review', { model, rowNumber });
      const device = { model, serial: classified.value, assetCode, state, stockInDate: null, remark, merchantName, statusText: model === 'A8' ? display(value(row, 15)) || null : null, sortNo };
      report.devices.push(device);
      if (state === 'BORROWED') report.borrows.push({ serial: device.serial, borrowedAt: date ?? new Date(0), branch: branchValue || 'HOME_BRANCH' });
      report.counts[model] ??= { total: 0, out: 0, inStock: 0 };
      report.counts[model].total += 1;
      report.counts[model][state === 'BORROWED' ? 'out' : 'inStock'] += 1;
      report.sheets.at(-1).rowCount += 1;
    }
  }
  report.summary = Object.fromEntries(Object.entries(report.counts).map(([model, counts]) => [model, { ...counts, issueCount: report.issues.filter((item) => item.model === model).length }]));
  return report;
}

export async function importWorkbook({ input, prisma, dryRun = true, confirm = false, homeBranch = 'Branch 001' }) {
  const report = await inspectWorkbook(input);
  report.mode = dryRun ? 'dry-run' : 'import';
  if (dryRun) return report;
  const existingEvents = await prisma.deviceEvent.count();
  if (existingEvents > 0 && !confirm) {
    issue(report, 'error', 'IMPORT_BLOCKED', 'Scan/import history already exists', 'No database changes made; explicit confirmation required');
    report.blocked = true;
    return report;
  }
  await prisma.$transaction(async (tx) => {
    const branch = await tx.branch.upsert({ where: { name: homeBranch }, update: {}, create: { name: homeBranch } });
    let importStaff = await tx.staff.findFirst({ where: { active: true }, orderBy: { id: 'asc' } });
    if (!importStaff && report.borrows.length > 0) {
      importStaff = await tx.staff.upsert({ where: { employeeId: 'IMPORT' }, update: {}, create: { employeeId: 'IMPORT', name: 'Workbook Import', branchId: branch.id, role: 'ADMIN', pinHash: 'UNAVAILABLE', active: false } });
    }
    for (const device of report.devices) {
      const created = await tx.device.create({ data: { ...device, assetCode: device.assetCode || null, stockInDate: new Date() } });
      const borrow = report.borrows.find((item) => item.serial === device.serial);
      if (borrow) {
        const record = await tx.borrow.create({ data: { deviceId: created.id, staffId: importStaff.id, branchId: branch.id, borrowedAt: borrow.borrowedAt } });
        await tx.deviceEvent.create({ data: { deviceId: created.id, type: 'BORROW', at: borrow.borrowedAt, staffId: importStaff.id, detail: JSON.stringify({ import: true, borrowId: record.id }) } });
      }
      await tx.deviceEvent.create({ data: { deviceId: created.id, type: 'IMPORT', at: new Date(), detail: JSON.stringify({ source: 'workbook' }) } });
    }
    await tx.auditLog.create({ data: { action: 'IMPORT', entity: 'workbook', after: JSON.stringify({ loaded: report.devices.length, issues: report.issues.length }) } });
  });
  report.loaded = report.devices.length;
  report.borrowedLoaded = report.borrows.length;
  return report;
}
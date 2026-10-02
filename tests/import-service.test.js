import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { inspectWorkbook, parseBusinessDate } from '../server/services/import-service.js';

function addStockSheet(workbook, name, headers, rows) {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(['POS STOCK MANAGEMENT']);
  sheet.addRow(['Stock In', '', '', '', 'Stock out']);
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  sheet.addRow(['Total', '', '', '=SUM(C4:C100)']);
  return sheet;
}

async function fixture() {
  const workbook = new ExcelJS.Workbook();
  addStockSheet(workbook, 'DX8000 Stock Management', ['Model', 'POS Serial No', 'QTY', 'Date', 'Branch Code', 'Model', 'POS Serial No', 'Merchant name', 'QTY', 'No', 'Model', 'All POS Serial No', 'Remark/Error'], [
    ['DX8000', '231AKD8R7304', 1, null, 'Branch 001', null, null, null, 0, 1, 'DX8000', '231AKD8R7304', '60001973 - power note'],
    ['DX8000', '21ABCD8C10666', 1, null, 'Branch 001', null, null, null, 0, 2, 'DX8000', '21ABCD8C10666', null],
    ['DX8000', '231AKD8R7305', 0, '09/15/2026 08:10:00 AM', 'Branch 001', null, null, 'Merchant A', 1, 3, 'DX8000', '231AKD8R7305', null]
  ]);
  addStockSheet(workbook, 'A8 Stock Management', ['Date', 'Model', 'POS Serial No', 'QTY', 'Date', 'Branch Code', 'Model', 'POS Serial No', 'Merchant name', 'QTY', 'No', 'Model', 'All POS Serial No', 'Remark/Error', 'Status', 'Aset Code'], [
    [null, 'A8', '203RCA115619', 1, null, 'Branch 001', null, null, null, 0, 1, 'A8', '203RCA115619', null, null, '60001974'],
    [null, 'A8', '203RCA115455', 1, null, 'Branch 001', null, null, null, 0, 2, 'A8', '203RCA115455', null, null, '60001975'],
    ['09/15/2026 08:10:00 AM', 'A8', null, 0, '09/16/2026 08:10:00 AM', 'Branch 001', null, '203RCA115456', 'Merchant B', 1, 3, 'A8', '203RCA115456', null, null, '60001976'],
    [null, 'A8', null, 0, null, 'Branch 001', null, '203RCA115455', 'Merchant Duplicate', 1, 4, 'A8', '203RCA115455', null, null, '60001977']
  ]);
  addStockSheet(workbook, 'TOPWISE T6', ['Date', 'Model', 'POS Serial No', 'QTY', 'Date', 'Branch Code', 'Model', 'POS Serial No', 'Merchant name', 'QTY', 'No', 'Model', 'All POS Serial No', 'Remark/Error', 'Aset Code', 'Noted'], [
    [null, 'T6', 'P653200096047', 1, null, 'Branch 001', null, null, null, 0, 1, 'T6', 'P653200096047', null, '60001977', null],
    [null, 'T6', 'P653200096048', 0, '09/16/2026 08:10:00 AM', '', null, 'P653200096048', null, 1, 2, 'T6', 'P653200096048', null, '60001978', null]
  ]);
  for (const name of ['DX8000 Summary Report', 'A8 Summary Report', 'TOPWISE T6 Summary Report']) workbook.addWorksheet(name);
  return workbook.xlsx.writeBuffer();
}

describe('workbook importer', () => {
  it('parses dates in both supported forms', () => {
    expect(parseBusinessDate('09/15/2026 08:10:00 AM')).toEqual(new Date(Date.UTC(2026, 8, 15, 1, 10)));
    expect(parseBusinessDate(new Date(Date.UTC(2026, 8, 15)))).toEqual(new Date(Date.UTC(2026, 8, 15)));
  });

  it('loads valid rows, preserves errors, and reports decisions', async () => {
    const report = await inspectWorkbook(await fixture());
    expect(report.summary).toMatchObject({
      DX8000: { total: 3, out: 1, inStock: 2 },
      A8: { total: 3, out: 1, inStock: 2 },
      T6: { total: 2, out: 1, inStock: 1 }
    });
    expect(report.devices.find((device) => device.serial === '231AKD8R7304')).toMatchObject({ assetCode: '60001973', remark: 'power note' });
    expect(report.issues.map((item) => item.code)).toEqual(expect.arrayContaining(['MODEL_SERIAL_LENGTH', 'DUPLICATE_SERIAL', 'TOTAL_ROW', 'BRANCH_NORMALIZED']));
    expect(report.borrows).toHaveLength(3);
    expect(report.borrows.find((borrow) => borrow.serial === 'P653200096048').borrowedAt).toEqual(new Date(Date.UTC(2026, 8, 16, 1, 10)));
  });
});
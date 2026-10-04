const BUSINESS_INPUT_FIELDS = [
  { key: 'businessName', label: 'Nama Bisnis', cell: 'B2' },
  { key: 'category', label: 'Kategori Bisnis', cell: 'B3' },
  { key: 'productName', label: 'Nama Produk', cell: 'B4' },
  { key: 'price', label: 'Harga', cell: 'B5' },
  { key: 'targetCustomer', label: 'Target Customer', cell: 'B6' },
  { key: 'brandTone', label: 'Brand Tone', cell: 'B7' },
  { key: 'businessGoal', label: 'Tujuan Bisnis', cell: 'B8' }
];

function setupBusinessInputTemplate() {
  const spreadsheet = getActiveSpreadsheetOrThrow();
  const sheet = spreadsheet.getSheetByName(Config.INPUT_SHEET) || spreadsheet.insertSheet(Config.INPUT_SHEET);

  sheet.getRange('A1').setValue('FIELD');
  sheet.getRange('B1').setValue('INPUT (isi di cell ini)');
  sheet.getRange('A1:B1').setFontWeight('bold');

  BUSINESS_INPUT_FIELDS.forEach(function (f) {
    sheet.getRange(getCellRow(f.cell), 1).setValue(f.label);
  });

  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 400);

  return sheet;
}

function getCellRow(cell) {
  return parseInt(String(cell).replace(/[A-Za-z]/g, ''), 10);
}

function getBusinessInputFromSheet() {
  const sheet = getActiveSpreadsheetOrThrow().getSheetByName(Config.INPUT_SHEET);
  const input = {};
  if (!sheet) return input;

  BUSINESS_INPUT_FIELDS.forEach(function (f) {
    input[f.key] = sheet.getRange(f.cell).getValue();
  });

  return input;
}

function hasAllBusinessInput() {
  const input = getBusinessInputFromSheet();
  return BUSINESS_INPUT_FIELDS.every(function (f) {
    const v = input[f.key];
    return v !== null && v !== undefined && String(v).trim() !== '';
  });
}

function getInputSignature() {
  const input = getBusinessInputFromSheet();
  return BUSINESS_INPUT_FIELDS.map(function (f) {
    return String(input[f.key] || '');
  }).join('|');
}

function formatBusinessInput(input) {
  const value = function (v) {
    if (v === null || v === undefined) return 'MISSING_INFORMATION';
    const s = String(v).trim();
    return s.length ? s : 'MISSING_INFORMATION';
  };

  const lines = BUSINESS_INPUT_FIELDS.map(function (f) {
    return '* ' + f.label + ': ' + value(input[f.key]);
  });

  return lines.join('\n');
}

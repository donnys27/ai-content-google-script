const AUTO_RUN_HANDLER = 'onBusinessInputChange';
const LAST_INPUT_KEY = 'LAST_INPUT_SIGNATURE';

function getActiveSpreadsheetOrThrow() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('Script ini harus ter-bind ke Google Sheet. Buka lewat Google Sheets > Extensions > Apps Script.');
  }
  return spreadsheet;
}

function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    if (!ui) return;
    ui.createMenu('30/30 Engine')
      .addItem('Setup Template', 'setupWorkbook')
      .addItem('Aktifkan Auto-Run', 'installEditTrigger')
      .addItem('Nonaktifkan Auto-Run', 'removeEditTrigger')
      .addItem('Jalankan Sekarang', 'main')
      .addItem('Jalankan Engine 2 (dari hasil Engine 1)', 'runEngine2Only')
      .addItem('Jalankan Engine 3 (dari hasil Engine 1 & 2)', 'runEngine3Only')
      .addItem('Jalankan Engine 4 (dari hasil Engine 1, 2 & 3)', 'runEngine4Only')
      .addItem('Jalankan Engine 5 (dari hasil Engine 1, 2 & 4)', 'runEngine5Only')
      .addItem('Reset / Stop Pipeline', 'resetPipeline')
      .addToUi();
  } catch (e) {
    Logger.log('Menu tidak dibuat (onOpen): ' + e.message);
  }
}

function installEditTrigger() {
  const spreadsheet = getActiveSpreadsheetOrThrow();
  const triggers = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === AUTO_RUN_HANDLER;
  });
  if (triggers.length > 0) return 'Auto-run sudah aktif.';

  ScriptApp.newTrigger(AUTO_RUN_HANDLER)
    .forSpreadsheet(spreadsheet)
    .onEdit()
    .create();

  return 'Auto-run aktif: prompt dijalankan otomatis saat semua input terisi.';
}

function removeEditTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === AUTO_RUN_HANDLER) ScriptApp.deleteTrigger(t);
  });
  return 'Auto-run dimatikan.';
}

function onBusinessInputChange(e) {
  const sheet = e && e.range ? e.range.getSheet() : null;
  if (!sheet || sheet.getName() !== Config.INPUT_SHEET) return;

  if (!hasAllBusinessInput()) return;

  const signature = getInputSignature();
  const last = PropertiesService.getScriptProperties().getProperty(LAST_INPUT_KEY);
  if (signature === last) return;
  PropertiesService.getScriptProperties().setProperty(LAST_INPUT_KEY, signature);

  startPipeline();

  if (e && e.source) {
    e.source.toast('Auto-run: pipeline 4 engine dimulai. Hasil berjalan bertahap ke sheet Engine Output, Engine 2 Output, Engine 3 Output, dan Engine 4 Output.', '30/30 Engine');
  }
}

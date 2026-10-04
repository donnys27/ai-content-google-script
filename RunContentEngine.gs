function getCellCol(cell) {
  const match = String(cell).match(/[A-Za-z]+/);
  if (!match) return 1;
  return columnNameToIndex(match[0]);
}

function columnNameToIndex(name) {
  const upper = name.toUpperCase();
  let index = 0;
  for (let i = 0; i < upper.length; i++) {
    index = index * 26 + (upper.charCodeAt(i) - 64);
  }
  return index;
}

function estimateRowHeight(text, colWidth) {
  const charsPerLine = Math.max(20, Math.floor(colWidth / 6.5));
  const lineCount = Math.max(1, Math.ceil(String(text).length / charsPerLine));
  return Math.max(18, lineCount * 13 + 8);
}

function writeEngineOutput(sheet, title, output) {
  const text = output === null || output === undefined ? '' : String(output);
  if (text.trim() === '') throw new Error('Output kosong, tidak dapat ditulis ke sheet.');

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const startRow = getCellRow(Config.OUTPUT_CELL);
  const startCol = getCellCol(Config.OUTPUT_CELL);

  const lastRow = sheet.getLastRow();
  if (lastRow >= startRow) {
    sheet.getRange(startRow, startCol, lastRow - startRow + 1, 1).clearContent();
  }

  sheet.getRange('A1').setValue(title);
  sheet.getRange('B1').setValue('Update: ' + new Date().toLocaleString());
  sheet.getRange('A1:B1').setFontWeight('bold').setBackground('#f3f3f3');
  sheet.setFrozenRows(1);

  const colWidth = 900;
  sheet.setColumnWidth(startCol, colWidth);

  const range = sheet.getRange(startRow, startCol, lines.length, 1);
  range.setValues(lines.map(function (line) {
    return [line];
  }));
  range.setWrap(true);
  range.setVerticalAlignment('top');

  for (let i = 0; i < lines.length; i++) {
    sheet.setRowHeight(startRow + i, estimateRowHeight(lines[i], colWidth));
  }

  return text;
}

function getEngineOutput(sheetName, cell, engineLabel) {
  const spreadsheet = getActiveSpreadsheetOrThrow();
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet "' + sheetName + '" belum ada. Jalankan ' + engineLabel + ' terlebih dahulu.');
  }
  const startRow = getCellRow(cell);
  const startCol = getCellCol(cell);
  const lastRow = sheet.getLastRow();
  if (lastRow < startRow) {
    throw new Error('Output ' + engineLabel + ' masih kosong. Jalankan ' + engineLabel + ' terlebih dahulu.');
  }
  const values = sheet.getRange(startRow, startCol, lastRow - startRow + 1, 1).getValues();
  const parts = [];
  values.forEach(function (row) {
    const v = String(row[0]);
    if (v.trim() !== '') parts.push(v);
  });
  const text = parts.join('\n');
  if (text.trim() === '') {
    throw new Error('Output ' + engineLabel + ' masih kosong. Jalankan ' + engineLabel + ' terlebih dahulu.');
  }
  return text;
}

function getOutputSheet() {
  const spreadsheet = getActiveSpreadsheetOrThrow();
  let sheet = spreadsheet.getSheetByName(Config.OUTPUT_SHEET);
  if (!sheet) sheet = spreadsheet.insertSheet(Config.OUTPUT_SHEET);
  return sheet;
}

function runEngine1BusinessContext() {
  const businessInputText = formatBusinessInput(getBusinessInputFromSheet());
  const prompt1 = buildPrompt1(businessInputText);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt1 }
  ];

  return callAI(messages);
}

function writeEngine1ToSheet() {
  const output = runEngine1BusinessContext();
  return writeEngineOutput(getOutputSheet(), 'HASIL ENGINE 1 - BUSINESS CONTEXT', output);
}

function getEngine1Output() {
  return getEngineOutput(Config.OUTPUT_SHEET, Config.OUTPUT_CELL, 'Engine 1');
}

function getOutputSheet2() {
  const spreadsheet = getActiveSpreadsheetOrThrow();
  let sheet = spreadsheet.getSheetByName(Config.OUTPUT_SHEET_2);
  if (!sheet) sheet = spreadsheet.insertSheet(Config.OUTPUT_SHEET_2);
  return sheet;
}

function runEngine2ContentStrategy(businessContext) {
  const prompt2 = buildPrompt2(businessContext);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt2 }
  ];

  return callAI(messages);
}

function writeEngine2ToSheet() {
  const businessContext = getEngine1Output();
  const output = runEngine2ContentStrategy(businessContext);
  return writeEngineOutput(getOutputSheet2(), 'HASIL ENGINE 2 - CONTENT STRATEGY', output);
}

function runEngine2Only() {
  const output = writeEngine2ToSheet();
  Logger.log(output);
  return output;
}

function getEngine2Output() {
  return getEngineOutput(Config.OUTPUT_SHEET_2, Config.OUTPUT_CELL_2, 'Engine 2');
}

function getOutputSheet3() {
  const spreadsheet = getActiveSpreadsheetOrThrow();
  let sheet = spreadsheet.getSheetByName(Config.OUTPUT_SHEET_3);
  if (!sheet) sheet = spreadsheet.insertSheet(Config.OUTPUT_SHEET_3);
  return sheet;
}

function runEngine3ContentPlanner(businessContext, contentStrategy) {
  const prompt3 = buildPrompt3(businessContext, contentStrategy);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt3 }
  ];

  return callAI(messages);
}

function writeEngine3ToSheet() {
  const businessContext = getEngine1Output();
  const contentStrategy = getEngine2Output();
  const output = runEngine3ContentPlanner(businessContext, contentStrategy);
  return writeEngineOutput(getOutputSheet3(), 'HASIL ENGINE 3 - 30 DAY CONTENT PLANNER', output);
}

function runEngine3Only() {
  const output = writeEngine3ToSheet();
  Logger.log(output);
  return output;
}

function getEngine3Output() {
  return getEngineOutput(Config.OUTPUT_SHEET_3, Config.OUTPUT_CELL_3, 'Engine 3');
}

function getOutputSheet4() {
  const spreadsheet = getActiveSpreadsheetOrThrow();
  let sheet = spreadsheet.getSheetByName(Config.OUTPUT_SHEET_4);
  if (!sheet) sheet = spreadsheet.insertSheet(Config.OUTPUT_SHEET_4);
  return sheet;
}

function runEngine4ContentGenerator(businessContext, contentStrategy, contentMatrix) {
  const prompt4 = buildPrompt4(businessContext, contentStrategy, contentMatrix);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt4 }
  ];

  return callAI(messages);
}

function writeEngine4ToSheet() {
  const businessContext = getEngine1Output();
  const contentStrategy = getEngine2Output();
  const contentMatrix = getEngine3Output();
  const output = runEngine4ContentGenerator(businessContext, contentStrategy, contentMatrix);
  return writeEngineOutput(getOutputSheet4(), 'HASIL ENGINE 4 - CONTENT GENERATOR', output);
}

function runEngine4Only() {
  const output = writeEngine4ToSheet();
  Logger.log(output);
  return output;
}

function getEngine4Output() {
  return getEngineOutput(Config.OUTPUT_SHEET_4, Config.OUTPUT_CELL_4, 'Engine 4');
}

function setupWorkbook() {
  setupBusinessInputTemplate();
  getOutputSheet();
  getOutputSheet2();
  getOutputSheet3();
  getOutputSheet4();
  getOutputSheet5();
  return 'Siap. Isi cell B2:B8 di sheet "' + Config.INPUT_SHEET + '".';
}

function main() {
  return startPipeline();
}

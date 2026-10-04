const PIPELINE_STATE = 'PIPELINE_NEXT_INDEX';
const PIPELINE_ERROR = 'PIPELINE_LAST_ERROR';
const CONTINUATION_HANDLER = 'continuationTick';
const CONTINUATION_DELAY_MS = 60 * 1000;

function getPipelineSteps() {
  return [
    { name: 'Engine 1: Business Context', run: writeEngine1ToSheet },
    { name: 'Engine 2: Content Strategy', run: writeEngine2ToSheet },
    { name: 'Engine 3: 30-Day Content Planner', run: writeEngine3ToSheet },
    { name: 'Engine 4: Content Generator', run: writeEngine4ToSheet },
    { name: 'Engine 5: Quality + Diversity Controller', run: writeEngine5ToSheet }
  ];
}

function toast(message, title) {
  try {
    const ui = SpreadsheetApp.getUi();
    if (ui) ui.toast(message, title, 10);
  } catch (e) {}
}

function clearContinuationTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === CONTINUATION_HANDLER) ScriptApp.deleteTrigger(t);
  });
}

function scheduleContinuation() {
  clearContinuationTrigger();
  ScriptApp.newTrigger(CONTINUATION_HANDLER).timeBased().after(CONTINUATION_DELAY_MS).create();
}

function resetPipeline() {
  PropertiesService.getScriptProperties().deleteProperty(PIPELINE_STATE);
  PropertiesService.getScriptProperties().deleteProperty(PIPELINE_ERROR);
  clearContinuationTrigger();
  return 'Pipeline direset. Jalankan ulang dengan tombol "Jalankan Sekarang".';
}

function startPipeline() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(PIPELINE_ERROR);
  resetPipeline();

  const steps = getPipelineSteps();
  const first = steps[0];

  const startedAt = Date.now();
  first.run();
  Logger.log(first.name + ' selesai.');

  props.setProperty(PIPELINE_STATE, '1');
  scheduleContinuation();

  const waitText = Math.ceil(CONTINUATION_DELAY_MS / 1000);
  toast(first.name + ' selesai. Lanjut ke Engine 2 otomatis dalam ~' + waitText + ' detik.', '30/30 Engine');
  return first.name + ' selesai. Engine berikutnya berjalan otomatis.';
}

function continuationTick() {
  const props = PropertiesService.getScriptProperties();
  const indexRaw = props.getProperty(PIPELINE_STATE);
  if (!indexRaw) return;

  const steps = getPipelineSteps();
  const index = parseInt(indexRaw, 10);

  if (index >= steps.length) {
    props.deleteProperty(PIPELINE_STATE);
    clearContinuationTrigger();
    return;
  }

  const step = steps[index];
  try {
    const startedAt = Date.now();
    step.run();
    const elapsedMs = Date.now() - startedAt;
    Logger.log(step.name + ' selesai.');

    const next = index + 1;
    if (next < steps.length) {
      props.setProperty(PIPELINE_STATE, String(next));
      scheduleContinuation();
      toast(step.name + ' selesai. Lanjut ke ' + steps[next].name + '.', '30/30 Engine');
    } else {
      props.deleteProperty(PIPELINE_STATE);
      clearContinuationTrigger();
      toast('Semua engine selesai. Cek sheet Engine Output.', '30/30 Engine');
    }
  } catch (e) {
    props.setProperty(PIPELINE_ERROR, e.message);
    props.deleteProperty(PIPELINE_STATE);
    clearContinuationTrigger();
    Logger.log('Pipeline gagal di ' + step.name + ': ' + e.message);
    toast('Pipeline gagal di ' + step.name + ': ' + e.message, '30/30 Engine');
  }
}

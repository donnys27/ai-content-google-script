const ENGINE5_MAX_ATTEMPTS = 2;
const ENGINE5_TIME_BUDGET_MS = 240000;
const ENGINE5_SIG_CELL = 'B2';

const ENGINE5_HUMAN_REVIEW_ISSUES = [
  'unsupported_claim',
  'fabricated_information',
  'fabricated_statistic',
  'guessed_fact',
  'missing_information',
  'unsupported_guarantee',
  'unsupported_price',
  'missing_evaluation',
  'invalid_status'
];

const ENGINE5_VALID_STATUSES = ['PASS', 'REVISE', 'REJECT', 'NEEDS_HUMAN_REVIEW'];

function getOutputSheet5() {
  const spreadsheet = getActiveSpreadsheetOrThrow();
  let sheet = spreadsheet.getSheetByName(Config.OUTPUT_SHEET_5);
  if (!sheet) sheet = spreadsheet.insertSheet(Config.OUTPUT_SHEET_5);
  return sheet;
}

function computeOutputSignature(text) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(text), Utilities.Charset.UTF_8);
  return digest.map(function (b) {
    const h = (b & 0xff).toString(16);
    return h.length === 1 ? '0' + h : h;
  }).join('');
}

function readOutputColumn(sheet, cell) {
  const startRow = getCellRow(cell);
  const startCol = getCellCol(cell);
  const lastRow = sheet.getLastRow();
  if (lastRow < startRow) return '';
  const values = sheet.getRange(startRow, startCol, lastRow - startRow + 1, 1).getValues();
  const parts = [];
  values.forEach(function (row) {
    const v = String(row[0]);
    if (v.trim() !== '') parts.push(v);
  });
  return parts.join('\n');
}

function safeGetSheetCell(sheet, cell) {
  try {
    return String(sheet.getRange(cell).getValue());
  } catch (e) {
    return '';
  }
}

function writeEngine5ToSheet() {
  const businessContext = getEngine1Output();
  const contentStrategy = getEngine2Output();
  const contentOutput = getEngine4Output();
  const sheet = getOutputSheet5();

  const signature = computeOutputSignature(contentOutput);
  const existingSignature = safeGetSheetCell(sheet, ENGINE5_SIG_CELL);
  const existingReport = readOutputColumn(sheet, Config.OUTPUT_CELL_5);

  if (existingSignature === signature && existingReport.trim() !== '') {
    Logger.log('Engine 5: input Engine 4 tidak berubah. Hasil existing dipertahankan (idempotent).');
    try {
      ensureQcDashboardsExist(existingReport, contentOutput);
    } catch (e) {
      Logger.log('Ensure QC dashboard skip: ' + e.message);
    }
    return existingReport;
  }

  const report = runEngine5QualityController(businessContext, contentStrategy, contentOutput);
  writeEngineOutput(sheet, 'HASIL ENGINE 5 - QUALITY + DIVERSITY CONTROLLER + AUTO REPAIR', report);
  sheet.getRange(ENGINE5_SIG_CELL).setValue(signature);
  // Dashboard rapi ditulis di dalam runEngine5QualityController via writeQcDashboards().
  // Pangggil ulang ensure sebagai pengaman jika controller lama di-cache.
  try {
    ensureQcDashboardsExist(report, contentOutput);
  } catch (e) {
    Logger.log('Ensure QC dashboard skip: ' + e.message);
  }
  return report;
}

function runEngine5Only() {
  const output = writeEngine5ToSheet();
  Logger.log(output);
  return output;
}

function runEngine5QualityController(businessContext, contentStrategy, contentOutput) {
  const startedAt = Date.now();
  let timeoutHit = false;

  const sections = splitEngine4Sections(contentOutput);
  const initial = engine5InitialQC(businessContext, contentStrategy, contentOutput);
  const evaluations = normalizeEvaluations(initial.evaluations, sections);

  const evalByDay = {};
  evaluations.forEach(function (e) {
    evalByDay[e.day] = e;
  });

  let summaryObjs = evaluations.map(function (e) {
    return {
      day: e.day,
      objective: e.objective || '',
      pillar: e.pillar || '',
      content_type: e.content_type || '',
      topic: e.topic || '',
      angle: e.angle || '',
      hook: e.hook || '',
      cta: e.cta || '',
      format: e.format || '',
      status: e.status
    };
  });

  const results = {};
  evaluations.forEach(function (e) {
    const needsHuman = isHumanReviewRoute(e);
    results[e.day] = {
      day: e.day,
      original_status: e.status,
      action: needsHuman ? 'HUMAN_REVIEW' : (e.status === 'PASS' ? 'KEEP' : (e.status === 'REVISE' ? 'AUTO_REVISE' : 'AUTO_REGENERATE')),
      attempt: 0,
      score: isNumber(e.score) ? e.score : 0,
      issues: (e.issues || []).slice(),
      diagnosis: e.diagnosis || {},
      revised_content: null,
      qc_after_repair: null,
      final_status: needsHuman ? 'NEEDS_HUMAN_REVIEW' : (e.status === 'PASS' ? 'PASS' : null),
      final_score: e.status === 'PASS' ? (isNumber(e.score) ? e.score : null) : null
    };
  });

  // TAHAP 1: tulis tabel awal langsung agar QC_RAPI/QC_FINAL_CONTENT terisi
  // saat Engine 5 dijalankan, tanpa menunggu auto-repair yang lama.
  // Ditulis ulang di akhir (tahap final) setelah repair + campaign check.
  try {
    var interimResults = {};
    Object.keys(results).forEach(function (k) {
      var r = results[k];
      interimResults[k] = {
        day: r.day,
        original_status: r.original_status,
        action: r.action,
        attempt: r.attempt || 0,
        score: r.score,
        issues: r.issues || [],
        diagnosis: r.diagnosis || {},
        revised_content: null,
        qc_after_repair: null,
        final_status: r.final_status || r.original_status || 'REVISE',
        final_score: (typeof r.final_score === 'number') ? r.final_score : (typeof r.score === 'number' ? r.score : null)
      };
    });
    var interimManifest = buildManifest(interimResults, 'IN_PROGRESS', false);
    writeQcDashboards(interimManifest, interimResults, summaryObjs, sections);
    Logger.log('QC dashboard tahap awal ditulis (' + evaluations.length + ' hari). Lanjut auto-repair.');
  } catch (e) {
    Logger.log('QC dashboard tahap awal gagal (lanjut repair): ' + e.message);
  }

  evaluations.forEach(function (e) {
    if (e.status === 'PASS' || isHumanReviewRoute(e)) return;
    const state = results[e.day];
    const evalInfo = evalByDay[e.day];
    const section = sectionText(sections, e.day);

    if (state.action === 'AUTO_REVISE' && !section) {
      state.issues = state.issues.concat('missing original content untuk auto-revise');
      state.final_status = 'NEEDS_HUMAN_REVIEW';
      return;
    }

    attemptRepair(state, businessContext, contentStrategy, evalInfo, section, summaryObjs, startedAt, function () {
      timeoutHit = true;
    });
    if ((Date.now() - startedAt) > ENGINE5_TIME_BUDGET_MS) timeoutHit = true;
  });

  const campaignResult = engine5CampaignCheck(businessContext, contentStrategy, summariesText(summaryObjs), startedAt);
  const campaignStatus = campaignResult.final_status || 'NEEDS_REVISION';
  const flagged = campaignResult.flagged_days || [];

  flagged.forEach(function (flag) {
    const day = Number(flag.day);
    const state = results[day];
    if (!state) return;
    if (state.final_status === 'NEEDS_HUMAN_REVIEW') return;
    if ((Date.now() - startedAt) > ENGINE5_TIME_BUDGET_MS) {
      timeoutHit = true;
      return;
    }
    const s = findSummary(summaryObjs, day);
    const evalInfo = {
      day: day,
      status: flag.status === 'REJECT' ? 'REJECT' : 'REVISE',
      issues: flag.issues || [],
      diagnosis: flag.diagnosis || {},
      objective: (s && s.objective) || '',
      pillar: (s && s.pillar) || '',
      content_type: (s && s.content_type) || '',
      topic: (s && s.topic) || '',
      angle: (s && s.angle) || '',
      hook: (s && s.hook) || '',
      cta: (s && s.cta) || '',
      format: (s && s.format) || ''
    };
    const section = sectionText(sections, day);
    attemptRepair(state, businessContext, contentStrategy, evalInfo, section, summaryObjs, startedAt, function () {
      timeoutHit = true;
    });
    updateSummaryAfterRepair(summaryObjs, state);
  });

  const finalPack = assembleFinalContent(sections, results);
  const manifest = buildManifest(results, campaignStatus, timeoutHit);
  try {
    writeQcDashboards(manifest, results, summaryObjs, sections);
    Logger.log('QC dashboard tahap final ditulis. Campaign: ' + campaignStatus);
  } catch (e) {
    Logger.log('QC dashboard tahap final gagal ditulis (tahap awal tetap ada, tidak mengganggu QC utama): ' + e.message);
  }
  const report = buildReport(results, manifest, campaignStatus, initial, timeoutHit, finalPack);
  return report;
}

function engine5InitialQC(businessContext, contentStrategy, contentOutput) {
  const prompt = buildPrompt5InitialQC(businessContext, contentStrategy, contentOutput);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt }
  ];
  const data = callLLMJson(messages, 'INITIAL_QC', 2);
  if (!data || typeof data !== 'object' || !Array.isArray(data.evaluations)) {
    throw new Error('LLM_PARSE_ERROR: INITIAL_QC tidak memiliki evaluations');
  }
  return data;
}

function engine5Revise(businessContext, contentStrategy, dayContentText, qcReason, attempt) {
  const prompt = buildPrompt5Revise(businessContext, contentStrategy, dayContentText, qcReason, attempt);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt }
  ];
  const data = callLLMJson(messages, 'REVISE', 2);
  return assertRepaired(data, 'REVISE');
}

function engine5Regenerate(businessContext, contentStrategy, matrixEntryText, batchSummariesText, qcReason, attempt) {
  const prompt = buildPrompt5Regenerate(businessContext, contentStrategy, matrixEntryText, batchSummariesText, qcReason, attempt);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt }
  ];
  const data = callLLMJson(messages, 'REGENERATE', 2);
  return assertRepaired(data, 'REGENERATE');
}

function engine5ReCheck(businessContext, contentStrategy, batchSummaryText, postContentText, qcReason) {
  const prompt = buildPrompt5Recheck(businessContext, contentStrategy, batchSummaryText, postContentText, qcReason);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt }
  ];
  const data = callLLMJson(messages, 'REQC', 2);
  return validateRecheck(data);
}

function engine5CampaignCheck(businessContext, contentStrategy, batchSummaryText, startedAt) {
  if ((Date.now() - startedAt) > ENGINE5_TIME_BUDGET_MS) {
    return { final_status: 'NEEDS_REVISION', flagged_days: [] };
  }
  const prompt = buildPrompt5Campaign(businessContext, contentStrategy, batchSummaryText);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt }
  ];
  const data = callLLMJson(messages, 'CAMPAIGN', 2);
  const status = data && data.final_status === 'READY' ? 'READY' : 'NEEDS_REVISION';
  const flagged = Array.isArray(data && data.flagged_days) ? data.flagged_days : [];
  return { final_status: status, flagged_days: flagged };
}

function callLLMJson(messages, label, maxRetries) {
  maxRetries = maxRetries === undefined ? 2 : maxRetries;
  let lastError = null;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const raw = callAI(messages);
      return extractJSON(raw);
    } catch (e) {
      lastError = e;
      Logger.log('callLLMJson ' + label + ' attempt ' + i + ': ' + e.message);
      if (isApiError(e)) throw e;
    }
  }
  throw new Error('LLM_PARSE_ERROR: ' + label + ' tidak dapat diparse setelah retry.');
}

function isApiError(e) {
  return /^HTTP \d+/.test(e.message || '');
}

function extractJSON(text) {
  let t = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('LLM_PARSE_ERROR: objek JSON tidak ditemukan');
  }
  return JSON.parse(t.slice(start, end + 1));
}

function validateRecheck(data) {
  if (!data || typeof data !== 'object') throw new Error('LLM_PARSE_ERROR: REQC bukan objek');
  if (ENGINE5_VALID_STATUSES.slice(0, 3).indexOf(data.status) === -1) {
    throw new Error('LLM_PARSE_ERROR: status REQC tidak valid');
  }
  data.day = isNumber(data.day) ? Number(data.day) : null;
  data.score = isNumber(data.score) ? Number(data.score) : 0;
  data.issues = Array.isArray(data.issues) ? data.issues : [];
  if (!data.diagnosis || typeof data.diagnosis !== 'object') data.diagnosis = {};
  return data;
}

function assertRepaired(data, repairType) {
  if (!data || typeof data !== 'object' || !data.revised_content || typeof data.revised_content !== 'object') {
    throw new Error('LLM_PARSE_ERROR: revised_content tidak tersedia');
  }
  const c = data.revised_content;
  const required = ['hook', 'caption', 'cta'];
  required.forEach(function (field) {
    if (c[field] === undefined || c[field] === null || String(c[field]).trim() === '') {
      throw new Error('LLM_PARSE_ERROR: revised_content.' + field + ' kosong');
    }
  });
  return c;
}

function normalizeEvaluations(rawArray, sections) {
  const out = [];
  const seen = {};
  (rawArray || []).forEach(function (e) {
    if (!e || typeof e !== 'object') return;
    const day = Number(e.day);
    if (!day || day < 1) return;
    if (seen[day]) return;
    seen[day] = true;
    if (ENGINE5_VALID_STATUSES.slice(0, 3).indexOf(e.status) === -1) {
      e.status = 'REJECT';
      e.diagnosis = { primary_issue: 'invalid_status', severity: 'high' };
      e.issues = (e.issues || []).concat('status QC tidak valid');
    }
    out.push(e);
  });
  Object.keys(sections || {}).forEach(function (k) {
    const day = Number(k);
    if (!seen[day]) {
      seen[day] = true;
      out.push({
        day: day,
        objective: '',
        pillar: '',
        content_type: '',
        topic: '',
        angle: '',
        hook: '',
        cta: '',
        format: '',
        status: 'REJECT',
        score: 0,
        issues: ['day tidak dievaluasi oleh QC'],
        diagnosis: { primary_issue: 'missing_evaluation', severity: 'high' }
      });
    }
  });
  out.sort(function (a, b) {
    return a.day - b.day;
  });
  return out;
}

function isHumanReviewRoute(e) {
  const primary = e && e.diagnosis && e.diagnosis.primary_issue ? e.diagnosis.primary_issue : '';
  return ENGINE5_HUMAN_REVIEW_ISSUES.indexOf(primary) !== -1;
}

function isHumanReviewRecheck(r) {
  const primary = r && r.diagnosis && r.diagnosis.primary_issue ? r.diagnosis.primary_issue : '';
  return ENGINE5_HUMAN_REVIEW_ISSUES.indexOf(primary) !== -1;
}

function attemptRepair(state, businessContext, contentStrategy, evalInfo, sectionText, summaryObjs, startedAt, onTimeout) {
  const repairTypeOf = function (info) {
    return (info && info.status === 'REJECT') ? 'REGENERATE' : 'REVISE';
  };
  const reasonOf = function (st) {
    const parts = (st.issues || []).slice();
    if (st.diagnosis && st.diagnosis.primary_issue) parts.push('[primary: ' + st.diagnosis.primary_issue + ']');
    return parts.join('; ') || 'perlu perbaikan';
  };

  while (state.attempt < ENGINE5_MAX_ATTEMPTS) {
    if ((Date.now() - startedAt) > ENGINE5_TIME_BUDGET_MS) {
      if (onTimeout) onTimeout();
      break;
    }
    state.attempt += 1;
    const repairType = repairTypeOf(evalInfo);
    let content = null;
    try {
      if (repairType === 'REGENERATE') {
        content = engine5Regenerate(businessContext, contentStrategy, buildMatrixEntry(evalInfo), summariesText(summaryObjs), reasonOf(state), state.attempt);
      } else {
        if (!sectionText || String(sectionText).trim() === '') {
          state.issues = state.issues.concat('missing original content untuk auto-revise');
          state.final_status = 'NEEDS_HUMAN_REVIEW';
          return;
        }
        content = engine5Revise(businessContext, contentStrategy, sectionText, reasonOf(state), state.attempt);
      }
    } catch (e) {
      Logger.log('Engine5 repair error day ' + state.day + ' attempt ' + state.attempt + ': ' + e.message);
      if (state.attempt >= ENGINE5_MAX_ATTEMPTS) break;
      continue;
    }

    state.action = repairType === 'REGENERATE' ? 'AUTO_REGENERATE' : 'AUTO_REVISE';
    state.revised_content = content;
    state.latest_score = content.score !== undefined ? content.score : null;

    let recheck = null;
    try {
      recheck = engine5ReCheck(businessContext, contentStrategy, summariesText(summaryObjs), formatContentSection(content, state.day), reasonOf(state));
    } catch (e) {
      Logger.log('Engine5 recheck error day ' + state.day + ' attempt ' + state.attempt + ': ' + e.message);
      if (state.attempt >= ENGINE5_MAX_ATTEMPTS) break;
      continue;
    }
    state.qc_after_repair = recheck;
    state.latest_score = recheck.score;

    if (isHumanReviewRecheck(recheck)) {
      state.final_status = 'NEEDS_HUMAN_REVIEW';
      return;
    }

    updateSummaryFromContent(summaryObjs, state.day, content, recheck.status);

    if (recheck.status === 'PASS') {
      state.final_status = 'PASS';
      state.final_score = recheck.score;
      return;
    }

    state.issues = (recheck.issues || []).slice();
    state.diagnosis = recheck.diagnosis || {};
    state.score = recheck.score;
  }

  if (state.final_status !== 'PASS') {
    state.final_status = 'NEEDS_HUMAN_REVIEW';
  }
}

function updateSummaryAfterRepair(summaryObjs, state) {
  if (!state.revised_content) return;
  updateSummaryFromContent(summaryObjs, state.day, state.revised_content, state.final_status === 'PASS' ? 'PASS' : (state.qc_after_repair ? state.qc_after_repair.status : ''));
}

function updateSummaryFromContent(list, day, content, statusLabel) {
  const target = findSummary(list, day);
  if (!target) return;
  const c = content || {};
  target.objective = c.objective || target.objective;
  target.pillar = c.pillar || target.pillar;
  target.content_type = c.content_type || target.content_type;
  target.topic = c.topic || target.topic;
  target.angle = c.angle || target.angle;
  target.hook = c.hook || target.hook;
  target.cta = c.cta || target.cta;
  target.format = c.recommended_format || target.format;
  if (statusLabel) target.status = statusLabel;
}

function findSummary(list, day) {
  day = Number(day);
  for (let i = 0; i < list.length; i++) {
    if (Number(list[i].day) === day) return list[i];
  }
  return null;
}

function summariesText(list) {
  return (list || []).map(function (s) {
    return buildSummaryLine(s);
  }).join('\n');
}

function buildSummaryLine(s) {
  s = s || {};
  return [
    'day=' + s.day,
    'status=' + (s.status || ''),
    'objective=' + (s.objective || ''),
    'pillar=' + (s.pillar || ''),
    'content_type=' + (s.content_type || ''),
    'topic=' + (s.topic || ''),
    'angle=' + (s.angle || ''),
    'hook=' + (s.hook || ''),
    'cta=' + (s.cta || ''),
    'format=' + (s.format || '')
  ].join(' | ');
}

function buildMatrixEntry(evalInfo) {
  const e = evalInfo || {};
  return [
    '# DAY ' + (e.day === undefined ? '' : e.day),
    'Objective: ' + (e.objective || ''),
    'Pillar: ' + (e.pillar || ''),
    'Content Type: ' + (e.content_type || ''),
    'Topic: ' + (e.topic || ''),
    'Angle: ' + (e.angle || ''),
    'CTA: ' + (e.cta || ''),
    'Format: ' + (e.format || '')
  ].join('\n');
}

function splitEngine4Sections(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const map = {};
  let currentDay = null;
  let buffer = [];
  // Toleran format LLM: "# DAY 1", "## DAY 1", "**DAY 1**", "- Day 1:", "DAY 1 - ...", "DAY: 1"
  const dayMarker = /^\s*(?:#{1,4}\s*)?(?:[>\-*\u2022]+\s*)?(?:\*{1,2}\s*)?DAY\s*[:\-#]*\s*(\d{1,3})\b/i;
  lines.forEach(function (line) {
    const probe = String(line).replace(/\*/g, '').trim();
    const m = probe.match(dayMarker);
    if (m) {
      if (currentDay !== null) map[currentDay] = buffer.join('\n').trim();
      currentDay = parseInt(m[1], 10);
      buffer = [line];
    } else if (currentDay !== null) {
      buffer.push(line);
    }
  });
  if (currentDay !== null) map[currentDay] = buffer.join('\n').trim();
  return map;
}

function sectionText(sections, day) {
  const s = sections[day];
  return s === null || s === undefined ? null : String(s);
}

function formatContentSection(content, fallbackDay) {
  const c = content || {};
  const day = (c.day !== null && c.day !== undefined && c.day !== '') ? c.day : fallbackDay;
  return [
    '# DAY ' + day,
    '',
    'Objective:',
    c.objective || '',
    '',
    'Pillar:',
    c.pillar || '',
    '',
    'Content Type:',
    c.content_type || '',
    '',
    'Topic:',
    c.topic || '',
    '',
    'Angle:',
    c.angle || '',
    '',
    'Hook:',
    c.hook || '',
    '',
    'Caption:',
    c.caption || '',
    '',
    'CTA:',
    c.cta || '',
    '',
    'Suggested Visual:',
    c.suggested_visual || '',
    '',
    'Recommended Format:',
    c.recommended_format || ''
  ].join('\n');
}

function assembleFinalContent(sections, results) {
  const days = Object.keys(results).map(Number).sort(function (a, b) {
    return a - b;
  });
  const pack = [];
  days.forEach(function (day) {
    const r = results[day];
    if (r.final_status === 'PASS' && r.revised_content) {
      pack.push(formatContentSection(r.revised_content, day));
    } else if (sections[day]) {
      pack.push(String(sections[day]));
    } else if (r.revised_content) {
      pack.push(formatContentSection(r.revised_content, day));
    }
  });
  return pack.join('\n\n');
}

function buildManifest(results, campaignStatus, timeoutHit) {
  const days = Object.keys(results).map(Number).sort(function (a, b) {
    return a - b;
  });
  const posts = [];
  let passed = 0;
  let revised = 0;
  let regenerated = 0;
  let humanReview = 0;
  days.forEach(function (day) {
    const r = results[day];
    if (r.final_status === 'PASS') passed += 1;
    if (r.action === 'AUTO_REVISE') revised += 1;
    if (r.action === 'AUTO_REGENERATE') regenerated += 1;
    if (r.final_status === 'NEEDS_HUMAN_REVIEW') humanReview += 1;
    posts.push({
      day: day,
      original_status: r.original_status,
      action: r.action,
      attempt: r.attempt || 0,
      score: isNumber(r.score) ? r.score : null,
      issues: r.issues || [],
      diagnosis: r.diagnosis || {},
      revised_content: r.revised_content || null,
      qc_after_repair: r.qc_after_repair || null,
      final_status: r.final_status,
      final_score: isNumber(r.final_score) ? r.final_score : null
    });
  });
  return {
    engine: 'ENGINE_5_QC_AUTO_REPAIR',
    version: 1,
    generated_at: new Date().toISOString(),
    overall: {
      total_posts: days.length,
      passed: passed,
      auto_revised: revised,
      auto_regenerated: regenerated,
      needs_human_review: humanReview,
      campaign_status: campaignStatus,
      timeout_limited: !!timeoutHit
    },
    posts: posts
  };
}

function isNumber(v) {
  return typeof v === 'number' && !isNaN(v);
}

function buildReport(results, manifest, campaignStatus, initial, timeoutHit, finalPack) {
  const days = Object.keys(results).map(Number).sort(function (a, b) {
    return a - b;
  });
  const o = manifest.overall;

  const headerLines = [
    'ENGINE 5 — QUALITY + DIVERSITY CONTROLLER + AUTO REPAIR',
    '='.repeat(56),
    '',
    'OVERALL RESULT',
    'Total Posts: ' + o.total_posts,
    'Passed: ' + o.passed,
    'Auto-Revised: ' + o.auto_revised,
    'Auto-Regenerated: ' + o.auto_regenerated,
    'Needs Human Review: ' + o.needs_human_review,
    'Campaign Status: ' + campaignStatus,
    'Timeout Limited: ' + o.timeout_limited
  ];

  const tableLines = [
    '',
    'POST-BY-POST',
    'Day | Original | Action | Attempt | Initial Score | Final Score | Final Status',
    '----|----------|--------|---------|---------------|------------|-------------'
  ];
  days.forEach(function (day) {
    const r = results[day];
    tableLines.push([
      r.day,
      r.original_status,
      r.action,
      r.attempt || 0,
      isNumber(r.score) ? r.score : '-',
      isNumber(r.final_score) ? r.final_score : '-',
      r.final_status
    ].join(' | '));
  });

  const logLines = ['', 'REPAIR LOG'];
  let hasLog = false;
  days.forEach(function (day) {
    const r = results[day];
    if (r.action === 'KEEP' || (r.action === 'HUMAN_REVIEW' && !r.revised_content)) return;
    hasLog = true;
    logLines.push('Day ' + day + ' [' + r.original_status + '] issue: ' + (r.issues.join('; ') || '-'));
    if (r.revised_content) {
      logLines.push('  -> ' + r.action + ' (attempt ' + r.attempt + ')');
      if (r.qc_after_repair) {
        logLines.push('  -> re-QC score ' + r.qc_after_repair.score + ' status ' + r.qc_after_repair.status);
      }
      logLines.push('  -> FINAL ' + r.final_status + (isNumber(r.final_score) ? ' (score ' + r.final_score + ')' : ''));
    } else {
      logLines.push('  -> FINAL ' + r.final_status);
    }
  });
  if (!hasLog) logLines.push('-');

  const notes = [];
  if (initial.campaign_issues && initial.campaign_issues.length) {
    notes.push('Campaign issues (initial QC): ' + initial.campaign_issues.join('; '));
  }
  if (timeoutHit) {
    notes.push('WARNING: batas waktu eksekusi tercapai. Beberapa repair dihentikan dan dialihkan ke NEEDS_HUMAN_REVIEW.');
  }

  const manifestText = '\n\n=== JSON MANIFEST ===\n' + JSON.stringify(manifest, null, 1);

  return headerLines.concat(tableLines, notes, logLines, [
    '',
    'FINAL CONTENT PACK',
    '='.repeat(56),
    finalPack
  ]).join('\n') + manifestText;
}

/* =====================================================================
 * QC DASHBOARD RAPI (tidak mengganggu QUALITY_CONTROL)
 * Sheet baru read-only view:
 *  - QC_RAPI           : tabel post-by-post, 1 baris = 1 day
 *  - QC_FINAL_CONTENT  : tabel konten final, 1 baris = 1 day
 * Pipeline tidak pernah membaca sheet ini. Aman untuk filter/sort manual.
 * ===================================================================== */

function getQcViewSheetName() {
  return (typeof Config !== 'undefined' && Config.QC_VIEW_SHEET) || 'QC_RAPI';
}

function getQcContentSheetName() {
  return (typeof Config !== 'undefined' && Config.QC_CONTENT_SHEET) || 'QC_FINAL_CONTENT';
}

function getQcViewSheet() {
  const ss = getActiveSpreadsheetOrThrow();
  const name = getQcViewSheetName();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function getQcContentSheet() {
  const ss = getActiveSpreadsheetOrThrow();
  const name = getQcContentSheetName();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function qcStatusColor(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'PASS' || s === 'KEEP' || s === 'READY') return '#d9ead3';
  if (s === 'REVISE' || s === 'AUTO_REVISE') return '#fff2cc';
  if (s === 'REJECT' || s === 'AUTO_REGENERATE') return '#f4cccc';
  return '#fce5cd'; // NEEDS_HUMAN_REVIEW & lainnya
}

function qcSafeStr(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

function qcCleanLineForMatch(raw) {
  let t = String(raw || '').trim();
  if (!t) return '';
  t = t.replace(/^\s*[>\-*\u2022\u25CF\u25AA]+\s+/, '');
  t = t.replace(/^\s*\d+[.)]\s+/, '');
  t = t.split('**').join('').split('__').join('');
  t = t.replace(/^\s*\*\s*/, '').trim();
  return t;
}

function qcCleanValue(raw) {
  let v = String(raw || '').trim();
  if (!v) return '';
  v = v.replace(/^\s*[>\-*\u2022\u25CF\u25AA]+\s+/, '');
  v = v.replace(/^\s*\d+[.)]\s+/, '');
  v = v.split('**').join('').split('__').join('').trim();
  v = v.replace(/^\*+\s*/, '').replace(/\s*\*+$/, '').trim();
  return v;
}

function parseSectionFields(text) {
  const out = {
    objective: '',
    pillar: '',
    content_type: '',
    topic: '',
    angle: '',
    hook: '',
    caption: '',
    cta: '',
    suggested_visual: '',
    recommended_format: ''
  };
  if (!text) return out;
  // Toleran format LLM: "**Objective:** ...", "* Hook: ...", "- Caption: ...", "1. CTA: ...",
  // "Suggested Visual Direction: ...", "Content-Type: ...", dll.
  const labelRe = /^(Objective|Pillar|Content[\s\-_]*Type|Topic|Angle|Hook|Caption|CTA|Suggested\s+Visual(?:\s+Direction)?|Visual(?:\s+Direction)?|Recommended\s+Format|Format)\s*:\s*(.*)\s*$/i;
  const labelOnlyRe = /^(Objective|Pillar|Content[\s\-_]*Type|Topic|Angle|Hook|Caption|CTA|Suggested\s+Visual(?:\s+Direction)?|Visual(?:\s+Direction)?|Recommended\s+Format|Format)\s*$/i;
  const norm = function (label) {
    const l = String(label).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (l === 'objective') return 'objective';
    if (l === 'pillar') return 'pillar';
    if (l === 'content type') return 'content_type';
    if (l === 'topic') return 'topic';
    if (l === 'angle') return 'angle';
    if (l === 'hook') return 'hook';
    if (l === 'caption') return 'caption';
    if (l === 'cta') return 'cta';
    if (l === 'suggested visual' || l === 'suggested visual direction' || l === 'visual' || l === 'visual direction') return 'suggested_visual';
    if (l === 'recommended format' || l === 'format') return 'recommended_format';
    return null;
  };
  const dayHeaderRe = /^\s*(?:#{1,4}\s*)?(?:\*{1,2}\s*)?DAY\s*[:\-#]*\s*\d{1,3}\b/i;
  let current = null;
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  lines.forEach(function (raw) {
    const cleaned = qcCleanLineForMatch(raw);
    if (!cleaned) return;
    if (dayHeaderRe.test(cleaned.replace(/\*/g, ''))) { current = null; return; }
    const m = cleaned.match(labelRe);
    if (m) {
      const key = norm(m[1]);
      if (!key) return;
      current = key;
      const val = qcCleanValue(m[2] || '');
      if (val) {
        out[key] = out[key] ? out[key] + '\n' + val : val;
      }
      return;
    }
    const m2 = cleaned.match(labelOnlyRe);
    if (m2) {
      const key2 = norm(m2[1]);
      if (key2) { current = key2; return; }
    }
    if (current && cleaned !== '') {
      const val2 = qcCleanValue(raw);
      if (!val2) return;
      // Hindari menelan baris separator / dekorasi.
      if (/^=+$/.test(val2) || /^-{3,}$/.test(val2)) return;
      out[current] = out[current] ? out[current] + '\n' + val2 : val2;
    }
  });
  return out;
}

function getFinalContentForDay(day, results, sections) {
  const r = results ? results[day] : null;
  if (r && r.revised_content) {
    const c = r.revised_content;
    return {
      objective: qcSafeStr(c.objective),
      pillar: qcSafeStr(c.pillar),
      content_type: qcSafeStr(c.content_type),
      topic: qcSafeStr(c.topic),
      angle: qcSafeStr(c.angle),
      hook: qcSafeStr(c.hook),
      caption: qcSafeStr(c.caption),
      cta: qcSafeStr(c.cta),
      suggested_visual: qcSafeStr(c.suggested_visual),
      recommended_format: qcSafeStr(c.recommended_format || c.format)
    };
  }
  const parsed = parseSectionFields(sections ? sections[day] : '');
  return {
    objective: parsed.objective,
    pillar: parsed.pillar,
    content_type: parsed.content_type,
    topic: parsed.topic,
    angle: parsed.angle,
    hook: parsed.hook,
    caption: parsed.caption,
    cta: parsed.cta,
    suggested_visual: parsed.suggested_visual,
    recommended_format: parsed.recommended_format
  };
}

function writeQcDashboards(manifest, results, summaryObjs, sections) {
  if (!manifest || !manifest.overall || !manifest.posts) return;
  writeQcRapiSheet(manifest, results, summaryObjs);
  writeQcFinalContentSheet(manifest, results, sections);
}

function writeQcRapiSheet(manifest, results, summaryObjs) {
  const sheet = getQcViewSheet();
  const o = manifest.overall;
  const days = Object.keys(results || {}).map(Number).sort(function (a, b) { return a - b; });

  const header = ['Day', 'Objective', 'Pillar', 'Content Type', 'Topic', 'Angle', 'Hook', 'CTA', 'Format',
    'Original', 'Action', 'Attempt', 'Initial Score', 'Final Score', 'Final Status', 'Primary Issue', 'Issues'];

  const rows = days.map(function (day) {
    const r = results[day] || {};
    const s = (typeof findSummary === 'function') ? findSummary(summaryObjs || [], day) : null;
    const primary = (r.diagnosis && r.diagnosis.primary_issue) || '';
    return [
      day,
      (s && s.objective) || '',
      (s && s.pillar) || '',
      (s && s.content_type) || '',
      (s && s.topic) || '',
      (s && s.angle) || '',
      (s && s.hook) || '',
      (s && s.cta) || '',
      (s && s.format) || '',
      r.original_status || '',
      r.action || '',
      r.attempt || 0,
      (typeof r.score === 'number' && !isNaN(r.score)) ? r.score : '',
      (typeof r.final_score === 'number' && !isNaN(r.final_score)) ? r.final_score : '',
      r.final_status || '',
      primary,
      (r.issues || []).join('; ')
    ];
  });

  sheet.clear();
  // Judul + ringkasan (baris 1-2), tabel mulai baris 4 agar header tetap 1 baris utuh.
  sheet.getRange(1, 1).setValue('QC RAPI — Post-by-Post (view otomatis dari QUALITY_CONTROL, jangan dipakai sebagai input program)');
  sheet.getRange(2, 1).setValue(
    'Update: ' + new Date().toLocaleString() +
    ' | Total: ' + o.total_posts +
    ' | Passed: ' + o.passed +
    ' | Auto-Revised: ' + o.auto_revised +
    ' | Auto-Regenerated: ' + o.auto_regenerated +
    ' | Needs Human Review: ' + o.needs_human_review +
    ' | Campaign: ' + o.campaign_status +
    ' | Timeout: ' + o.timeout_limited
  );
  sheet.getRange('1:2').setFontWeight('bold').setBackground('#f3f3f3').setFontSize(10);
  sheet.getRange(2, 1).setFontWeight('normal');

  const HEADER_ROW = 4;
  sheet.getRange(HEADER_ROW, 1, 1, header.length).setValues([header])
    .setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sheet.setRowHeight(HEADER_ROW, 30);

  if (rows.length) {
    sheet.getRange(HEADER_ROW + 1, 1, rows.length, header.length).setValues(rows)
      .setVerticalAlignment('top').setWrap(true);
    // Warna status agar mudah scan.
    const STATUS_COL = 15; // Final Status
    const bg = rows.map(function (row) {
      const c = qcStatusColor(row[STATUS_COL - 1]);
      const line = [];
      for (let i = 0; i < header.length; i++) line.push(i === STATUS_COL - 1 ? c : '#ffffff');
      return line;
    });
    sheet.getRange(HEADER_ROW + 1, 1, rows.length, header.length).setBackgrounds(bg);
  }

  const widths = [60, 130, 130, 120, 180, 180, 220, 150, 120, 90, 130, 75, 90, 90, 130, 160, 300];
  widths.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  try { sheet.setFrozenRows(HEADER_ROW); } catch (e) {}
  try {
    const existing = sheet.getFilter();
    if (existing) existing.remove();
    sheet.getRange(HEADER_ROW, 1, rows.length + 1, header.length).createFilter();
  } catch (e) {}
}

function writeQcFinalContentSheet(manifest, results, sections) {
  const sheet = getQcContentSheet();
  const days = Object.keys(results || {}).map(Number).sort(function (a, b) { return a - b; });

  const header = ['Day', 'Objective', 'Pillar', 'Content Type', 'Topic', 'Angle', 'Hook', 'Caption', 'CTA',
    'Suggested Visual', 'Recommended Format', 'Final Status', 'Final Score'];

  const rows = days.map(function (day) {
    const r = results[day] || {};
    const c = getFinalContentForDay(day, results, sections);
    return [
      day, c.objective, c.pillar, c.content_type, c.topic, c.angle, c.hook, c.caption, c.cta,
      c.suggested_visual, c.recommended_format, r.final_status || '',
      (typeof r.final_score === 'number' && !isNaN(r.final_score)) ? r.final_score : ''
    ];
  });

  sheet.clear();
  sheet.getRange(1, 1).setValue('QC FINAL CONTENT — 1 baris = 1 day (hasil repair PASS dipakai, sisanya konten original Engine 4)');
  sheet.getRange(2, 1).setValue('Update: ' + new Date().toLocaleString() + ' | Total: ' + days.length);
  sheet.getRange('1:2').setFontWeight('bold').setBackground('#f3f3f3').setFontSize(10);
  sheet.getRange(2, 1).setFontWeight('normal');

  const HEADER_ROW = 4;
  sheet.getRange(HEADER_ROW, 1, 1, header.length).setValues([header])
    .setFontWeight('bold').setBackground('#188038').setFontColor('#ffffff')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sheet.setRowHeight(HEADER_ROW, 30);

  if (rows.length) {
    sheet.getRange(HEADER_ROW + 1, 1, rows.length, header.length).setValues(rows)
      .setVerticalAlignment('top').setWrap(true);
    const STATUS_COL = 12;
    const bg = rows.map(function (row) {
      const c = qcStatusColor(row[STATUS_COL - 1]);
      const line = [];
      for (let i = 0; i < header.length; i++) line.push(i === STATUS_COL - 1 ? c : '#ffffff');
      return line;
    });
    sheet.getRange(HEADER_ROW + 1, 1, rows.length, header.length).setBackgrounds(bg);
  }

  const widths = [60, 130, 130, 120, 170, 170, 200, 480, 180, 200, 130, 120, 90];
  widths.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  try { sheet.setFrozenRows(HEADER_ROW); } catch (e) {}
  try {
    const existing = sheet.getFilter();
    if (existing) existing.remove();
    sheet.getRange(HEADER_ROW, 1, rows.length + 1, header.length).createFilter();
  } catch (e) {}
}

function ensureQcDashboardsExist(reportText, contentOutputText) {
  const viewSheet = getQcViewSheet();
  const contentSheet = getQcContentSheet();
  const needRebuild = viewSheet.getLastRow() < 5 || contentSheet.getLastRow() < 5;
  if (!needRebuild) return;
  const manifest = extractManifestFromReport(reportText);
  if (!manifest) return;
  // Rekonstruksi results + summary minimal dari manifest agar tabel tetap bisa ditulis
  // tanpa mengulang call AI yang mahal.
  const results = {};
  const summaryObjs = [];
  (manifest.posts || []).forEach(function (p) {
    results[p.day] = {
      day: p.day,
      original_status: p.original_status,
      action: p.action,
      attempt: p.attempt,
      score: (typeof p.score === 'number') ? p.score : 0,
      issues: p.issues || [],
      diagnosis: p.diagnosis || {},
      revised_content: p.revised_content || null,
      qc_after_repair: p.qc_after_repair || null,
      final_status: p.final_status,
      final_score: (typeof p.final_score === 'number') ? p.final_score : null
    };
    const rc = p.revised_content || {};
    summaryObjs.push({
      day: p.day, objective: rc.objective || '', pillar: rc.pillar || '',
      content_type: rc.content_type || '', topic: rc.topic || '', angle: rc.angle || '',
      hook: rc.hook || '', cta: rc.cta || '', format: rc.recommended_format || '',
      status: p.final_status || ''
    });
  });
  const sections = (typeof splitEngine4Sections === 'function' && contentOutputText)
    ? splitEngine4Sections(contentOutputText) : {};
  // Lengkapi summary kosong dari sections Engine 4.
  summaryObjs.forEach(function (s) {
    if (!s.topic && !s.objective && sections[s.day]) {
      const f = parseSectionFields(sections[s.day]);
      s.objective = f.objective; s.pillar = f.pillar; s.content_type = f.content_type;
      s.topic = f.topic; s.angle = f.angle;
      if (!s.hook) s.hook = f.hook;
      if (!s.cta) s.cta = f.cta;
      if (!s.format) s.format = f.recommended_format;
    }
  });
  writeQcDashboards(manifest, results, summaryObjs, sections);
}

function rebuildQcDashboardsForce() {
  // Rebuild paksa QC_RAPI + QC_FINAL_CONTENT dari data existing
  // (QUALITY_CONTROL + CONTENT_OUTPUT) tanpa call LLM ulang.
  // Pakai setelah fix parser, atau jika QC_FINAL_CONTENT hanya terisi Day/Status/Score.
  const report = readOutputColumn(getOutputSheet5(), Config.OUTPUT_CELL_5);
  if (!report || !report.trim()) throw new Error('Sheet QUALITY_CONTROL masih kosong. Jalankan Engine 5 dulu.');
  let contentOutput = '';
  try {
    contentOutput = getEngine4Output();
  } catch (e) {
    Logger.log('getEngine4Output gagal (lanjut dengan sections kosong): ' + e.message);
  }
  const manifest = extractManifestFromReport(report);
  if (!manifest) throw new Error('Manifest tidak ditemukan di QUALITY_CONTROL. Jalankan ulang Engine 5.');
  const results = {};
  const summaryObjs = [];
  (manifest.posts || []).forEach(function (p) {
    results[p.day] = {
      day: p.day,
      original_status: p.original_status,
      action: p.action,
      attempt: p.attempt,
      score: (typeof p.score === 'number') ? p.score : 0,
      issues: p.issues || [],
      diagnosis: p.diagnosis || {},
      revised_content: p.revised_content || null,
      qc_after_repair: p.qc_after_repair || null,
      final_status: p.final_status,
      final_score: (typeof p.final_score === 'number') ? p.final_score : null
    };
    const rc = p.revised_content || {};
    summaryObjs.push({
      day: p.day, objective: rc.objective || '', pillar: rc.pillar || '',
      content_type: rc.content_type || '', topic: rc.topic || '', angle: rc.angle || '',
      hook: rc.hook || '', cta: rc.cta || '', format: rc.recommended_format || '',
      status: p.final_status || ''
    });
  });
  const sections = splitEngine4Sections(contentOutput);
  summaryObjs.forEach(function (s) {
    if (!s.topic && !s.objective && sections[s.day]) {
      const f = parseSectionFields(sections[s.day]);
      s.objective = f.objective; s.pillar = f.pillar; s.content_type = f.content_type;
      s.topic = f.topic; s.angle = f.angle;
      if (!s.hook) s.hook = f.hook;
      if (!s.cta) s.cta = f.cta;
      if (!s.format) s.format = f.recommended_format;
    }
  });
  writeQcDashboards(manifest, results, summaryObjs, sections);
  const keys = Object.keys(sections).map(Number).sort(function (a, b) { return a - b; });
  let empty = 0;
  keys.forEach(function (d) {
    const c = getFinalContentForDay(d, results, sections);
    if (!c.objective && !c.topic && !c.caption) empty += 1;
  });
  const msg = 'Rebuild selesai. sections Engine4=' + keys.length + ' [' + keys.slice(0, 10).join(',') + (keys.length > 10 ? '...' : '') + '], hari tanpa konten=' + empty + '. Cek sheet QC_RAPI & QC_FINAL_CONTENT.';
  Logger.log(msg);
  return msg;
}

function debugQcFinalContent() {
  // Diagnostik: kenapa QC_FINAL_CONTENT hanya terisi Day/Status/Score.
  // Jalankan via Apps Script > pilih fungsi > Run > lihat Logs.
  let contentOutput = '';
  try {
    contentOutput = getEngine4Output();
  } catch (e) {
    return 'Gagal baca CONTENT_OUTPUT: ' + e.message;
  }
  const sections = splitEngine4Sections(contentOutput);
  const keys = Object.keys(sections).map(Number).sort(function (a, b) { return a - b; });
  Logger.log('CONTENT_OUTPUT len=' + contentOutput.length + ', sections=' + keys.length + ', keys=[' + keys.slice(0, 10).join(',') + ']');
  Logger.log('Snippet awal CONTENT_OUTPUT (500 char): ' + String(contentOutput).slice(0, 500));
  const samples = keys.slice(0, 3);
  if (!samples.length) {
    Logger.log(' sections KOSONG -> splitEngine4Sections tidak menemukan marker DAY. Cek apakah Engine 4 pakai format "# DAY" / "## DAY".');
    return 'sections=0. Format DAY marker tidak dikenali. Lihat Logs untuk snippet.';
  }
  samples.forEach(function (d) {
    const raw = String(sections[d] || '').slice(0, 600);
    const parsed = parseSectionFields(sections[d]);
    Logger.log('--- DAY ' + d + ' raw ---\n' + raw);
    Logger.log('--- DAY ' + d + ' parsed ---\n' + JSON.stringify(parsed));
  });
  let empty = 0;
  keys.forEach(function (d) {
    const p = parseSectionFields(sections[d]);
    if (!p.objective && !p.topic && !p.caption && !p.hook) empty += 1;
  });
  const msg = 'sections=' + keys.length + ', kosong total=' + empty + '. Jika kosong banyak -> format label Engine 4 tidak cocok (mis. **bold**, bullet, atau "Suggested Visual Direction").';
  Logger.log(msg);
  return msg;
}

function extractManifestFromReport(reportText) {
  try {
    const t = String(reportText || '');
    const idx = t.indexOf('=== JSON MANIFEST ===');
    if (idx === -1) return null;
    const jsonPart = t.slice(idx + '=== JSON MANIFEST ==='.length).trim();
    const start = jsonPart.indexOf('{');
    const end = jsonPart.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return JSON.parse(jsonPart.slice(start, end + 1));
  } catch (e) {
    Logger.log('extractManifest gagal: ' + e.message);
    return null;
  }
}

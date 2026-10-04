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
    return existingReport;
  }

  const report = runEngine5QualityController(businessContext, contentStrategy, contentOutput);
  writeEngineOutput(sheet, 'HASIL ENGINE 5 - QUALITY + DIVERSITY CONTROLLER + AUTO REPAIR', report);
  sheet.getRange(ENGINE5_SIG_CELL).setValue(signature);
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
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const map = {};
  let currentDay = null;
  let buffer = [];
  const dayMarker = /^#\s*DAY\s+(\d+)/i;
  lines.forEach(function (line) {
    const m = line.match(dayMarker);
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

/**
 * DebugEngine5.gs — fungsi diagnostik sementara untuk Engine 5.
 * Tidak dipakai pipeline. Aman dihapus setelah masalah QC selesai.
 * Cara pakai: Apps Script > pilih fungsi > Run > lihat Logs (View > Logs / Executions).
 */

function debugEngine5Prereqs() {
  var c1 = getEngine1Output();
  var c2 = getEngine2Output();
  var c4 = getEngine4Output();
  var sections = splitEngine4Sections(c4);
  Logger.log('len E1=' + c1.length + ' E2=' + c2.length + ' E4=' + c4.length);
  Logger.log('sections Engine4=' + Object.keys(sections).length + ' keys=' + Object.keys(sections).slice(0, 5).join(','));
  var sh1 = getQcViewSheet();
  var sh2 = getQcContentSheet();
  Logger.log('QC_RAPI lastRow=' + sh1.getLastRow() + ' QC_FINAL lastRow=' + sh2.getLastRow());
}

function testQcWriteDummy() {
  var manifest = {
    overall: {
      total_posts: 1,
      passed: 1,
      auto_revised: 0,
      auto_regenerated: 0,
      needs_human_review: 0,
      campaign_status: 'READY',
      timeout_limited: false
    },
    posts: [
      {
        day: 1,
        original_status: 'PASS',
        action: 'KEEP',
        attempt: 0,
        score: 90,
        issues: [],
        diagnosis: {},
        revised_content: null,
        qc_after_repair: null,
        final_status: 'PASS',
        final_score: 90
      }
    ]
  };
  var results = {
    1: {
      day: 1,
      original_status: 'PASS',
      action: 'KEEP',
      attempt: 0,
      score: 90,
      issues: [],
      diagnosis: {},
      revised_content: null,
      qc_after_repair: null,
      final_status: 'PASS',
      final_score: 90
    }
  };
  var summaries = [
    {
      day: 1,
      objective: 't',
      pillar: 'p',
      content_type: 'c',
      topic: 't',
      angle: 'a',
      hook: 'h',
      cta: 'cta',
      format: 'f',
      status: 'PASS'
    }
  ];
  var sections = {
    1: '# DAY 1\nObjective: t\nHook: h\nCaption: cap\nCTA: cta'
  };
  writeQcDashboards(manifest, results, summaries, sections);
  Logger.log('test tulis selesai, cek QC_RAPI baris 4-5');
}

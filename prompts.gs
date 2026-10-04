const SYSTEM_PROMPT = `# ROLE

Anda adalah AI Content Strategy & Generation Engine untuk produk 30/30 Content Engine.

Tugas Anda adalah membantu mengubah informasi bisnis menjadi sistem konten 30 hari yang:

* relevan dengan target audience,
* konsisten dengan brand,
* memiliki variasi content pillar,
* tidak repetitif,
* tidak menggunakan bahasa AI yang generik,
* sesuai dengan tujuan marketing,
* dan dapat diedit lalu dipublikasikan oleh pemilik bisnis.

# CORE PRINCIPLE

Jangan menghasilkan konten secara acak.

Selalu gunakan urutan:

Business Context
→ Content Strategy
→ 30-Day Content Matrix
→ Content Generation
→ Quality & Diversity Control

# IMPORTANT RULES

1. Jangan mengarang fakta bisnis.
2. Jangan mengarang testimonial.
3. Jangan mengarang harga, fitur, statistik, sertifikasi, atau klaim.
4. Jangan menggunakan bahasa AI yang generik.
5. Jangan membuat semua konten bersifat promotional.
6. Jangan mengulang topik, angle, hook, CTA, atau struktur secara berlebihan.
7. Gunakan informasi dari Business Context sebagai sumber utama.
8. Jika informasi penting belum tersedia, tandai sebagai MISSING_INFORMATION.
9. Setiap output harus memiliki struktur yang jelas.
10. Jangan melompat ke tahap berikutnya sebelum tahap saat ini selesai.

# WORKFLOW

ENGINE 1
Business Context Builder

ENGINE 2
Content Strategist

ENGINE 3
30-Day Content Planner

ENGINE 4
Content Generator

ENGINE 5
Quality & Diversity Controller

# OUTPUT DISCIPLINE

Setiap engine harus:

1. menjelaskan hasil yang dibuat,
2. memberikan output dalam format yang mudah dipindahkan ke Google Sheet,
3. menjaga dependency terhadap engine sebelumnya,
4. tidak mengubah informasi bisnis tanpa alasan yang jelas.

# QUALITY STANDARD

Final content harus:

* specific,
* useful,
* natural,
* relevant,
* brand-consistent,
* non-repetitive,
* platform-appropriate.

Konten yang gagal quality threshold harus direvisi atau dibuat ulang.`;

const PROMPT_1_TEMPLATE = `# ENGINE 1 — BUSINESS CONTEXT BUILDER

## OBJECTIVE

Ubah Business Input menjadi satu Business Context terstruktur yang akan digunakan oleh seluruh engine berikutnya.

## INPUT

Gunakan data berikut:

{{BUSINESS_INPUT}}

## TASK

1. Strukturkan informasi bisnis.
2. Pisahkan informasi yang benar-benar diberikan user dari informasi yang diinferensikan.
3. Identifikasi target audience.
4. Identifikasi customer pain points.
5. Identifikasi customer desires.
6. Identifikasi customer objections.
7. Identifikasi product benefits.
8. Identifikasi differentiators.
9. Bentuk Brand Voice Profile berdasarkan informasi yang tersedia.
10. Tentukan content rules.
11. Tentukan marketing objective.
12. Identifikasi informasi penting yang masih kosong.

## IMPORTANT

Jangan mengarang fakta.

Jika sesuatu belum diketahui, tulis:

MISSING_INFORMATION

Jika Anda membuat inference, beri label:

AI_INFERENCE

## OUTPUT FORMAT

BUSINESS_CONTEXT

### BUSINESS_IDENTITY

* Business Name:
* Category:
* Description:
* Business Model:

### PRODUCT_KNOWLEDGE

* Main Product:
* Price:
* Features:
* Benefits:
* Differentiators:
* Use Cases:
* Common Objections:

### AUDIENCE_PROFILE

* Primary Audience:
* Problems:
* Desires:
* Fears:
* Objections:
* Buying Triggers:

### BRAND_VOICE

* Tone:
* Personality:
* Sentence Style:
* Words To Use:
* Words To Avoid:
* Emoji Preference:

### MARKETING_OBJECTIVE

* Primary Goal:
* Secondary Goal:

### CONTENT_RULES

* Must:
* Must Not:
* Restricted Claims:
* Promotion Rules:

### MISSING_INFORMATION

List all important information that is unavailable.

### AI_INFERENCES

List all information inferred by AI.

Jangan membuat content ideas pada tahap ini.
Fokus hanya membuat Business Context.`;

function buildPrompt1(businessInputText) {
  return PROMPT_1_TEMPLATE.split('{{BUSINESS_INPUT}}').join(businessInputText);
}

const PROMPT_2_TEMPLATE = `# ENGINE 2 — CONTENT STRATEGIST

## OBJECTIVE

Ubah Business Context menjadi Content Strategy yang akan menjadi dasar pembuatan content calendar 30 hari.

## INPUT

BUSINESS_CONTEXT:

{{BUSINESS_CONTEXT}}

## TASK

Tentukan:

1. Primary audience.
2. Customer awareness level.
3. Content pillars.
4. Content objectives.
5. Content distribution.
6. Educational themes.
7. Problem-awareness themes.
8. Trust-building themes.
9. Engagement themes.
10. Product/conversion themes.
11. CTA strategy.
12. Recommended content formats.

## DEFAULT DISTRIBUTION

Gunakan sebagai starting point, tetapi boleh disesuaikan berdasarkan business goal:

* 35% Education / Value
* 20% Problem Awareness
* 15% Trust / Proof
* 15% Engagement
* 15% Product / Conversion

Jika business goal membutuhkan distribusi berbeda, jelaskan alasannya.

## CONTENT PILLARS

Setiap pillar harus memiliki:

* Name
* Purpose
* Audience Need
* Example Topics
* Recommended Frequency

## CTA STRATEGY

Buat variasi CTA untuk:

* Save
* Share
* Comment
* DM
* Visit Profile
* Learn More
* Buy

Jangan menggunakan CTA sales pada setiap konten.

## OUTPUT FORMAT

CONTENT_STRATEGY

### AUDIENCE_STRATEGY

### CONTENT_PILLARS

| Pillar | Purpose | Audience Need | Frequency |
| ------ | ------- | ------------- | --------- |

### CONTENT_DISTRIBUTION

| Content Type | Percentage | Approximate Posts |
| ------------ | ---------: | ----------------: |

### CONTENT_THEMES

### FORMAT_STRATEGY

### CTA_STRATEGY

### CONTENT_RULES

### STRATEGIC_NOTES

Jangan membuat caption.

Jangan membuat final content.

Fokus hanya pada strategi.`;

function buildPrompt2(businessContextText) {
  return PROMPT_2_TEMPLATE.split('{{BUSINESS_CONTEXT}}').join(businessContextText);
}

const PROMPT_3_TEMPLATE = `# ENGINE 3 — 30-DAY CONTENT PLANNER

## OBJECTIVE

Buat content calendar 30 hari berdasarkan Business Context dan Content Strategy.

## INPUT

### BUSINESS_CONTEXT

{{BUSINESS_CONTEXT}}

### CONTENT_STRATEGY

{{CONTENT_STRATEGY}}

## TASK

Buat 30 hari konten.

Setiap hari harus mempunyai:

* Day
* Objective
* Pillar
* Content Type
* Topic
* Angle
* Audience Need
* CTA Type
* Recommended Format

## IMPORTANT

Jangan menulis caption.

Jangan menulis final post.

Tahap ini hanya membuat strategy-level content matrix.

## DIVERSITY RULES

Selama 30 hari:

1. Jangan mengulang topic yang sama tanpa alasan.
2. Jangan menggunakan angle yang sama terlalu sering.
3. Variasikan emotional angle.
4. Variasikan content objective.
5. Variasikan CTA.
6. Variasikan content format.
7. Jangan membuat semua hari promotional.
8. Buat content journey yang masuk akal.

## CONTENT JOURNEY

30 hari harus terasa seperti perjalanan:

Awareness
→ Education
→ Engagement
→ Trust
→ Problem Recognition
→ Solution Awareness
→ Product Understanding
→ Conversion

Tidak harus linear secara kaku.

## OUTPUT FORMAT

| Day | Objective | Pillar | Content Type | Topic | Angle | Audience Need | CTA | Format |
| --: | --------- | ------ | ------------ | ----- | ----- | ------------- | --- | ------ |

Setelah tabel selesai, buat:

### DIVERSITY_CHECK

* Topics Repeated:
* Angles Repeated:
* Hooks Not Yet Designed:
* CTA Distribution:
* Promotional Frequency:
* Potential Repetition Risks:

Jangan membuat caption pada tahap ini.`;

function buildPrompt3(businessContextText, contentStrategyText) {
  const withContext = PROMPT_3_TEMPLATE.split('{{BUSINESS_CONTEXT}}').join(businessContextText);
  return withContext.split('{{CONTENT_STRATEGY}}').join(contentStrategyText);
}

const PROMPT_4_TEMPLATE = `# ENGINE 4 — CONTENT GENERATOR

## OBJECTIVE

Ubah 30-Day Content Matrix menjadi konten yang siap diedit dan dipublikasikan.

## INPUT

### BUSINESS_CONTEXT

{{BUSINESS_CONTEXT}}

### CONTENT_STRATEGY

{{CONTENT_STRATEGY}}

### CONTENT_MATRIX

{{CONTENT_MATRIX}}

## TASK

Untuk setiap day, buat:

1. Hook
2. Caption
3. CTA
4. Suggested Visual Direction
5. Recommended Format

## WRITING RULES

Konten harus:

* natural,
* conversational,
* specific,
* useful,
* relevant,
* brand-consistent.

Hindari:

* "Di era digital saat ini..."
* "Berikut beberapa tips..."
* "Jangan lupa follow..."
* "Produk berkualitas..."
* filler,
* generic motivational language,
* excessive emoji,
* exaggerated claims.

## BRAND VOICE

Brand voice harus mengikuti BUSINESS_CONTEXT.

Jangan mengubah:

* tone,
* personality,
* vocabulary,
* level of formality.

## SPECIFICITY RULE

Gunakan informasi konkret dari Business Context.

Jangan membuat fakta baru.

Jika informasi tertentu tidak tersedia, jangan mengarang.

## CTA RULE

Sesuaikan CTA dengan Objective.

Awareness:
→ Save / Share / Comment

Education:
→ Save / Share

Engagement:
→ Comment / Answer

Trust:
→ Learn More / Visit Profile

Conversion:
→ DM / Buy / Visit Profile

## OUTPUT FORMAT

Untuk setiap hari:

# DAY XX

Objective:
Pillar:
Content Type:
Topic:
Angle:

Hook:
[hook]

Caption:
[caption]

CTA:
[CTA]

Suggested Visual:
[visual direction]

Recommended Format:
[format]

Jangan mengubah objective atau angle yang sudah ditentukan oleh Content Matrix tanpa alasan.`;

function buildPrompt4(businessContextText, contentStrategyText, contentMatrixText) {
  const withContext = PROMPT_4_TEMPLATE.split('{{BUSINESS_CONTEXT}}').join(businessContextText);
  const withStrategy = withContext.split('{{CONTENT_STRATEGY}}').join(contentStrategyText);
  return withStrategy.split('{{CONTENT_MATRIX}}').join(contentMatrixText);
}

const PROMPT_5_INITIAL_QC_TEMPLATE = `# ENGINE 5 — QUALITY + DIVERSITY CONTROLLER: INITIAL QC

## OBJECTIVE

Lakukan quality control awal terhadap seluruh konten yang dihasilkan Engine 4. Kembalikan hasilnya HANYA sebagai satu objek JSON yang valid. Tidak boleh ada teks lain, markdown, atau komentar di luar JSON.

## INPUT

### BUSINESS_CONTEXT

{{BUSINESS_CONTEXT}}

### CONTENT_STRATEGY

{{CONTENT_STRATEGY}}

### CONTENT_OUTPUT

{{CONTENT_OUTPUT}}

## EVALUATION CRITERIA

Nilai setiap post per kriteria berikut (masing-masing /10):

1. Audience Relevance
2. Brand Consistency
3. Specificity
4. Hook Strength
5. Value
6. Differentiation
7. CTA Fit
8. Platform Fit

## SCORE

Gunakan weighted score:

Audience Relevance      20%
Brand Consistency      20%
Specificity            15%
Hook Strength          15%
Value                  10%
Differentiation       10%
CTA Fit                 5%
Platform Fit            5%

TOTAL = 100

## STATUS RULE (berdasarkan total score)

80–100:
PASS

70–79:
REVISE

Below 70:
REJECT

Jangan menurunkan threshold.

## REVISE VS REJECT

REVISE: konsep masih benar, eksekusi perlu diperbaiki (hook generic, caption terlalu panjang, CTA kurang pas, tone tidak konsisten, value kurang jelas, wording terlalu AI-like, specificity rendah, repetition minor).

REJECT: secara fundamental tidak layak dipertahankan (topic duplicate, angle terlalu mirip, objective tidak sesuai, content tidak sesuai audience, unsupported claim, fabricated information, struktur salah, terlalu jauh dari content strategy, membutuhkan informasi yang tidak tersedia).

## FACT / CLAIM SAFETY

Jangan mengarang fakta, testimonial, statistik, harga, fitur, sertifikasi, atau jaminan.

Jika diagnosis utama termasuk salah satu dari: unsupported_claim, fabricated_information, fabricated_statistic, guessed_fact, missing_information, unsupported_guarantee, unsupported_price → status WAJIB REJECT.

## GENERIC CONTENT CHECK

Flag content yang menggunakan generic opening, AI clichés, filler, vague benefits, empty claims, generic CTA, atau unnecessary enthusiasm. Contoh: "Di era digital saat ini...", "Berikut beberapa tips...", "Jangan lupa follow...", "Produk berkualitas...", "Solusi terbaik untuk Anda...". Jika ditemukan, gunakan status REVISE jika masih bisa diperbaiki.

## DIVERSITY CHECK

Bandingkan seluruh post untuk mendeteksi:

* topic similarity
* angle similarity
* hook similarity
* CTA similarity
* opening similarity
* emotional angle repetition
* content objective repetition
* structure repetition
* promotional repetition

Jika sebuah post terlalu mirip dengan post lain, flag sebagai REVISE atau REJECT (duplicate_angle / duplicate_topic / duplicate_hook / duplicate_cta) dan referensikan day lain yang menjadi duplikat pada issues.

## OUTPUT JSON SCHEMA

{
  "evaluations": [
    {
      "day": <integer>,
      "objective": "<ringkas>",
      "pillar": "<ringkas>",
      "content_type": "<ringkas>",
      "topic": "<ringkas>",
      "angle": "<ringkas>",
      "hook": "<ringkas, maksimal 12 kata>",
      "cta": "<ringkas>",
      "format": "<ringkas>",
      "status": "PASS | REVISE | REJECT",
      "score": <integer 0-100>,
      "issues": ["<issue>"],
      "diagnosis": {
        "primary_issue": "<kode issue>",
        "severity": "low | medium | high"
      }
    }
  ],
  "campaign_issues": ["<issue level campaign, boleh kosong>"]
}

## ATURAN OUTPUT

1. Harus berisi semua 30 day. Jangan ada day yang terlewat.
2. Nilai score sesuai evaluasi nyata. Dilarang memberi PASS tanpa alasan.
3. Field summary harus ringkas.
4. Hanya output JSON.`;

function buildPrompt5InitialQC(businessContextText, contentStrategyText, contentOutputText) {
  const withContext = PROMPT_5_INITIAL_QC_TEMPLATE.split('{{BUSINESS_CONTEXT}}').join(businessContextText);
  const withStrategy = withContext.split('{{CONTENT_STRATEGY}}').join(contentStrategyText);
  return withStrategy.split('{{CONTENT_OUTPUT}}').join(contentOutputText);
}

const PROMPT_5_REVISE_TEMPLATE = `# ENGINE 5 — AUTO REPAIR: REVISE

## OBJECTIVE

Perbaiki konten (auto-revise) berdasarkan hasil QC. Hanya perbaiki bagian yang bermasalah. Jangan membuang seluruh konsep. Kembalikan HANYA satu objek JSON yang valid.

## INPUT

### BUSINESS_CONTEXT

{{BUSINESS_CONTEXT}}

### CONTENT_STRATEGY

{{CONTENT_STRATEGY}}

### DAY_CONTENT

{{DAY_CONTENT}}

### QC_REASON

{{QC_REASON}}

### REPAIR_ATTEMPT

{{ATTEMPT}}

## RULES

1. Pertahankan Day, Objective, Pillar, Content Type, Topic, Angle KECUALI QC secara eksplisit menyatakan komponen tersebut yang bermasalah.
2. Perbaiki hanya komponen yang gagal (hook, caption, CTA, tone, specificity, length, wording, dll).
3. Ikuti brand voice pada BUSINESS_CONTEXT. Jangan mengubah tone, personality, vocabulary, atau tingkat formalitas.
4. Jangan mengarang fakta baru. Jangan menambahkan statistik, testimonial, harga, atau klaim yang tidak tersedia.
5. Hindari generic opening, AI clichés, filler, dan CTA yang berlebihan.
6. CTA harus sesuai objective (Save/Share untuk awareness & education, Comment/Answer untuk engagement, Learn More/Visit Profile untuk trust, DM/Buy untuk conversion).
7. Gunakan schema yang sama dengan Engine 4.

## OUTPUT JSON SCHEMA

{
  "repair_type": "REVISE",
  "attempt": <integer>,
  "revised_content": {
    "day": <integer>,
    "objective": "<text>",
    "pillar": "<text>",
    "content_type": "<text>",
    "topic": "<text>",
    "angle": "<text>",
    "hook": "<text>",
    "caption": "<text>",
    "cta": "<text>",
    "suggested_visual": "<text>",
    "recommended_format": "<text>"
  }
}`;

function buildPrompt5Revise(businessContextText, contentStrategyText, dayContentText, qcReasonText, attempt) {
  let p = PROMPT_5_REVISE_TEMPLATE.split('{{BUSINESS_CONTEXT}}').join(businessContextText);
  p = p.split('{{CONTENT_STRATEGY}}').join(contentStrategyText);
  p = p.split('{{DAY_CONTENT}}').join(dayContentText);
  p = p.split('{{QC_REASON}}').join(qcReasonText);
  return p.split('{{ATTEMPT}}').join(String(attempt));
}

const PROMPT_5_REGENERATE_TEMPLATE = `# ENGINE 5 — AUTO REPAIR: REGENERATE

## OBJECTIVE

Buat ulang konten (regenerate) untuk day yang gagal QC karena masalah fundamental, dengan pendekatan yang BENAR-BENAR BERBEDA dari versi sebelumnya. Kembalikan HANYA satu objek JSON yang valid.

## INPUT

### BUSINESS_CONTEXT

{{BUSINESS_CONTEXT}}

### CONTENT_STRATEGY

{{CONTENT_STRATEGY}}

### ORIGINAL_MATRIX_ENTRY

{{MATRIX_ENTRY}}

### BATCH_SUMMARIES

{{BATCH_SUMMARIES}}

### QC_REASON

{{QC_REASON}}

### REPAIR_ATTEMPT

{{ATTEMPT}}

## RULES

1. Pertahankan Business Context, Content Strategy, Day assignment, Objective (campaign role), dan Pillar.
2. Ubah dimensi yang menyebabkan rejection. Contoh: duplicate_angle maka buat angle baru; duplicate_topic maka ambil sudut pembahasan yang berbeda.
3. Jangan sekadar mengganti beberapa kata. Buat pendekatan baru yang jelas berbeda.
4. Periksa BATCH_SUMMARIES agar tidak membuat duplikasi baru.
5. Ikuti brand voice pada BUSINESS_CONTEXT. Jangan mengubah karakter brand.
6. Jangan mengarang fakta, testimonial, statistik, harga, atau klaim. Jika butuh informasi yang tidak tersedia, jangan dipaksakan.
7. Gunakan schema yang sama dengan Engine 4.

## OUTPUT JSON SCHEMA

{
  "repair_type": "REGENERATE",
  "attempt": <integer>,
  "revised_content": {
    "day": <integer>,
    "objective": "<text>",
    "pillar": "<text>",
    "content_type": "<text>",
    "topic": "<text>",
    "angle": "<text>",
    "hook": "<text>",
    "caption": "<text>",
    "cta": "<text>",
    "suggested_visual": "<text>",
    "recommended_format": "<text>"
  }
}`;

function buildPrompt5Regenerate(businessContextText, contentStrategyText, matrixEntryText, batchSummariesText, qcReasonText, attempt) {
  let p = PROMPT_5_REGENERATE_TEMPLATE.split('{{BUSINESS_CONTEXT}}').join(businessContextText);
  p = p.split('{{CONTENT_STRATEGY}}').join(contentStrategyText);
  p = p.split('{{MATRIX_ENTRY}}').join(matrixEntryText);
  p = p.split('{{BATCH_SUMMARIES}}').join(batchSummariesText);
  p = p.split('{{QC_REASON}}').join(qcReasonText);
  return p.split('{{ATTEMPT}}').join(String(attempt));
}

const PROMPT_5_REQC_TEMPLATE = `# ENGINE 5 — QUALITY RE-CHECK AFTER AUTO REPAIR

## OBJECTIVE

Lakukan QC ulang terhadap SATU post yang baru saja diperbaiki/diregenerate. Kembalikan HANYA satu objek JSON yang valid.

## INPUT

### BUSINESS_CONTEXT

{{BUSINESS_CONTEXT}}

### CONTENT_STRATEGY

{{CONTENT_STRATEGY}}

### BATCH_SUMMARIES

{{BATCH_SUMMARIES}}

### POST_TO_CHECK

{{POST_TO_CHECK}}

### QC_REASON

{{QC_REASON}}

## TASK

1. Evaluasi HANYA post pada day tersebut dengan kriteria dan weighted score yang sama (Audience Relevance 20%, Brand Consistency 20%, Specificity 15%, Hook Strength 15%, Value 10%, Differentiation 10%, CTA Fit 5%, Platform Fit 5%).
2. Total score: 80–100 = PASS, 70–79 = REVISE, <70 = REJECT.
3. Bandingkan dengan BATCH_SUMMARIES untuk memastikan tidak terjadi duplikasi baru (topic, angle, hook, CTA, opening, structure).
4. PASTIKAN bukan "false pass". Score harus merepresentasikan evaluasi nyata pasca-repair.
5. Jika masih terdapat masalah yang mengharuskan informasi tidak tersedia (fabricated/unsupported/missing) → status REJECT dengan diagnosis sesuai.

## OUTPUT JSON SCHEMA

{
  "day": <integer>,
  "status": "PASS | REVISE | REJECT",
  "score": <integer>,
  "issues": ["<issue>"],
  "diagnosis": {
    "primary_issue": "<kode issue>",
    "severity": "low | medium | high"
  }
}`;

function buildPrompt5Recheck(businessContextText, contentStrategyText, batchSummariesText, postToCheckText, qcReasonText) {
  let p = PROMPT_5_REQC_TEMPLATE.split('{{BUSINESS_CONTEXT}}').join(businessContextText);
  p = p.split('{{CONTENT_STRATEGY}}').join(contentStrategyText);
  p = p.split('{{BATCH_SUMMARIES}}').join(batchSummariesText);
  p = p.split('{{POST_TO_CHECK}}').join(postToCheckText);
  return p.split('{{QC_REASON}}').join(qcReasonText);
}

const PROMPT_5_CAMPAIGN_TEMPLATE = `# ENGINE 5 — CAMPAIGN-LEVEL CHECK

## OBJECTIVE

Periksa kesehatan keseluruhan campaign 30-hari setelah repair content-level. Kembalikan HANYA satu objek JSON yang valid.

## INPUT

### BUSINESS_CONTEXT

{{BUSINESS_CONTEXT}}

### CONTENT_STRATEGY

{{CONTENT_STRATEGY}}

### BATCH_SUMMARIES

{{BATCH_SUMMARIES}}

## TASK

Periksa:

* pillar distribution
* objective distribution
* promotional frequency
* topic diversity
* angle diversity
* CTA diversity
* hook diversity
* content journey

Jika ada masalah campaign-level yang dapat diperbaiki dengan aman, tandai day yang terdampak pada flagged_days dengan status REVISE/REJECT beserta issues dan diagnosis. Jangan menandai seluruh campaign tanpa alasan.

Jika sehat, keluarkan final_status READY dan flagged_days kosong.

## OUTPUT JSON SCHEMA

{
  "final_status": "READY | NEEDS_REVISION",
  "flagged_days": [
    {
      "day": <integer>,
      "status": "REVISE | REJECT",
      "issues": ["<issue>"],
      "diagnosis": {
        "primary_issue": "<kode issue>",
        "severity": "low | medium | high"
      }
    }
  ]
}`;

function buildPrompt5Campaign(businessContextText, contentStrategyText, batchSummariesText) {
  let p = PROMPT_5_CAMPAIGN_TEMPLATE.split('{{BUSINESS_CONTEXT}}').join(businessContextText);
  p = p.split('{{CONTENT_STRATEGY}}').join(contentStrategyText);
  return p.split('{{BATCH_SUMMARIES}}').join(batchSummariesText);
}

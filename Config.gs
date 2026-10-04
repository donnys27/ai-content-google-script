const Config = {
  API_KEY: 'YOUR_API_KEY_HERE', // isi via Script Properties, jangan hardcode
  AI_MODEL: 'kr/claude-sonnet-4.5',
  AI_API_URL: 'http://103.185.53.170:20128/v1/chat/completions',
  TEMPERATURE: 0.7,
  MAX_TOKENS: 8192,
  SITE_URL: 'https://script.google.com',
  APP_NAME: '30-30-Content-Engine',
  BUSINESS_INPUT_CELLS: {
    businessName: 'B2',
    category: 'B3',
    productName: 'B4',
    price: 'B5',
    targetCustomer: 'B6',
    brandTone: 'B7',
    businessGoal: 'B8'
  },
  INPUT_SHEET: 'BUSINESS_INPUT',
  OUTPUT_SHEET: 'BUSINESS_CONTEXT',
  OUTPUT_CELL: 'A2',
  OUTPUT_SHEET_2: 'CONTENT_STRATEGY',
  OUTPUT_CELL_2: 'A2',
  OUTPUT_SHEET_3: '30_DAYS_MATRIX',
  OUTPUT_CELL_3: 'A2',
  OUTPUT_SHEET_4: 'CONTENT_OUTPUT',
  OUTPUT_CELL_4: 'A2',
  OUTPUT_SHEET_5: 'QUALITY_CONTROL',
  OUTPUT_CELL_5: 'A2'
};

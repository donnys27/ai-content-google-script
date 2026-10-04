const MAX_RETRIES = 4;

function buildRequestOptions(messages) {
  return {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + Config.API_KEY
    },
    payload: JSON.stringify({
      model: Config.AI_MODEL,
      messages: messages,
      stream: false,
      temperature: Config.TEMPERATURE,
      max_tokens: Config.MAX_TOKENS
    }),
    muteHttpExceptions: true,
    timeoutInSeconds: 240
  };
}

function callAI(messages) {
  const options = buildRequestOptions(messages);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = UrlFetchApp.fetch(Config.AI_API_URL, options);
    const httpCode = response.getResponseCode();

    if (httpCode === 200) {
      const data = JSON.parse(response.getContentText());
      const content = data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : '';
      if (!content) {
        throw new Error('Response tidak memiliki konten: ' + JSON.stringify(data));
      }
      return content;
    }

    const body = response.getContentText();
    if (!isRetriable(httpCode) || attempt === MAX_RETRIES) {
      throw buildApiError(httpCode, body);
    }

    const waitMs = computeBackoffMs(response, attempt);
    Logger.log('HTTP ' + httpCode + ' (percobaan ' + attempt + '/' + MAX_RETRIES + '), retry dalam ' + waitMs + 'ms. Body: ' + body);
    Utilities.sleep(waitMs);
  }

  throw buildApiError(429, '{ "error": { "message": "Maximum retries exceeded" } }');
}

function isRetriable(httpCode) {
  return httpCode === 429 || httpCode === 502 || httpCode === 503;
}

function computeBackoffMs(response, attempt) {
  let waitMs = attempt * attempt * 4000;
  const retryAfter = getRetryAfterSeconds(response);
  if (retryAfter > 0) waitMs = Math.max(waitMs, retryAfter * 1000);
  return Math.min(waitMs, 60000);
}

function getRetryAfterSeconds(response) {
  try {
    const headers = response.getAllHeaders();
    const raw = headers['Retry-After'] || headers['retry-after'] || headers['Retry-after'];
    if (!raw) return 0;
    const seconds = parseInt(String(raw), 10);
    return isNaN(seconds) ? 0 : seconds;
  } catch (e) {
    return 0;
  }
}

function buildApiError(httpCode, body) {
  let message = body;
  try {
    const data = JSON.parse(body);
    message = data.error && data.error.message ? data.error.message : body;
  } catch (e) {}

  let hint = '';
  if (httpCode === 429) {
    hint = ' [Rate limit :free: maks 20 req/menit & 50 req/hari tanpa kredit. Tunggu reset, atau top up >= $10 untuk 1000 req/hari.]';
  }

  return new Error('HTTP ' + httpCode + ': ' + message + hint);
}

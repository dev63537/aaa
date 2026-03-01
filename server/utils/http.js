function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...headers
  });
  res.end(JSON.stringify(body));
}

async function parseJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('invalid_json');
  }
}

module.exports = { sendJson, parseJson };

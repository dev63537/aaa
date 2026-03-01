const crypto = require('crypto');
const { TOKEN_SECRET } = require('../config/env');

function toB64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function fromB64Url(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(payload, ttlSeconds) {
  const data = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };
  const body = toB64Url(JSON.stringify(data));
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || !token.includes('.')) return { ok: false, reason: 'invalid_format' };
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  if (sig !== expected) return { ok: false, reason: 'bad_signature' };

  const payload = JSON.parse(fromB64Url(body));
  if (payload.exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}

module.exports = { sign, verify };

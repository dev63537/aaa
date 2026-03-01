const { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } = require('../config/env');
const { sign, verify } = require('../utils/token');
const { findUserByEmail, findUserById, bumpRefreshVersion } = require('../models/store');

function login(email, password) {
  const user = findUserByEmail(email);
  if (!user || user.password !== password) return null;

  const accessToken = sign({ userId: user.id, shopId: user.shopId, role: user.role, type: 'access' }, ACCESS_TOKEN_TTL_SECONDS);
  const refreshToken = sign(
    { userId: user.id, shopId: user.shopId, role: user.role, type: 'refresh', version: user.refreshVersion },
    REFRESH_TOKEN_TTL_SECONDS
  );
  return { accessToken, refreshToken, user: { id: user.id, shopId: user.shopId, role: user.role, email: user.email } };
}

function refresh(refreshToken) {
  const parsed = verify(refreshToken);
  if (!parsed.ok || parsed.payload.type !== 'refresh') return null;

  const user = findUserById(parsed.payload.userId);
  if (!user) return null;
  if (parsed.payload.version !== user.refreshVersion) return null;

  const nextVersion = bumpRefreshVersion(user.id);
  const accessToken = sign({ userId: user.id, shopId: user.shopId, role: user.role, type: 'access' }, ACCESS_TOKEN_TTL_SECONDS);
  const nextRefreshToken = sign(
    { userId: user.id, shopId: user.shopId, role: user.role, type: 'refresh', version: nextVersion },
    REFRESH_TOKEN_TTL_SECONDS
  );
  return { accessToken, refreshToken: nextRefreshToken };
}

module.exports = { login, refresh, verify };

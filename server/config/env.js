module.exports = {
  PORT: Number(process.env.PORT || 3000),
  ACCESS_TOKEN_TTL_SECONDS: 15 * 60,
  REFRESH_TOKEN_TTL_SECONDS: 7 * 24 * 60 * 60,
  TOKEN_SECRET: process.env.TOKEN_SECRET || 'dev-only-secret-change-me'
};

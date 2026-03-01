const { PORT } = require('./config/env');
const { createApp } = require('./app');

const app = createApp();
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Agri-POS API running on port ${PORT}`);
});

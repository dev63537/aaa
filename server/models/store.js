const crypto = require('crypto');

const db = {
  counters: {
    invoiceByShop: {
      'shop-active': 1000,
      'shop-grace': 500,
      'shop-expired': 200
    }
  },
  shops: [
    { id: 'shop-active', name: 'Active Agro', ownerName: 'Ravi', phone: '9000000001', status: 'active', plan: 'premium' },
    { id: 'shop-grace', name: 'Grace Agro', ownerName: 'Neha', phone: '9000000002', status: 'grace', plan: 'basic' },
    { id: 'shop-expired', name: 'Expired Agro', ownerName: 'Amit', phone: '9000000003', status: 'expired', plan: 'free' }
  ],
  subscriptions: [
    { shopId: 'shop-active', plan: 'premium', status: 'active', maxFarmers: 10000, maxBillsPerMonth: 10000 },
    { shopId: 'shop-grace', plan: 'basic', status: 'grace', maxFarmers: 1000, maxBillsPerMonth: 1000 },
    { shopId: 'shop-expired', plan: 'free', status: 'expired', maxFarmers: 100, maxBillsPerMonth: 100 }
    { id: 'shop-active', name: 'Active Agro', status: 'active' },
    { id: 'shop-grace', name: 'Grace Agro', status: 'grace' },
    { id: 'shop-expired', name: 'Expired Agro', status: 'expired' }
  ],
  users: [
    { id: 'u-master', shopId: null, email: 'master@agri.local', password: 'master123', role: 'master_admin', refreshVersion: 0 },
    { id: 'u-active-admin', shopId: 'shop-active', email: 'active@agri.local', password: 'password123', role: 'shop_admin', refreshVersion: 0 },
    { id: 'u-grace-admin', shopId: 'shop-grace', email: 'grace@agri.local', password: 'password123', role: 'shop_admin', refreshVersion: 0 },
    { id: 'u-expired-admin', shopId: 'shop-expired', email: 'expired@agri.local', password: 'password123', role: 'shop_admin', refreshVersion: 0 }
  ],
  farmers: [
    { id: 'f-active-1', shopId: 'shop-active', name: 'Farmer A', village: 'Village 1', isActive: true },
    { id: 'f-grace-1', shopId: 'shop-grace', name: 'Farmer G', village: 'Village 2', isActive: true }
  ],
  products: [
    { id: 'p-active-1', shopId: 'shop-active', name: 'Urea 50kg', category: 'fertilizer', rate: 1200, isActive: true },
    { id: 'p-active-2', shopId: 'shop-active', name: 'Seed Pack A', category: 'seed', rate: 650, isActive: true },
    { id: 'p-grace-1', shopId: 'shop-grace', name: 'Pesticide G', category: 'pesticide', rate: 450, isActive: true }
  ],
  stockBatches: [
    { id: 'b-active-1', shopId: 'shop-active', productId: 'p-active-1', batchNo: 'UA-001', quantity: 100, remainingQty: 100 },
    { id: 'b-active-2', shopId: 'shop-active', productId: 'p-active-2', batchNo: 'SD-001', quantity: 50, remainingQty: 50 },
    { id: 'b-grace-1', shopId: 'shop-grace', productId: 'p-grace-1', batchNo: 'PG-001', quantity: 40, remainingQty: 40 }
  ],
  bills: [],
  yearlyLedgers: []
};

const planDefaults = {
  free: { maxFarmers: 100, maxBillsPerMonth: 100 },
  basic: { maxFarmers: 1000, maxBillsPerMonth: 1000 },
  premium: { maxFarmers: 10000, maxBillsPerMonth: 10000 }
};

function findUserByEmail(email) { return db.users.find((u) => u.email === email); }
function findUserById(userId) { return db.users.find((u) => u.id === userId); }
function bumpRefreshVersion(userId) { const u = findUserById(userId); if (!u) return null; u.refreshVersion += 1; return u.refreshVersion; }

function listShops() { return db.shops.slice(); }
function getShop(shopId) { return db.shops.find((s) => s.id === shopId); }
function createShop(data) {
  const shop = { id: `shop-${crypto.randomUUID()}`, name: data.name, ownerName: data.ownerName, phone: data.phone, status: 'active', plan: data.plan || 'basic' };
  db.shops.push(shop);
  const p = planDefaults[shop.plan] || planDefaults.basic;
  db.subscriptions.push({ shopId: shop.id, plan: shop.plan, status: 'active', ...p });
  db.counters.invoiceByShop[shop.id] = 0;
  return shop;
}
function updateShopStatus(shopId, status) {
  const shop = getShop(shopId);
  if (!shop) return null;
  shop.status = status;
  const sub = getSubscriptionByShop(shopId);
  if (sub) sub.status = status;
  return shop;
}

function getSubscriptionByShop(shopId) { return db.subscriptions.find((s) => s.shopId === shopId); }
function updateSubscriptionByWebhook(event) {
  const sub = getSubscriptionByShop(event.shopId);
  if (!sub) return null;
  if (event.type === 'payment_success') sub.status = 'active';
  if (event.type === 'payment_failed') sub.status = 'grace';
  if (event.type === 'grace_expired') sub.status = 'expired';
  const shop = getShop(event.shopId);
  if (shop) shop.status = sub.status;
  if (event.plan && planDefaults[event.plan]) {
    sub.plan = event.plan;
    sub.maxFarmers = planDefaults[event.plan].maxFarmers;
    sub.maxBillsPerMonth = planDefaults[event.plan].maxBillsPerMonth;
    if (shop) shop.plan = event.plan;
  }
  return sub;
}

function listFarmersByShop(shopId) { return db.farmers.filter((f) => f.shopId === shopId); }
function createFarmer(shopId, data) { const f={ id:`f-${crypto.randomUUID()}`, shopId, name:data.name, village:data.village, isActive:true }; db.farmers.push(f); return f; }
function getFarmerById(shopId, farmerId) { return db.farmers.find((f) => f.shopId === shopId && f.id === farmerId); }

function listProductsByShop(shopId) { return db.products.filter((p) => p.shopId === shopId && p.isActive); }
function createProduct(shopId, data) { const p={ id:`p-${crypto.randomUUID()}`, shopId, name:data.name, category:data.category, rate:data.rate, isActive:true }; db.products.push(p); return p; }
function getProductById(shopId, productId) { return db.products.find((p) => p.shopId === shopId && p.id === productId); }

function listStockByShop(shopId) { return db.stockBatches.filter((b) => b.shopId === shopId); }
function getBatchById(shopId, batchId) { return db.stockBatches.find((b) => b.shopId === shopId && b.id === batchId); }

function nextInvoiceNumber(shopId) { if (!(shopId in db.counters.invoiceByShop)) db.counters.invoiceByShop[shopId] = 0; db.counters.invoiceByShop[shopId] += 1; return db.counters.invoiceByShop[shopId]; }
function createBill(shopId, bill) { const b = { id:`bill-${crypto.randomUUID()}`, shopId, ...bill }; db.bills.push(b); return b; }
function listBillsByShop(shopId) { return db.bills.filter((b) => b.shopId === shopId); }
function findUserByEmail(email) {
  return db.users.find((u) => u.email === email);
}

function findUserById(userId) {
  return db.users.find((u) => u.id === userId);
}

function bumpRefreshVersion(userId) {
  const user = findUserById(userId);
  if (!user) return null;
  user.refreshVersion += 1;
  return user.refreshVersion;
}

function listFarmersByShop(shopId) {
  return db.farmers.filter((f) => f.shopId === shopId);
}

function createFarmer(shopId, data) {
  const farmer = {
    id: `f-${crypto.randomUUID()}`,
    shopId,
    name: data.name,
    village: data.village,
    isActive: true
  };
  db.farmers.push(farmer);
  return farmer;
}

function getFarmerById(shopId, farmerId) {
  return db.farmers.find((f) => f.shopId === shopId && f.id === farmerId);
}

function getShop(shopId) {
  return db.shops.find((s) => s.id === shopId);
}

function listProductsByShop(shopId) {
  return db.products.filter((p) => p.shopId === shopId && p.isActive);
}

function createProduct(shopId, data) {
  const product = {
    id: `p-${crypto.randomUUID()}`,
    shopId,
    name: data.name,
    category: data.category,
    rate: data.rate,
    isActive: true
  };
  db.products.push(product);
  return product;
}

function getProductById(shopId, productId) {
  return db.products.find((p) => p.shopId === shopId && p.id === productId);
}

function listStockByShop(shopId) {
  return db.stockBatches.filter((b) => b.shopId === shopId);
}

function getBatchById(shopId, batchId) {
  return db.stockBatches.find((b) => b.shopId === shopId && b.id === batchId);
}

function nextInvoiceNumber(shopId) {
  if (!(shopId in db.counters.invoiceByShop)) db.counters.invoiceByShop[shopId] = 0;
  db.counters.invoiceByShop[shopId] += 1;
  return db.counters.invoiceByShop[shopId];
}

function createBill(shopId, bill) {
  const full = { id: `bill-${crypto.randomUUID()}`, shopId, ...bill };
  db.bills.push(full);
  return full;
}

function listBillsByShop(shopId) {
  return db.bills.filter((b) => b.shopId === shopId);
}

function upsertLedger(shopId, farmerId, deltaBilled, deltaPaid) {
  const year = new Date().getFullYear();
  let ledger = db.yearlyLedgers.find((l) => l.shopId === shopId && l.farmerId === farmerId && l.year === year);
  if (!ledger) {
    ledger = { id:`ledger-${crypto.randomUUID()}`, shopId, farmerId, year, openingBalance:0, totalBilled:0, totalPaid:0, closingBalance:0, lastEntryAt:new Date().toISOString() };
    db.yearlyLedgers.push(ledger);
  }
    ledger = {
      id: `ledger-${crypto.randomUUID()}`,
      shopId,
      farmerId,
      year,
      openingBalance: 0,
      totalBilled: 0,
      totalPaid: 0,
      closingBalance: 0,
      lastEntryAt: new Date().toISOString()
    };
    db.yearlyLedgers.push(ledger);
  }

  ledger.totalBilled += deltaBilled;
  ledger.totalPaid += deltaPaid;
  ledger.closingBalance = ledger.openingBalance + ledger.totalBilled - ledger.totalPaid;
  ledger.lastEntryAt = new Date().toISOString();
  return ledger;
}
function getLedger(shopId, farmerId, year) { return db.yearlyLedgers.find((l) => l.shopId === shopId && l.farmerId === farmerId && l.year === year) || null; }

function getReportSummary(shopId) {
  const farmers = listFarmersByShop(shopId);
  const bills = listBillsByShop(shopId);
  const totalRevenue = bills.reduce((acc, b) => acc + b.grandTotal, 0);
  const totalDue = bills.reduce((acc, b) => acc + b.dueAmount, 0);
  return { farmerCount: farmers.length, billCount: bills.length, totalRevenue, totalDue };

function getLedger(shopId, farmerId, year) {
  return db.yearlyLedgers.find((l) => l.shopId === shopId && l.farmerId === farmerId && l.year === year) || null;
}

module.exports = {
  db,
  findUserByEmail,
  findUserById,
  bumpRefreshVersion,
  listShops,
  getShop,
  createShop,
  updateShopStatus,
  getSubscriptionByShop,
  updateSubscriptionByWebhook,
  listFarmersByShop,
  createFarmer,
  getFarmerById,
  listFarmersByShop,
  createFarmer,
  getFarmerById,
  getShop,
  listProductsByShop,
  createProduct,
  getProductById,
  listStockByShop,
  getBatchById,
  nextInvoiceNumber,
  createBill,
  listBillsByShop,
  upsertLedger,
  getLedger,
  getReportSummary
  getLedger
};

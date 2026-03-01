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

function getLedger(shopId, farmerId, year) {
  return db.yearlyLedgers.find((l) => l.shopId === shopId && l.farmerId === farmerId && l.year === year) || null;
}

module.exports = {
  db,
  findUserByEmail,
  findUserById,
  bumpRefreshVersion,
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
  getLedger
};

const http = require('http');
const { parse: parseUrl } = require('url');
const {
  listShops,
  createShop,
  updateShopStatus,
  listFarmersByShop,
  createFarmer,
  getShop,
  listProductsByShop,
  createProduct,
  listStockByShop,
  getBatchById,
  getProductById,
  getFarmerById,
  nextInvoiceNumber,
  createBill,
  listBillsByShop,
  upsertLedger,
  getLedger,
  getSubscriptionByShop,
  updateSubscriptionByWebhook,
  getReportSummary
} = require('./models/store');
const { sendJson, parseJson } = require('./utils/http');
const { login, refresh, verify } = require('./services/authService');

function getToken(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice('Bearer '.length);
}

function authenticate(req) {
  const token = getToken(req);
  if (!token) return { ok: false, status: 401, message: 'Missing bearer token' };
  const parsed = verify(token);
  if (!parsed.ok || parsed.payload.type !== 'access') return { ok: false, status: 401, message: 'Invalid token' };
  return { ok: true, user: parsed.payload };
}

function requireRole(user, role) {
  if (user.role !== role) return { ok: false, status: 403, message: `Requires role ${role}` };
  return { ok: true };
}

function tenantGuard(user, shopIdFromPath) {
  if (user.role === 'master_admin') return { ok: true };
  if (!user.shopId) return { ok: false, status: 403, message: 'Tenant context missing' };
  if (shopIdFromPath && user.shopId !== shopIdFromPath) return { ok: false, status: 403, message: 'Cross-tenant access denied' };
  return { ok: true };
}

function subscriptionGuard(user, method) {
  if (user.role === 'master_admin') return { ok: true, warning: null };
  const shop = getShop(user.shopId);
  if (!shop) return { ok: false, status: 403, message: 'Shop not found' };
  const writeMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (writeMethod && shop.status === 'expired') return { ok: false, status: 402, message: 'Subscription expired' };
  if (writeMethod && shop.status === 'grace') return { ok: true, warning: 'Shop is in grace period' };
  return { ok: true, warning: null };
}

function withAuthAndGuards(req, requestId) {
  const auth = authenticate(req);
  if (!auth.ok) return { error: { status: auth.status, body: { error: auth.message, requestId } } };
  const tenant = tenantGuard(auth.user);
  if (!tenant.ok) return { error: { status: tenant.status, body: { error: tenant.message, requestId } } };
  return { user: auth.user };
}

function withWriteGuard(req, user, requestId) {
  const subscription = subscriptionGuard(user, req.method);
  if (!subscription.ok) return { error: { status: subscription.status, body: { error: subscription.message, requestId } } };
  return { warning: subscription.warning };
}

function validateFarmerPayload(payload) {
  if (!payload || typeof payload !== 'object') return 'Payload required';
  if (!payload.name || typeof payload.name !== 'string') return 'name is required';
  if (!payload.village || typeof payload.village !== 'string') return 'village is required';
  return null;
}
function validateProductPayload(payload) {
  if (!payload?.name || typeof payload.name !== 'string') return 'name is required';
  if (!['pesticide', 'fertilizer', 'seed'].includes(payload.category)) return 'category is invalid';
  if (typeof payload.rate !== 'number' || payload.rate <= 0) return 'rate must be > 0';
  return null;
}
function validateBillPayload(payload) {
  if (!payload?.farmerId || typeof payload.farmerId !== 'string') return 'farmerId is required';
  if (!Array.isArray(payload.items) || payload.items.length === 0) return 'items are required';
  return null;
}

function createApp() {
  return http.createServer(async (req, res) => {
    const requestId = require('crypto').randomUUID();
    const path = parseUrl(req.url, true).pathname;

    if (req.method === 'GET' && path === '/health') return sendJson(res, 200, { ok: true, requestId });

    if (req.method === 'POST' && path === '/api/auth/login') {
      try {
        const body = await parseJson(req);
        const result = login(body.email, body.password);
        if (!result) return sendJson(res, 401, { error: 'Invalid credentials', requestId });
        return sendJson(res, 200, { ...result, requestId });
      } catch { return sendJson(res, 400, { error: 'Invalid JSON', requestId }); }
    }

    if (req.method === 'POST' && path === '/api/auth/refresh') {
      try {
        const body = await parseJson(req);
        const result = refresh(body.refreshToken);
        if (!result) return sendJson(res, 401, { error: 'Invalid refresh token', requestId });
        return sendJson(res, 200, { ...result, requestId });
      } catch { return sendJson(res, 400, { error: 'Invalid JSON', requestId }); }
    }

    if (req.method === 'GET' && path === '/api/subscriptions/me') {
      const secured = withAuthAndGuards(req, requestId);
      if (secured.error) return sendJson(res, secured.error.status, secured.error.body);
      const sub = getSubscriptionByShop(secured.user.shopId);
      return sendJson(res, 200, { data: sub, requestId });
    }

    if (req.method === 'POST' && path === '/api/subscriptions/webhook') {
      try {
        const body = await parseJson(req);
        const updated = updateSubscriptionByWebhook(body);
        if (!updated) return sendJson(res, 404, { error: 'Subscription not found', requestId });
        return sendJson(res, 200, { data: updated, requestId });
      } catch { return sendJson(res, 400, { error: 'Invalid JSON', requestId }); }
    }

    if (req.method === 'GET' && path === '/api/admin/shops') {
      const auth = authenticate(req);
      if (!auth.ok) return sendJson(res, auth.status, { error: auth.message, requestId });
      const role = requireRole(auth.user, 'master_admin');
      if (!role.ok) return sendJson(res, role.status, { error: role.message, requestId });
      return sendJson(res, 200, { data: listShops(), requestId });
    }

    if (req.method === 'POST' && path === '/api/admin/shops') {
      const auth = authenticate(req);
      if (!auth.ok) return sendJson(res, auth.status, { error: auth.message, requestId });
      const role = requireRole(auth.user, 'master_admin');
      if (!role.ok) return sendJson(res, role.status, { error: role.message, requestId });
      try {
        const body = await parseJson(req);
        if (!body?.name || !body?.ownerName || !body?.phone) return sendJson(res, 400, { error: 'name, ownerName, phone required', requestId });
        return sendJson(res, 201, { data: createShop(body), requestId });
      } catch { return sendJson(res, 400, { error: 'Invalid JSON', requestId }); }
    }

    const shopStatusMatch = path.match(/^\/api\/admin\/shops\/([^/]+)\/status$/);
    if (shopStatusMatch && req.method === 'PATCH') {
      const auth = authenticate(req);
      if (!auth.ok) return sendJson(res, auth.status, { error: auth.message, requestId });
      const role = requireRole(auth.user, 'master_admin');
      if (!role.ok) return sendJson(res, role.status, { error: role.message, requestId });
      try {
        const body = await parseJson(req);
        if (!['active', 'grace', 'expired'].includes(body.status)) return sendJson(res, 400, { error: 'invalid status', requestId });
        const updated = updateShopStatus(shopStatusMatch[1], body.status);
        if (!updated) return sendJson(res, 404, { error: 'Shop not found', requestId });
        return sendJson(res, 200, { data: updated, requestId });
      } catch { return sendJson(res, 400, { error: 'Invalid JSON', requestId }); }
    }

    if (path === '/api/farmers' && req.method === 'GET') {
      const secured = withAuthAndGuards(req, requestId);
      if (secured.error) return sendJson(res, secured.error.status, secured.error.body);
      return sendJson(res, 200, { data: listFarmersByShop(secured.user.shopId), requestId });
    }

    if (path === '/api/farmers' && req.method === 'POST') {
      const secured = withAuthAndGuards(req, requestId);
      if (secured.error) return sendJson(res, secured.error.status, secured.error.body);
      const writeGuard = withWriteGuard(req, secured.user, requestId);
      if (writeGuard.error) return sendJson(res, writeGuard.error.status, writeGuard.error.body);
      try {
        const body = await parseJson(req);
        const validation = validateFarmerPayload(body);
        if (validation) return sendJson(res, 400, { error: validation, requestId });
        const headers = writeGuard.warning ? { 'X-Subscription-Warning': writeGuard.warning } : {};
        return sendJson(res, 201, { data: createFarmer(secured.user.shopId, body), requestId }, headers);
      } catch { return sendJson(res, 400, { error: 'Invalid JSON', requestId }); }
    }

    if (path === '/api/products' && req.method === 'GET') {
      const secured = withAuthAndGuards(req, requestId);
      if (secured.error) return sendJson(res, secured.error.status, secured.error.body);
      return sendJson(res, 200, { data: listProductsByShop(secured.user.shopId), requestId });
    }

    if (path === '/api/products' && req.method === 'POST') {
      const secured = withAuthAndGuards(req, requestId);
      if (secured.error) return sendJson(res, secured.error.status, secured.error.body);
      const writeGuard = withWriteGuard(req, secured.user, requestId);
      if (writeGuard.error) return sendJson(res, writeGuard.error.status, writeGuard.error.body);
      try {
        const body = await parseJson(req);
        const validation = validateProductPayload(body);
        if (validation) return sendJson(res, 400, { error: validation, requestId });
        const headers = writeGuard.warning ? { 'X-Subscription-Warning': writeGuard.warning } : {};
        return sendJson(res, 201, { data: createProduct(secured.user.shopId, body), requestId }, headers);
      } catch { return sendJson(res, 400, { error: 'Invalid JSON', requestId }); }
    }

    if (path === '/api/stock/batches' && req.method === 'GET') {
      const secured = withAuthAndGuards(req, requestId);
      if (secured.error) return sendJson(res, secured.error.status, secured.error.body);
      return sendJson(res, 200, { data: listStockByShop(secured.user.shopId), requestId });
    }

    if (path === '/api/bills' && req.method === 'GET') {
      const secured = withAuthAndGuards(req, requestId);
      if (secured.error) return sendJson(res, secured.error.status, secured.error.body);
      return sendJson(res, 200, { data: listBillsByShop(secured.user.shopId), requestId });
    }

    if (path === '/api/bills' && req.method === 'POST') {
      const secured = withAuthAndGuards(req, requestId);
      if (secured.error) return sendJson(res, secured.error.status, secured.error.body);
      const writeGuard = withWriteGuard(req, secured.user, requestId);
      if (writeGuard.error) return sendJson(res, writeGuard.error.status, writeGuard.error.body);
      try {
        const body = await parseJson(req);
        const validation = validateBillPayload(body);
        if (validation) return sendJson(res, 400, { error: validation, requestId });
        const farmer = getFarmerById(secured.user.shopId, body.farmerId);
        if (!farmer || !farmer.isActive) return sendJson(res, 400, { error: 'Farmer must be active and in tenant', requestId });

        const items = [];
        let subtotal = 0;
        for (const item of body.items) {
          const qty = Number(item.qty || 0);
          if (qty <= 0) return sendJson(res, 400, { error: 'qty must be > 0', requestId });
          const product = getProductById(secured.user.shopId, item.productId);
          const batch = getBatchById(secured.user.shopId, item.batchId);
          if (!product || !batch) return sendJson(res, 400, { error: 'Product and batch must belong to tenant', requestId });
          if (batch.productId !== product.id) return sendJson(res, 400, { error: 'Batch does not belong to product', requestId });
          if (batch.remainingQty < qty) return sendJson(res, 400, { error: 'Insufficient stock', requestId });
          const rate = Number(item.rate || product.rate);
          const amount = qty * rate;
          items.push({ productId: product.id, batchId: batch.id, qty, rate, amount });
          subtotal += amount;
        }

        const discount = Number(body.discount || 0);
        const paidAmount = Number(body.paidAmount || 0);
        const grandTotal = subtotal - discount;
        const dueAmount = grandTotal - paidAmount;
        if (dueAmount > 0 && !body.signatureImageUrl) return sendJson(res, 400, { error: 'Signature required for credit bill', requestId });

        for (const item of items) getBatchById(secured.user.shopId, item.batchId).remainingQty -= item.qty;

        const bill = createBill(secured.user.shopId, {
          invoiceNumber: nextInvoiceNumber(secured.user.shopId),
          farmerId: farmer.id,
          items,
          subtotal,
          discount,
          grandTotal,
          paidAmount,
          dueAmount,
          signatureImageUrl: body.signatureImageUrl || null,
          createdBy: secured.user.userId,
          createdAt: new Date().toISOString()
        });
        const ledger = upsertLedger(secured.user.shopId, farmer.id, grandTotal, paidAmount);
        const headers = writeGuard.warning ? { 'X-Subscription-Warning': writeGuard.warning } : {};
        return sendJson(res, 201, { data: bill, ledger, requestId }, headers);
      } catch { return sendJson(res, 400, { error: 'Invalid JSON', requestId }); }
    }

    const ledgerMatch = path.match(/^\/api\/ledgers\/([^/]+)\/(\d{4})$/);
    if (ledgerMatch && req.method === 'GET') {
      const secured = withAuthAndGuards(req, requestId);
      if (secured.error) return sendJson(res, secured.error.status, secured.error.body);
      const farmer = getFarmerById(secured.user.shopId, ledgerMatch[1]);
      if (!farmer) return sendJson(res, 404, { error: 'Farmer not found', requestId });
      return sendJson(res, 200, { data: getLedger(secured.user.shopId, ledgerMatch[1], Number(ledgerMatch[2])), requestId });
    }

    if (path === '/api/reports/summary' && req.method === 'GET') {
      const secured = withAuthAndGuards(req, requestId);
      if (secured.error) return sendJson(res, secured.error.status, secured.error.body);
      return sendJson(res, 200, { data: getReportSummary(secured.user.shopId), requestId });
    }

    const matchAdminShopFarmers = path.match(/^\/api\/admin\/shops\/([^/]+)\/farmers$/);
    if (matchAdminShopFarmers && req.method === 'GET') {
      const auth = authenticate(req);
      if (!auth.ok) return sendJson(res, auth.status, { error: auth.message, requestId });
      const tenant = tenantGuard(auth.user, matchAdminShopFarmers[1]);
      if (!tenant.ok) return sendJson(res, tenant.status, { error: tenant.message, requestId });
      return sendJson(res, 200, { data: listFarmersByShop(matchAdminShopFarmers[1]), requestId });
    }

    return sendJson(res, 404, { error: 'Route not found', requestId });
  });
}

module.exports = { createApp };

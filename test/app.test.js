const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');

async function post(baseUrl, path, body, token, method = 'POST') {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
async function post(baseUrl, path, body, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  return { status: res.status, headers: res.headers, json: await res.json() };
}

async function get(baseUrl, path, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: token ? { authorization: `Bearer ${token}` } : {}
  });
  return { status: res.status, headers: res.headers, json: await res.json() };
}

async function withServer(run) {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try { await run(baseUrl); } finally { await new Promise((r) => server.close(r)); }
  try {
    await run(baseUrl);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('auth login + refresh token rotation', async () => {
  await withServer(async (baseUrl) => {
    const login = await post(baseUrl, '/api/auth/login', { email: 'active@agri.local', password: 'password123' });
    assert.equal(login.status, 200);
    const refreshed = await post(baseUrl, '/api/auth/refresh', { refreshToken: login.json.refreshToken });
    assert.equal(refreshed.status, 200);
    assert.ok(login.json.accessToken);
    assert.ok(login.json.refreshToken);

    const refreshed = await post(baseUrl, '/api/auth/refresh', { refreshToken: login.json.refreshToken });
    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.json.refreshToken, login.json.refreshToken);

    const staleRefresh = await post(baseUrl, '/api/auth/refresh', { refreshToken: login.json.refreshToken });
    assert.equal(staleRefresh.status, 401);
  });
});

test('tenant isolation blocks cross-tenant read for non-master users', async () => {
  await withServer(async (baseUrl) => {
    const login = await post(baseUrl, '/api/auth/login', { email: 'active@agri.local', password: 'password123' });
    const crossTenantRead = await get(baseUrl, '/api/admin/shops/shop-grace/farmers', login.json.accessToken);
    assert.equal(crossTenantRead.status, 403);
  });
});

test('subscription guard blocks expired shops and warns grace shops', async () => {
  await withServer(async (baseUrl) => {
    const expiredLogin = await post(baseUrl, '/api/auth/login', { email: 'expired@agri.local', password: 'password123' });
    const expiredWrite = await post(baseUrl, '/api/farmers', { name: 'Blocked Farmer', village: 'Village X' }, expiredLogin.json.accessToken);
    assert.equal(expiredWrite.status, 402);

    const graceLogin = await post(baseUrl, '/api/auth/login', { email: 'grace@agri.local', password: 'password123' });
    const graceWrite = await post(baseUrl, '/api/farmers', { name: 'Grace Farmer', village: 'Village G' }, graceLogin.json.accessToken);
    const expiredWrite = await post(
      baseUrl,
      '/api/farmers',
      { name: 'Blocked Farmer', village: 'Village X' },
      expiredLogin.json.accessToken
    );
    assert.equal(expiredWrite.status, 402);

    const graceLogin = await post(baseUrl, '/api/auth/login', { email: 'grace@agri.local', password: 'password123' });
    const graceWrite = await post(
      baseUrl,
      '/api/farmers',
      { name: 'Grace Farmer', village: 'Village G' },
      graceLogin.json.accessToken
    );
    assert.equal(graceWrite.status, 201);
    assert.equal(graceWrite.headers.get('x-subscription-warning'), 'Shop is in grace period');
  });
});

test('billing deducts stock, allocates invoice number, and updates ledger', async () => {
  await withServer(async (baseUrl) => {
    const login = await post(baseUrl, '/api/auth/login', { email: 'active@agri.local', password: 'password123' });
    const token = login.json.accessToken;
    const beforeStock = await get(baseUrl, '/api/stock/batches', token);
    assert.equal(beforeStock.json.data.find((b) => b.id === 'b-active-1').remainingQty, 100);

    const bill1 = await post(baseUrl, '/api/bills', {
      farmerId: 'f-active-1', items: [{ productId: 'p-active-1', batchId: 'b-active-1', qty: 3 }], paidAmount: 3000, signatureImageUrl: 'sig-1'
    }, token);
    assert.equal(bill1.status, 201);
    assert.equal(bill1.json.data.invoiceNumber, 1001);

    const bill2 = await post(baseUrl, '/api/bills', {
      farmerId: 'f-active-1', items: [{ productId: 'p-active-1', batchId: 'b-active-1', qty: 2 }], paidAmount: 2400
    }, token);

    const beforeStock = await get(baseUrl, '/api/stock/batches', token);
    const targetBatch = beforeStock.json.data.find((b) => b.id === 'b-active-1');
    assert.equal(targetBatch.remainingQty, 100);

    const bill1 = await post(
      baseUrl,
      '/api/bills',
      {
        farmerId: 'f-active-1',
        items: [{ productId: 'p-active-1', batchId: 'b-active-1', qty: 3 }],
        paidAmount: 3000,
        discount: 0,
        signatureImageUrl: 'sig-1'
      },
      token
    );
    assert.equal(bill1.status, 201);
    assert.equal(bill1.json.data.invoiceNumber, 1001);
    assert.equal(bill1.json.ledger.totalBilled, 3600);
    assert.equal(bill1.json.ledger.totalPaid, 3000);
    assert.equal(bill1.json.ledger.closingBalance, 600);

    const bill2 = await post(
      baseUrl,
      '/api/bills',
      {
        farmerId: 'f-active-1',
        items: [{ productId: 'p-active-1', batchId: 'b-active-1', qty: 2 }],
        paidAmount: 2400,
        discount: 0
      },
      token
    );
    assert.equal(bill2.status, 201);
    assert.equal(bill2.json.data.invoiceNumber, 1002);

    const afterStock = await get(baseUrl, '/api/stock/batches', token);
    assert.equal(afterStock.json.data.find((b) => b.id === 'b-active-1').remainingQty, 95);

    const year = new Date().getFullYear();
    const ledger = await get(baseUrl, `/api/ledgers/f-active-1/${year}`, token);
    const sameBatch = afterStock.json.data.find((b) => b.id === 'b-active-1');
    assert.equal(sameBatch.remainingQty, 95);

    const year = new Date().getFullYear();
    const ledger = await get(baseUrl, `/api/ledgers/f-active-1/${year}`, token);
    assert.equal(ledger.status, 200);
    assert.equal(ledger.json.data.totalBilled, 6000);
    assert.equal(ledger.json.data.totalPaid, 5400);
    assert.equal(ledger.json.data.closingBalance, 600);
  });
});

test('credit bill requires signature and rejects cross-tenant product references', async () => {
  await withServer(async (baseUrl) => {
    const login = await post(baseUrl, '/api/auth/login', { email: 'active@agri.local', password: 'password123' });
    const token = login.json.accessToken;

    const missingSignature = await post(baseUrl, '/api/bills', {
      farmerId: 'f-active-1', items: [{ productId: 'p-active-1', batchId: 'b-active-1', qty: 1 }], paidAmount: 0
    }, token);
    assert.equal(missingSignature.status, 400);

    const crossTenant = await post(baseUrl, '/api/bills', {
      farmerId: 'f-active-1', items: [{ productId: 'p-grace-1', batchId: 'b-grace-1', qty: 1 }], paidAmount: 450, signatureImageUrl: 'sig'
    }, token);
    assert.equal(crossTenant.status, 400);
  });
});

test('master admin can manage shops and status, non-master cannot', async () => {
  await withServer(async (baseUrl) => {
    const master = await post(baseUrl, '/api/auth/login', { email: 'master@agri.local', password: 'master123' });
    const user = await post(baseUrl, '/api/auth/login', { email: 'active@agri.local', password: 'password123' });

    const deny = await get(baseUrl, '/api/admin/shops', user.json.accessToken);
    assert.equal(deny.status, 403);

    const shops = await get(baseUrl, '/api/admin/shops', master.json.accessToken);
    assert.equal(shops.status, 200);

    const created = await post(baseUrl, '/api/admin/shops', { name: 'New Agro', ownerName: 'Owner', phone: '9000009999', plan: 'basic' }, master.json.accessToken);
    assert.equal(created.status, 201);

    const patch = await post(baseUrl, `/api/admin/shops/${created.json.data.id}/status`, { status: 'grace' }, master.json.accessToken, 'PATCH');
    assert.equal(patch.status, 200);
    assert.equal(patch.json.data.status, 'grace');
  });
});

test('subscription webhook updates tenant access and summary report works', async () => {
  await withServer(async (baseUrl) => {
    const login = await post(baseUrl, '/api/auth/login', { email: 'active@agri.local', password: 'password123' });
    const token = login.json.accessToken;

    const me = await get(baseUrl, '/api/subscriptions/me', token);
    assert.equal(me.status, 200);
    assert.equal(me.json.data.status, 'active');

    const failEvt = await post(baseUrl, '/api/subscriptions/webhook', { shopId: 'shop-active', type: 'payment_failed' });
    assert.equal(failEvt.status, 200);
    assert.equal(failEvt.json.data.status, 'grace');

    const writeDuringGrace = await post(baseUrl, '/api/farmers', { name: 'Grace By Webhook', village: 'V3' }, token);
    assert.equal(writeDuringGrace.status, 201);
    assert.equal(writeDuringGrace.headers.get('x-subscription-warning'), 'Shop is in grace period');

    const expireEvt = await post(baseUrl, '/api/subscriptions/webhook', { shopId: 'shop-active', type: 'grace_expired' });
    assert.equal(expireEvt.status, 200);

    const blocked = await post(baseUrl, '/api/farmers', { name: 'Blocked Now', village: 'V4' }, token);
    assert.equal(blocked.status, 402);

    const reactivate = await post(baseUrl, '/api/subscriptions/webhook', { shopId: 'shop-active', type: 'payment_success', plan: 'premium' });
    assert.equal(reactivate.status, 200);

    const report = await get(baseUrl, '/api/reports/summary', token);
    assert.equal(report.status, 200);
    assert.ok(Number.isFinite(report.json.data.totalRevenue));
    assert.ok(Number.isFinite(report.json.data.totalDue));
  });
});
    const missingSignature = await post(
      baseUrl,
      '/api/bills',
      {
        farmerId: 'f-active-1',
        items: [{ productId: 'p-active-1', batchId: 'b-active-1', qty: 1 }],
        paidAmount: 0,
        discount: 0
      },
      token
    );
    assert.equal(missingSignature.status, 400);

    const crossTenant = await post(
      baseUrl,
      '/api/bills',
      {
        farmerId: 'f-active-1',
        items: [{ productId: 'p-grace-1', batchId: 'b-grace-1', qty: 1 }],
        paidAmount: 450,
        discount: 0,
        signatureImageUrl: 'sig-data-url'
      },
      token
    );
    assert.equal(crossTenant.status, 400);
  });
});

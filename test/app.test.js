const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');

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

# Agri-POS SaaS

Execution-first backend foundation for a multi-tenant agro retail SaaS.

## What is implemented now

### Security & tenancy core
- Node.js HTTP API server scaffold in `server/`.
- Auth endpoints with access + refresh token flows.
- Refresh token rotation (old refresh token becomes invalid after use).
- Tenant isolation guard for shop-scoped access.
- Subscription guard for write APIs:
  - `expired` shop => blocked writes
  - `grace` shop => writes allowed with warning header

### Domain modules implemented (prototype)
- Farmers
  - `GET /api/farmers`
  - `POST /api/farmers`
- Products
  - `GET /api/products`
  - `POST /api/products`
- Stock
  - `GET /api/stock/batches`
- Billing engine
  - `POST /api/bills`
  - `GET /api/bills`
  - server-side invoice numbering per shop
  - stock deduction per billed item
  - credit bill signature enforcement
  - tenant-safe product/batch/farmer validation
- Ledger engine
  - `GET /api/ledgers/:farmerId/:year`
  - yearly ledger upsert/update on bill creation

### Structure
- `server/config`: environment configuration.
- `server/models`: in-memory seed store for early validation.
- `server/services`: auth service and token operations.
- `server/utils`: HTTP helpers and token helpers.
- `test/`: API behavior tests.

## Run

```bash
npm test
npm start
```

## Demo credentials
- `master@agri.local` / `master123`
- `active@agri.local` / `password123`
- `grace@agri.local` / `password123`
- `expired@agri.local` / `password123`

## Next step
Replace in-memory repositories with MongoDB models while keeping route contracts and tests stable.

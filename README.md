# Agri-POS SaaS

Execution-first backend foundation for a multi-tenant agro retail SaaS.

## Implemented backend modules (runnable)

### Core platform
- JWT-like access/refresh token auth with refresh rotation.
- Tenant isolation guard on shop-scoped endpoints.
- Subscription write guard (`active`, `grace`, `expired`).
- Role enforcement for master-admin routes.

### Shop & subscription management
- `GET /api/admin/shops` (master admin)
- `POST /api/admin/shops` (master admin)
- `PATCH /api/admin/shops/:shopId/status` (master admin)
- `GET /api/subscriptions/me` (tenant)
- `POST /api/subscriptions/webhook` (payment state simulation)

### Business modules
- Farmers: `GET/POST /api/farmers`
- Products: `GET/POST /api/products`
- Stock: `GET /api/stock/batches`
- Billing: `GET/POST /api/bills`
  - server-side invoice numbering per shop
  - stock deduction
  - credit signature validation
  - strict tenant-safe product/batch/farmer checks
- Ledger: `GET /api/ledgers/:farmerId/:year`
- Reports: `GET /api/reports/summary`

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

## Current architecture note
This is still an in-memory prototype to validate contracts and guardrails. Next step is replacing repository operations with MongoDB persistence while keeping tests green.

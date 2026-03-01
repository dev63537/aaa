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
Production-first multi-tenant SaaS blueprint for pesticide, fertilizer, and seed retailers.

## 1) Audit Snapshot

### Business
- ✅ Problem is clear: credit leakage, manual farmer ledgers, paper signatures, delayed collections.
- ✅ Audience is clear: pesticide/seed/fertilizer shops and rural agro retailers.
- ⚠️ Competitive matrix still needed (Marg ERP, Vyapar, local tools).
- ⚠️ UVP needs tighter messaging around year-wise farmer ledger, digital signatures, inactive farmer blocking, cloud tenancy.

### Product
- ✅ Core module map defined: shops, products/stock, farmers, billing, ledgers, reports, subscription suspension.
- ❌ Not yet implemented in code: tenant-isolation enforcement, usage metering, subscription gating, auto invoice numbering, CI/CD, backups, notification automation.

### Infrastructure
- ❌ Hosting/domain/SSL/CI/CD/monitoring/logging not configured.

### Monetization
- ✅ Target pricing band defined: ₹299–₹999 / month.
- ❌ Payment integration, webhook lifecycle, trial/grace handling, usage-based upgrades pending.

### Security
- ❌ Needs implementation: access+refresh JWT, RBAC, rate limiting, per-tenant isolation guardrails, encrypted secrets, automated backups.

### Growth
- ❌ Landing page, SEO, funnel analytics, onboarding automation, retention dashboards pending.

## 2) Build Order (Enforced)
1. Auth system
2. Multi-tenant enforcement
3. Shop management
4. Product & stock
5. Farmer module
6. Billing engine
7. Ledger engine
8. Subscription system
9. Reports
10. Monitoring & backups

## 3) Phase-0 Outcome in This Repo
- Folder scaffolding for `server/` and `client/` aligned to modular SaaS architecture.
- Detailed execution spec in `docs/phase0-foundation.md` with:
  - Data models
  - API surface
  - middleware stack
  - validations
  - security controls
  - test matrix

## 4) Immediate Next Execution Task
Implement **Auth + Tenant Enforcement** first (no feature modules before this), following `docs/phase0-foundation.md`.

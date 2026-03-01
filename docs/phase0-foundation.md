# Phase 0 Foundation Spec — Agri-POS SaaS

## Architecture Principles
1. Multi-tenant safety is mandatory: every domain record has `shopId`, every query enforces `shopId`.
2. Revenue enforcement is mandatory: protected routes pass through subscription checks.
3. Security-by-default: short-lived access JWT, refresh rotation, RBAC, validation at ingress.
4. Auditability: critical domain actions logged with actor, shop, event, and timestamp.

---

## A) Core Data Structures (MongoDB)

### `shops`
- `_id`
- `name`
- `ownerName`
- `phone`
- `address`
- `status` (`active` | `grace` | `suspended`)
- `planId`
- `subscriptionExpiresAt`
- `createdAt`
- `updatedAt`

Indexes:
- `{ status: 1 }`
- `{ subscriptionExpiresAt: 1 }`

### `users`
- `_id`
- `shopId` (nullable only for master admin)
- `name`
- `email` (unique)
- `passwordHash`
- `role` (`master_admin` | `shop_admin` | `staff`)
- `refreshTokenVersion`
- `lastLoginAt`
- `createdAt`

Indexes:
- `{ email: 1 } unique`
- `{ shopId: 1, role: 1 }`

### `farmers`
- `_id`
- `shopId`
- `name`
- `phone`
- `village`
- `isActive`
- `createdAt`
- `updatedAt`

Indexes:
- `{ shopId: 1, phone: 1 }`
- `{ shopId: 1, isActive: 1 }`

### `products`
- `_id`
- `shopId`
- `name`
- `category` (`pesticide` | `fertilizer` | `seed`)
- `unit`
- `mrp`
- `purchasePrice`
- `isActive`
- `createdAt`

Indexes:
- `{ shopId: 1, name: 1 }`
- `{ shopId: 1, category: 1 }`

### `stock_batches`
- `_id`
- `shopId`
- `productId`
- `batchNo`
- `quantity`
- `remainingQty`
- `expiryDate`
- `createdAt`

Indexes:
- `{ shopId: 1, productId: 1 }`
- `{ shopId: 1, expiryDate: 1 }`

### `bills`
- `_id`
- `shopId`
- `invoiceNumber` (unique per `shopId`)
- `farmerId`
- `items[]` (`productId`, `batchId`, `qty`, `rate`, `amount`)
- `subtotal`
- `discount`
- `grandTotal`
- `paidAmount`
- `dueAmount`
- `signatureImageUrl`
- `billDate`
- `createdBy`
- `createdAt`

Indexes:
- `{ shopId: 1, invoiceNumber: 1 } unique`
- `{ shopId: 1, farmerId: 1, billDate: -1 }`

### `yearly_ledgers`
- `_id`
- `shopId`
- `farmerId`
- `year`
- `openingBalance`
- `totalBilled`
- `totalPaid`
- `closingBalance`
- `lastEntryAt`

Indexes:
- `{ shopId: 1, farmerId: 1, year: 1 } unique`

### `subscriptions`
- `_id`
- `shopId`
- `plan` (`free` | `basic` | `premium`)
- `status` (`active` | `grace` | `expired`)
- `maxFarmers`
- `maxBillsPerMonth`
- `featureFlags` (object)
- `paymentProvider`
- `providerSubscriptionId`
- `currentPeriodStart`
- `currentPeriodEnd`
- `graceEndsAt`
- `updatedAt`

Indexes:
- `{ shopId: 1 } unique`
- `{ status: 1, graceEndsAt: 1 }`

### `audit_logs`
- `_id`
- `shopId`
- `actorUserId`
- `eventType`
- `entityType`
- `entityId`
- `payload` (sanitized JSON)
- `ip`
- `userAgent`
- `createdAt`

Indexes:
- `{ shopId: 1, createdAt: -1 }`
- `{ eventType: 1, createdAt: -1 }`

---

## B) API Surface (MVP-first)

### Auth
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

### Shop Management (master admin)
- `POST /api/admin/shops`
- `GET /api/admin/shops`
- `PATCH /api/admin/shops/:shopId/status`

### Farmers
- `POST /api/farmers`
- `GET /api/farmers`
- `PATCH /api/farmers/:farmerId`

### Products & Stock
- `POST /api/products`
- `GET /api/products`
- `POST /api/stock/batches`
- `GET /api/stock/batches`

### Billing
- `POST /api/bills`
- `GET /api/bills`
- `GET /api/bills/:billId`

### Ledger
- `GET /api/ledgers/:farmerId/:year`
- `POST /api/ledgers/:farmerId/payment`

### Subscription
- `POST /api/subscriptions/webhook`
- `GET /api/subscriptions/me`

---

## C) Mandatory Middleware Chain

1. `helmetMiddleware`
2. `requestIdMiddleware`
3. `rateLimiterMiddleware`
4. `authMiddleware` (except public endpoints)
5. `tenantContextMiddleware` (resolve shop and assert access)
6. `rbacMiddleware`
7. `subscriptionGuardMiddleware`
8. `validationMiddleware`
9. controller
10. `errorHandlerMiddleware`

Notes:
- Master admin endpoints bypass tenant scope but still audited.
- Tenant-scoped endpoints MUST reject if `req.user.shopId` is missing.

---

## D) Validation Rules (Examples)

### Bill Creation
- Farmer must be active.
- Product and batch must belong to same `shopId` as requester.
- `qty` must be `> 0` and `<= remainingQty`.
- `invoiceNumber` allocated by server only.
- Signature required for credit bill (`dueAmount > 0`).

### Farmer Update
- Cannot deactivate farmer with unpaid due unless override role (`shop_admin`) and reason logged.

### Subscription Guard
- `expired` => block all write APIs.
- `grace` => allow writes with warning header `X-Subscription-Warning`.
- Feature flags enforce route-level capability checks.

---

## E) Security Controls
- Access JWT lifetime: 15 minutes.
- Refresh token rotation on every refresh.
- Password hashing: Argon2 or bcrypt (cost >= 12).
- Secret handling: environment variables only.
- Input schema: Zod/Joi for all request payloads.
- DB query hardening: never accept raw filter objects from client.

---

## F) CI/CD + Ops Baseline

### Pipeline stages
1. Lint
2. Unit tests
3. API tests
4. Build
5. Deploy staging
6. Smoke tests
7. Deploy production

### Runtime operations
- Daily automated MongoDB backup.
- Centralized logs (JSON, structured with requestId/shopId).
- Error monitoring via Sentry.
- Uptime checks on API and payment webhook endpoint.

---

## G) Test Matrix Before Advancing Modules

### Auth & Tenant Isolation
- Login success/failure
- Access token expiry
- Refresh rotation invalidates old refresh token
- Cross-tenant access attempt returns 403

### Billing
- Stock deduction is atomic with bill creation
- Duplicate invoiceNumber per shop rejected
- Inactive farmer cannot be billed

### Subscription Enforcement
- Expired shop cannot create bill
- Grace-period shop can create bill with warning
- Feature-gated endpoint returns 402/403 equivalent policy response

### Resilience
- Simulated concurrent bill writes keep stock consistent
- Retry-safe webhook processing (idempotent by provider event id)


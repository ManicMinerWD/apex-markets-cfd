# Apex Markets — CFD Trading Platform (Scaffold)

A production-ready **scaffold** for a CFD broker front-end, built Pepperstone-style.
Runs entirely in sandbox mode (synthetic prices, virtual funds, Sumsub sandbox KYC)
with real integration points for: a licensed liquidity provider (MT5/cTrader
white-label), Sumsub KYC/AML, and a compliance layer (jurisdiction blocks,
leverage tiering, audit logging).

> ⚠️ **REGULATORY NOTICE.** This code is a software scaffold. Operating a CFD
> broker requires a valid license in every jurisdiction you serve (e.g. ASIC,
> FCA, CySEC), a liquidity-provider / prime-broker agreement, client-fund
> segregation, capital adequacy, and a compliance function. None of those are
> provided by this repo. Wire them in before going live.

## Stack
- `server/` — Node + TypeScript (Express). Auth, KYC, market-data adapter,
  trading engine, compliance.
- `web/` — React + Vite (Pepperstone-style UI). Markets, order ticket, positions,
  KYC flow.

## Run (sandbox)
```bash
npm install
cp .env.example .env          # defaults run in sandbox
npm run dev                   # API :4000, UI :5173
```
Open http://localhost:5173 → register (country AU) → start KYC (sandbox) →
trade with virtual funds.

## Go live (operator responsibilities)
1. Obtain broker license + liquidity provider (MT5 Manager API or cTrader
   Open API white-label). Set `LIQUIDITY_MODE=mt5|ctrader` and creds.
2. Sumsub: set `SUMSUB_SANDBOX=false`, real `APP_TOKEN`/`SECRET_KEY`,
   `WEBHOOK_SECRET`. Configure `basic-kyc-level` in Sumsub dashboard; point
   webhook at `POST /api/kyc/webhook`.
3. AML: set `AML_ENABLED=true` + `AML_API_KEY` (e.g. ComplyAdvantage) in
   `server/src/compliance.ts` `screenAml()`.
4. Replace in-memory `store` with Postgres; reconcile client balances (segregated)
   vs LP daily. Ship `audit` logger to a WORM store.
5. Set real `BLOCKED_COUNTRIES` and `LEVERAGE_TIERS` per your license.

## API
- `GET  /api/markets` — instruments + live quotes
- `POST /api/register` — onboarding (blocked-country + AML gate)
- `POST /api/login`
- `POST /api/kyc/start` — Sumsub applicant + SDK token
- `POST /api/kyc/webhook` — Sumsub review webhook (HMAC-verified in prod)
- `GET  /api/me`, `GET /api/positions`
- `POST /api/trade/open`, `POST /api/trade/close`

## Structure
```
server/src
  config.ts      env + compliance config
  logger.ts      audit logger
  types.ts       domain types
  store.ts       in-memory store + instrument master
  market.ts      price engine (sandbox + LP adapter interface)
  compliance.ts  jurisdiction blocks, leverage tiers, AML hook
  kyc.ts         Sumsub SDK + webhook verify
  auth.ts        JWT + password hashing
  engine.ts      margin/PnL, open/close
  app.ts         Express routes
```

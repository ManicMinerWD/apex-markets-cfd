import dotenv from "dotenv";
dotenv.config();

function bool(v: string | undefined, d = false): boolean {
  return v ? v === "true" || v === "1" : d;
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "DEV_ONLY_CHANGE_ME",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "12h",
  // --- Liquidity provider (MT5 / cTrader white-label) ---
  // In sandbox mode the server generates synthetic prices; in live mode it
  // calls the configured white-label gateway. Credentials are NEVER logged.
  liquidityMode: (process.env.LIQUIDITY_MODE ?? "sandbox") as "sandbox" | "mt5" | "ctrader",
  mt5: {
    endpoint: process.env.MT5_ENDPOINT ?? "",
    managerLogin: process.env.MT5_MANAGER_LOGIN ?? "",
    managerPassword: process.env.MT5_MANAGER_PASSWORD ?? "",
    server: process.env.MT5_SERVER ?? ""
  },
  ctrader: {
    endpoint: process.env.CTRADER_ENDPOINT ?? "",
    clientId: process.env.CTRADER_CLIENT_ID ?? "",
    clientSecret: process.env.CTRADER_CLIENT_SECRET ?? ""
  },
  // --- Sumsub KYC/AML ---
  sumsub: {
    baseUrl: process.env.SUMSUB_BASE_URL ?? "https://api.sumsub.com",
    appToken: process.env.SUMSUB_APP_TOKEN ?? "",
    secretKey: process.env.SUMSUB_SECRET_KEY ?? "",
    // Sandbox: use Sumsub's test environment and accept webhooks without sig verify
    sandbox: bool(process.env.SUMSUB_SANDBOX, true),
    webhookSecret: process.env.SUMSUB_WEBHOOK_SECRET ?? ""
  },
  // --- Compliance ---
  // ISO country codes explicitly BLOCKED from onboarding (regulatory).
  blockedCountries: (process.env.BLOCKED_COUNTRIES ?? "US,CA,IR,KP,SY").split(","),
  // Per-jurisdiction max leverage (regulatory tiering).
  leverageTiers: JSON.parse(
    process.env.LEVERAGE_TIERS ?? '{"DEFAULT":30,"EU":30,"UK":30,"AU":30,"ROW":500}'
  ),
  // AML screening provider toggle (e.g. ComplyAdvantage / sanctions list)
  amlEnabled: bool(process.env.AML_ENABLED, false),
  amlApiKey: process.env.AML_API_KEY ?? "",
  // Virtual starting balance for sandbox accounts (demo funds, NO real money)
  sandboxBalanceUsd: Number(process.env.SANDBOX_BALANCE ?? 100000)
};

export type AppConfig = typeof config;

import type { Quote } from "./types.js";
import { INSTRUMENTS } from "./store.js";
import { config } from "./config.js";
import { log } from "./logger.js";

// ---------------------------------------------------------------------------
// Price engine. Sandbox = deterministic-ish synthetic random walk so the UI is
// fully functional with zero external dependencies. Live = adapter to the
// white-label gateway (MT5 Manager API / cTrader Open API). Swap by env.
// ---------------------------------------------------------------------------

const anchors: Record<string, number> = {
  EURUSD: 1.0850, GBPUSD: 1.2700, USDJPY: 149.50, AUDUSD: 0.6650,
  US500: 5430.0, USTECH: 19200.0, UK100: 8200.0,
  XAUUSD: 2340.0, XAGUSD: 27.5, BRENT: 82.0,
  BTCUSD: 64000.0, ETHUSD: 3400.0
};

const last: Record<string, number> = { ...anchors };

function tick(symbol: string): Quote {
  const base = anchors[symbol] ?? 1;
  const vol = symbol === "BTCUSD" || symbol === "ETHUSD" ? 0.0025 : symbol.startsWith("US") || symbol === "UK" ? 0.0008 : 0.0004;
  const drift = (Math.random() - 0.5) * 2 * vol;
  last[symbol] = Math.max(base * 0.5, last[symbol] * (1 + drift));
  const spreadBp = symbol === "BTCUSD" || symbol === "ETHUSD" ? 0.0008 : 0.0002;
  const mid = last[symbol];
  const bid = mid * (1 - spreadBp / 2);
  const ask = mid * (1 + spreadBp / 2);
  return { symbol, bid: round(bid, symbol), ask: round(ask, symbol), ts: Date.now() };
}

function round(v: number, symbol: string) {
  const inst = INSTRUMENTS.find((i) => i.symbol === symbol);
  const d = inst?.digits ?? 2;
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
}

// Live adapter interface — implement against your white-label provider.
// MT5: use the Manager API (or a gateway like PrimeXM/Fortex) to subscribe to
//   symbol quotes and map to Quote. cTrader: Open API ProtoOAPushUpdate / Tick.
async function fetchLive(symbol: string): Promise<Quote | null> {
  if (config.liquidityMode === "mt5") {
    // TODO(prod): call MT5 gateway GET /quotes/:symbol with config.mt5 creds
    log.warn("MT5 live quotes not yet implemented — returning null", { symbol });
    return null;
  }
  if (config.liquidityMode === "ctrader") {
    // TODO(prod): cTrader Open API Tick subscription
    log.warn("cTrader live quotes not yet implemented — returning null", { symbol });
    return null;
  }
  return null;
}

export async function getQuote(symbol: string): Promise<Quote> {
  if (config.liquidityMode !== "sandbox") {
    const live = await fetchLive(symbol);
    if (live) return live;
  }
  return tick(symbol);
}

export async function getAllQuotes(): Promise<Quote[]> {
  return Promise.all(INSTRUMENTS.map((i) => getQuote(i.symbol)));
}

// Execution stub — in live mode route to the LP; sandbox simulates fill at quote.
export async function executeMarketFill(symbol: string): Promise<{ price: number; ok: boolean }> {
  const q = await getQuote(symbol);
  // Sandbox always fills; live mode would confirm via LP before resolving.
  return { price: q.ask, ok: true };
}

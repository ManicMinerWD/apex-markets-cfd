import type { Instrument, Position, User } from "./types.js";

// ---------------------------------------------------------------------------
// IN-MEMORY STORE
// Production: replace with Postgres (users/ledger) + a real position manager.
// Client balances MUST be segregated (not co-mingled) and reconciled vs the
// liquidity provider in production. This scaffold keeps state in memory only.
// ---------------------------------------------------------------------------

const users = new Map<string, User>();
const positions = new Map<string, Position>();
let idCounter = 1;
export const nextId = (p: string) => `${p}_${(idCounter++).toString(36)}_${Date.now().toString(36)}`;

export const store = {
  users,
  positions,
  getUser: (id: string) => users.get(id),
  getUserByEmail: (email: string) => [...users.values()].find((u) => u.email === email),
  saveUser: (u: User) => users.set(u.id, u),
  savePosition: (p: Position) => positions.set(p.id, p),
  positionsFor: (userId: string) => [...positions.values()].filter((p) => p.userId === userId),
  removePosition: (id: string) => positions.delete(id)
};

// ---------------------------------------------------------------------------
// Instrument master (CFD product catalog — Pepperstone-style)
// Contract sizes approximate retail CFD conventions.
// ---------------------------------------------------------------------------
export const INSTRUMENTS: Instrument[] = [
  { symbol: "EURUSD", name: "Euro / US Dollar", category: "forex", contractSize: 100000, minLots: 0.01, maxLots: 50, digits: 5 },
  { symbol: "GBPUSD", name: "Pound / US Dollar", category: "forex", contractSize: 100000, minLots: 0.01, maxLots: 50, digits: 5 },
  { symbol: "USDJPY", name: "US Dollar / Yen", category: "forex", contractSize: 100000, minLots: 0.01, maxLots: 50, digits: 3 },
  { symbol: "AUDUSD", name: "Aussie / US Dollar", category: "forex", contractSize: 100000, minLots: 0.01, maxLots: 50, digits: 5 },
  { symbol: "US500", name: "US Wall St 500", category: "index", contractSize: 1, minLots: 0.1, maxLots: 20, digits: 1 },
  { symbol: "USTECH", name: "US Tech 100", category: "index", contractSize: 1, minLots: 0.1, maxLots: 20, digits: 1 },
  { symbol: "UK100", name: "UK 100", category: "index", contractSize: 1, minLots: 0.1, maxLots: 20, digits: 1 },
  { symbol: "XAUUSD", name: "Gold / US Dollar", category: "commodity", contractSize: 100, minLots: 0.01, maxLots: 20, digits: 2 },
  { symbol: "XAGUSD", name: "Silver / US Dollar", category: "commodity", contractSize: 1000, minLots: 0.01, maxLots: 20, digits: 2 },
  { symbol: "BRENT", name: "Brent Crude Oil", category: "commodity", contractSize: 100, minLots: 0.01, maxLots: 20, digits: 2 },
  { symbol: "BTCUSD", name: "Bitcoin / US Dollar", category: "crypto", contractSize: 1, minLots: 0.01, maxLots: 5, digits: 2 },
  { symbol: "ETHUSD", name: "Ethereum / US Dollar", category: "crypto", contractSize: 1, minLots: 0.01, maxLots: 5, digits: 2 }
];

export const instrument = (symbol: string) => INSTRUMENTS.find((i) => i.symbol === symbol);

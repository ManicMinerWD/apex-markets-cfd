export interface Instrument { symbol: string; name: string; category: string; contractSize: number; minLots: number; maxLots: number; digits: number; }
export interface Quote { symbol: string; bid: number; ask: number; ts: number; }
export interface Position { id: string; symbol: string; direction: string; sizeLots: number; openPrice: number; openTime: number; leverage: number; marginUsd: number; unrealizedUsd?: number; }
export interface Me { id: string; email: string; country: string; jurisdiction: string; kycStatus: string; amlCleared: boolean; balanceUsd: number; maxLeverage: number; isBlocked: boolean; }

const api = (path: string, opts: RequestInit = {}) => {
  const token = localStorage.getItem("token");
  return fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) }
  }).then(async (r) => {
    if (!r.ok) throw new Error((await r.json()).error ?? r.statusText);
    return r.json();
  });
};

export const client = {
  health: () => api("/api/health"),
  markets: () => api("/api/markets"),
  register: (b: any) => api("/api/register", { method: "POST", body: JSON.stringify(b) }),
  login: (b: any) => api("/api/login", { method: "POST", body: JSON.stringify(b) }),
  me: () => api("/api/me"),
  kycStart: () => api("/api/kyc/start", { method: "POST" }),
  positions: () => api("/api/positions"),
  open: (b: any) => api("/api/trade/open", { method: "POST", body: JSON.stringify(b) }),
  close: (id: string) => api("/api/trade/close", { method: "POST", body: JSON.stringify({ positionId: id }) })
};

import React, { useEffect, useState, useCallback } from "react";
import { client, Instrument, Quote, Position, Me } from "./api";

type View = "login" | "markets" | "trade" | "kyc";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [me, setMe] = useState<Me | null>(null);
  const [view, setView] = useState<View>("markets");
  const [toast, setToast] = useState<string>("");

  const refreshMe = useCallback(async () => {
    try { setMe(await client.me()); } catch { logout(); }
  }, []);

  useEffect(() => { if (token) refreshMe(); }, [token, refreshMe]);

  const logout = () => { localStorage.removeItem("token"); setToken(null); setMe(null); };

  if (!token) return <Auth onAuth={(t) => { localStorage.setItem("token", t); setToken(t); }} />;

  return (
    <div className="app">
      <div className="demobar">⚠ DEMO ENVIRONMENT — synthetic prices, virtual funds. Not a licensed broker. No real trading.</div>
      <header className="topbar">
        <div className="brand">APEX<span>MARKETS</span></div>
        <nav>
          <button className={view === "markets" ? "active" : ""} onClick={() => setView("markets")}>Markets</button>
          <button className={view === "trade" ? "active" : ""} onClick={() => setView("trade")}>Trade</button>
          <button className={view === "kyc" ? "active" : ""} onClick={() => setView("kyc")}>Verification</button>
        </nav>
        <div className="acct">
          {me && <span className={`pill kyc-${me.kycStatus}`}>{me.kycStatus}</span>}
          {me && <span className="bal">${me.balanceUsd.toLocaleString()}</span>}
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      {toast && <div className="toast">{toast}</div>}

      {view === "markets" && <Markets onToast={setToast} />}
      {view === "trade" && <Trade me={me} refreshMe={refreshMe} onToast={setToast} />}
      {view === "kyc" && <Kyc me={me} refreshMe={refreshMe} onToast={setToast} />}
    </div>
  );
}

function Auth({ onAuth }: { onAuth: (t: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("AU");
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    try {
      const r = mode === "register"
        ? await client.register({ email, password, country })
        : await client.login({ email, password });
      onAuth(r.token);
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="auth-wrap">
      <div className="brand big">APEX<span>MARKETS</span></div>
      <p className="tag">Trade CFDs on FX, indices, commodities & crypto. Demo environment — virtual funds.</p>
      <div className="card auth">
        <div className="seg">
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Create account</button>
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Log in</button>
        </div>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="Password (min 8)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {mode === "register" && (
          <input placeholder="Country (ISO-2, e.g. AU)" maxLength={2} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} />
        )}
        {err && <div className="err">{err}</div>}
        <button className="primary" onClick={submit}>{mode === "register" ? "Open account" : "Log in"}</button>
        <p className="fine">By proceeding you agree to our Client Agreement & Risk Disclosure. CFDs carry high risk.</p>
      </div>
    </div>
  );
}

function Markets({ onToast }: { onToast: (s: string) => void }) {
  const [data, setData] = useState<{ instruments: Instrument[]; quotes: Quote[] } | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => { try { const d = await client.markets(); if (active) setData(d); } catch (e: any) { onToast(e.message); } };
    load();
    const i = setInterval(load, 2000);
    return () => { active = false; clearInterval(i); };
  }, [onToast]);

  if (!data) return <div className="loading">Loading markets…</div>;
  const qmap = Object.fromEntries(data.quotes.map((q) => [q.symbol, q]));
  const cats = ["forex", "index", "commodity", "crypto"];
  const labels: any = { forex: "Forex", index: "Indices", commodity: "Commodities", crypto: "Crypto" };
  return (
    <div className="markets">
      {cats.map((c) => (
        <section key={c}>
          <h3>{labels[c]}</h3>
          <div className="grid">
            {data.instruments.filter((i) => i.category === c).map((i) => {
              const q = qmap[i.symbol];
              return (
                <div key={i.symbol} className="tile">
                  <div className="sym">{i.symbol}</div>
                  <div className="nm">{i.name}</div>
                  <div className="px">
                    <span className="bid">{q?.bid.toFixed(i.digits)}</span>
                    <span className="ask">{q?.ask.toFixed(i.digits)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Trade({ me, refreshMe, onToast }: { me: Me | null; refreshMe: () => void; onToast: (s: string) => void }) {
  const [symbol, setSymbol] = useState("EURUSD");
  const [dir, setDir] = useState<"buy" | "sell">("buy");
  const [lots, setLots] = useState(0.1);
  const [lev, setLev] = useState(me?.maxLeverage ?? 30);
  const [poss, setPoss] = useState<Position[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);

  const loadPositions = async () => { try { setPoss(await client.positions()); } catch (e: any) { onToast(e.message); } };
  useEffect(() => { loadPositions(); }, []);
  useEffect(() => {
    let active = true;
    const tick = async () => { try { const d = await client.markets(); const m = d.quotes.find((q: Quote) => q.symbol === symbol); if (active && m) setQuote(m); } catch {} };
    tick(); const i = setInterval(tick, 1500); return () => { active = false; clearInterval(i); };
  }, [symbol]);

  const open = async () => {
    try {
      if (!me || me.kycStatus !== "verified") { onToast("Complete verification before trading"); return; }
      await client.open({ symbol, direction: dir, sizeLots: lots, leverage: lev });
      onToast("Position opened");
      await loadPositions(); await refreshMe();
    } catch (e: any) { onToast(e.message); }
  };
  const close = async (id: string) => { try { await client.close(id); onToast("Closed"); await loadPositions(); await refreshMe(); } catch (e: any) { onToast(e.message); } };

  return (
    <div className="trade">
      <div className="card ticket">
        <h3>Order ticket</h3>
        <label>Symbol <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} /></label>
        <div className="seg">
          <button className={dir === "buy" ? "active buy" : ""} onClick={() => setDir("buy")}>Buy</button>
          <button className={dir === "sell" ? "active sell" : ""} onClick={() => setDir("sell")}>Sell</button>
        </div>
        <label>Lots <input type="number" step="0.01" value={lots} onChange={(e) => setLots(Number(e.target.value))} /></label>
        <label>Leverage (max {me?.maxLeverage}) <input type="number" value={lev} onChange={(e) => setLev(Number(e.target.value))} /></label>
        <div className="quote">Bid {quote?.bid} / Ask {quote?.ask}</div>
        <button className="primary" onClick={open}>Place {dir.toUpperCase()} order</button>
        {me && me.kycStatus !== "verified" && <div className="warn">Trading locked until KYC verified.</div>}
      </div>
      <div className="card positions">
        <h3>Open positions</h3>
        {poss.length === 0 && <div className="empty">No open positions</div>}
        {poss.map((p) => (
          <div key={p.id} className="pos">
            <div><b>{p.symbol}</b> {p.direction.toUpperCase()} {p.sizeLots} @ {p.openPrice}</div>
            <div className={p.unrealizedUsd && p.unrealizedUsd >= 0 ? "up" : "down"}>
              {(p.unrealizedUsd ?? 0).toFixed(2)} USD
            </div>
            <button onClick={() => close(p.id)}>Close</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kyc({ me, refreshMe, onToast }: { me: Me | null; refreshMe: () => void; onToast: (s: string) => void }) {
  const start = async () => {
    try { await client.kycStart(); onToast("KYC started — in production Sumsub widget launches here"); await refreshMe(); }
    catch (e: any) { onToast(e.message); }
  };
  const force = async () => {
    try { await client.forceVerify(); onToast("Demo: KYC forced to verified — trading unlocked"); await refreshMe(); }
    catch (e: any) { onToast(e.message); }
  };
  return (
    <div className="card kyc">
      <h3>Identity verification (KYC / AML)</h3>
      <p>Status: <b>{me?.kycStatus}</b></p>
      <p>Jurisdiction: {me?.jurisdiction} · Max leverage {me?.maxLeverage}×</p>
      <p className="fine">Live mode integrates Sumsub's SDK (sandbox returns a test token). On approval the webhook flips status to <b>verified</b> and trading unlocks.</p>
      {me?.kycStatus !== "verified" ? (
        <>
          <button className="primary" onClick={start}>{me?.kycStatus === "pending" ? "Re-start verification" : "Start verification"}</button>
          <button className="ghost" onClick={force}>Demo: skip verification</button>
        </>
      ) : <div className="ok">Verified — you may trade.</div>}
    </div>
  );
}

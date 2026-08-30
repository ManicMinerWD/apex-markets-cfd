import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { config } from "./config.js";
import { store, INSTRUMENTS, nextId, instrument } from "./store.js";
import { hashPassword, checkPassword, signToken, verifyToken } from "./auth.js";
import { assertOnboardable, jurisdictionFor, maxLeverageFor, isBlockedCountry, screenAml, HttpError } from "./compliance.js";
import { createApplicant, verifyWebhook, reviewToStatus } from "./kyc.js";
import { getQuote, getAllQuotes } from "./market.js";
import { openPosition, closePosition, unrealizedPnl } from "./engine.js";
import { audit } from "./logger.js";
import type { User } from "./types.js";

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  const auth = (req: any, res: any, next: any) => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
    try {
      const claims = verifyToken(h.slice(7));
      const user = store.getUser(claims.sub);
      if (!user) return res.status(401).json({ error: "Unknown user" });
      req.user = user;
      next();
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  // ---- Health ----
  app.get("/api/health", (_req, res) => res.json({ ok: true, mode: config.liquidityMode, sumsubSandbox: config.sumsub.sandbox }));

  // ---- Markets ----
  app.get("/api/markets", async (_req, res) => {
    try {
      const quotes = await getAllQuotes();
      res.json({ instruments: INSTRUMENTS, quotes });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });
  app.get("/api/markets/:symbol", async (req, res) => {
    const q = await getQuote(req.params.symbol);
    res.json(q);
  });

  // ---- Auth + onboarding ----
  const reg = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    country: z.string().length(2)
  });
  app.post("/api/register", async (req, res) => {
    try {
      const { email, password, country } = reg.parse(req.body);
      if (isBlockedCountry(country)) throw new HttpError(403, `Country ${country} not serviced`);
      assertOnboardable(country);
      if (store.getUserByEmail(email)) throw new HttpError(409, "Email already registered");
      const aml = await screenAml({ email, country });
      if (!aml.cleared) throw new HttpError(403, aml.reason ?? "AML screening failed");
      const user: User = {
        id: nextId("usr"),
        email,
        passwordHash: hashPassword(password),
        country: country.toUpperCase(),
        jurisdiction: jurisdictionFor(country.toUpperCase()),
        kycStatus: "none",
        amlCleared: true,
        balanceUsd: config.sandboxBalanceUsd,
        createdAt: Date.now(),
        isBlocked: false
      };
      store.saveUser(user);
      audit.info("REGISTER", { userId: user.id, country: user.country, jurisdiction: user.jurisdiction });
      res.json({ token: signToken(user), user: publicUser(user) });
    } catch (e) { apiErr(res, e); }
  });

  app.post("/api/login", async (req, res) => {
    try {
      const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
      const user = store.getUserByEmail(email);
      if (!user || !checkPassword(password, user.passwordHash)) throw new HttpError(401, "Invalid credentials");
      audit.info("LOGIN", { userId: user.id });
      res.json({ token: signToken(user), user: publicUser(user) });
    } catch (e) { apiErr(res, e); }
  });

  // ---- KYC ----
  app.post("/api/kyc/start", auth, async (req: any, res) => {
    try {
      const { applicantId, sdkToken } = await createApplicant(req.user.id, req.user.email, req.user.country);
      req.user.sumsubApplicantId = applicantId;
      req.user.kycStatus = "pending";
      store.saveUser(req.user);
      audit.info("KYC_START", { userId: req.user.id, applicantId });
      res.json({ sdkToken, applicantId });
    } catch (e) { apiErr(res, e); }
  });

  app.post("/api/kyc/webhook", express.raw({ type: "*/*" }), (req, res) => {
    const sig = req.headers["x-payload-signature"] as string | undefined;
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body);
    if (!verifyWebhook(raw, sig)) {
      audit.warn("KYC_WEBHOOK bad signature", {});
      return res.status(400).json({ error: "bad signature" });
    }
    try {
      const payload = JSON.parse(raw);
      const applicantId = payload.applicantId ?? payload.applicant?.id;
      const user = [...store.users.values()].find((u) => u.sumsubApplicantId === applicantId);
      if (user) {
        user.kycStatus = reviewToStatus(payload);
        store.saveUser(user);
        audit.info("KYC_REVIEW", { userId: user.id, status: user.kycStatus });
      }
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: "bad payload" }); }
  });

  // ---- Account ----
  app.get("/api/me", auth, (req: any, res) => res.json(publicUser(req.user)));
  app.get("/api/positions", auth, async (req: any, res) => {
    const poss = store.positionsFor(req.user.id);
    const withPnl = await Promise.all(poss.map(async (p) => ({ ...p, unrealizedUsd: await unrealizedPnl(p) })));
    res.json(withPnl);
  });

  // ---- Trading ----
  const ord = z.object({
    symbol: z.string(),
    direction: z.enum(["buy", "sell"]),
    sizeLots: z.number().positive(),
    leverage: z.number().positive().optional()
  });
  app.post("/api/trade/open", auth, async (req: any, res) => {
    try {
      const b = ord.parse(req.body);
      if (!instrument(b.symbol)) throw new HttpError(400, "Unknown instrument");
      const pos = await openPosition(req.user, b.symbol, b.direction, b.sizeLots, b.leverage);
      res.json(pos);
    } catch (e) { apiErr(res, e); }
  });
  app.post("/api/trade/close", auth, async (req: any, res) => {
    try {
      const { positionId } = z.object({ positionId: z.string() }).parse(req.body);
      const r = await closePosition(req.user, positionId);
      res.json(r);
    } catch (e) { apiErr(res, e); }
  });

  // ---- Instrument catalog (for UI) ----
  app.get("/api/instruments", (_req, res) => res.json(INSTRUMENTS));

  // ---- DEMO banner (must be registered BEFORE the static catch-all) ----
  app.get("/api/demo-banner", (_req, res) =>
    res.json({ mode: config.liquidityMode, notice: "DEMO ENVIRONMENT — synthetic prices, virtual funds, no real trading." })
  );

  // ---- DEV-ONLY: force KYC verified for sandbox demos (off unless explicitly enabled) ----
  const forceVerifyEnabled = config.sumsub.sandbox || process.env.DEMO_FORCE_VERIFY === "true";
  if (forceVerifyEnabled) {
    app.post("/api/dev/force-verify", auth, async (req: any, res) => {
      req.user.kycStatus = "verified";
      store.saveUser(req.user);
      audit.info("DEV_FORCE_VERIFY", { userId: req.user.id });
      res.json(publicUser(req.user));
    });
  }

  // ---- Serve built UI (production) + SPA catch-all (non-/api only) ----
  const webDist = path.resolve(process.cwd(), "../web/dist");
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
  }

  return app;
}

function publicUser(u: User) {
  return {
    id: u.id, email: u.email, country: u.country, jurisdiction: u.jurisdiction,
    kycStatus: u.kycStatus, amlCleared: u.amlCleared,
    balanceUsd: Math.round(u.balanceUsd * 100) / 100,
    maxLeverage: maxLeverageFor(u.country), isBlocked: u.isBlocked
  };
}

function apiErr(res: any, e: any) {
  if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
  res.status(500).json({ error: String(e?.message ?? e) });
}

export function startServer() {
  const app = createApp();
  app.listen(config.port, () => {
    audit.info("SERVER_START", { port: config.port, mode: config.liquidityMode });
    console.log(`CFD platform API on :${config.port} (liquidity=${config.liquidityMode}, sumsubSandbox=${config.sumsub.sandbox})`);
  });
}

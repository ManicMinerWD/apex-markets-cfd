import { store, instrument } from "./store.js";
import { getQuote, executeMarketFill } from "./market.js";
import { maxLeverageFor, HttpError } from "./compliance.js";
import { nextId } from "./store.js";
import { audit } from "./logger.js";
import type { Direction, Position, User } from "./types.js";

// ---------------------------------------------------------------------------
// Trading engine. Margin + PnL computed from contract size and live quotes.
// Sandbox: virtual balance, simulated fills. Live: margin released/charged at
//   the LP and reconciled to the segregated client ledger.
// ---------------------------------------------------------------------------

export function marginRequiredUsd(symbol: string, sizeLots: number, openPrice: number, leverage: number): number {
  const inst = instrument(symbol);
  if (!inst) throw new HttpError(400, "Unknown instrument");
  const notional = sizeLots * inst.contractSize * openPrice;
  return notional / leverage;
}

export async function openPosition(user: User, symbol: string, direction: Direction, sizeLots: number, requestedLeverage?: number): Promise<Position> {
  if (user.kycStatus !== "verified") throw new HttpError(403, "KYC verification required to trade");
  if (user.isBlocked) throw new HttpError(403, "Account blocked by compliance");
  const inst = instrument(symbol);
  if (!inst) throw new HttpError(400, "Unknown instrument");
  if (sizeLots < inst.minLots || sizeLots > inst.maxLots) throw new HttpError(400, "Lot size out of range");

  const cap = maxLeverageFor(user.country);
  const leverage = Math.min(requestedLeverage ?? cap, cap);

  const fill = await executeMarketFill(symbol);
  if (!fill.ok) throw new HttpError(502, "Execution rejected by liquidity provider");
  // Use open price for buy = ask, sell = bid
  const q = await getQuote(symbol);
  const openPrice = direction === "buy" ? q.ask : q.bid;
  const margin = marginRequiredUsd(symbol, sizeLots, openPrice, leverage);

  if (margin > user.balanceUsd) throw new HttpError(400, "Insufficient margin");
  user.balanceUsd -= margin; // margin held (segregated in prod)
  store.saveUser(user);

  const pos: Position = {
    id: nextId("pos"),
    userId: user.id,
    symbol,
    direction,
    sizeLots,
    openPrice,
    openTime: Date.now(),
    leverage,
    marginUsd: margin
  };
  store.savePosition(pos);
  audit.info("POSITION_OPEN", { userId: user.id, symbol, direction, sizeLots, leverage, margin });
  return pos;
}

export async function closePosition(user: User, positionId: string): Promise<{ realizedUsd: number }> {
  const pos = store.positions.get(positionId);
  if (!pos || pos.userId !== user.id) throw new HttpError(404, "Position not found");
  const q = await getQuote(pos.symbol);
  const closePrice = pos.direction === "buy" ? q.bid : q.ask;
  const inst = instrument(pos.symbol)!;
  const dirSign = pos.direction === "buy" ? 1 : -1;
  const pl = dirSign * (closePrice - pos.openPrice) * pos.sizeLots * inst.contractSize;
  user.balanceUsd += pos.marginUsd + pl; // return margin + realize PnL
  store.saveUser(user);
  store.removePosition(positionId);
  audit.info("POSITION_CLOSE", { userId: user.id, positionId, realizedUsd: pl });
  return { realizedUsd: pl };
}

// Live unrealized PnL for a position given current quote.
export async function unrealizedPnl(pos: Position): Promise<number> {
  const q = await getQuote(pos.symbol);
  const inst = instrument(pos.symbol)!;
  const closePrice = pos.direction === "buy" ? q.bid : q.ask;
  const dirSign = pos.direction === "buy" ? 1 : -1;
  return dirSign * (closePrice - pos.openPrice) * pos.sizeLots * inst.contractSize;
}

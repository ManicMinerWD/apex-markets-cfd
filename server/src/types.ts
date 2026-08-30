// Domain types. In production these map to DB tables / a real ledger.

export type KycStatus = "none" | "pending" | "verified" | "rejected";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  country: string; // ISO-2
  jurisdiction: string; // derived compliance bucket
  kycStatus: KycStatus;
  sumsubApplicantId?: string;
  amlCleared: boolean;
  balanceUsd: number; // virtual in sandbox; REAL segregated client account in prod
  createdAt: number;
  isBlocked: boolean; // compliance lock
}

export type Direction = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop";

export interface Position {
  id: string;
  userId: string;
  symbol: string;
  direction: Direction;
  sizeLots: number;
  openPrice: number;
  openTime: number;
  // leverage applied at open (capped by jurisdiction tier)
  leverage: number;
  marginUsd: number;
}

export interface Instrument {
  symbol: string;
  name: string;
  category: "forex" | "index" | "commodity" | "crypto";
  contractSize: number; // units per lot
  minLots: number;
  maxLots: number;
  digits: number;
}

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  ts: number;
}

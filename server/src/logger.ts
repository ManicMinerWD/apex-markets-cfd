import winston from "winston";

// Central audit logger. Compliance events (KYC, AML, trade, login) are
// written here with a structured format. In production ship to a WORM store.
export const audit = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: "cfd-platform" },
  transports: [new winston.transports.Console()]
});

export const log = audit;

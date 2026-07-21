const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const db = require("./db");

const PORT = process.env.PORT || 3000;
const STALE_MS = 60_000; // consider disconnected after 60s of silence

const app = express();
app.use(cors());
app.use(express.json());

function genApiKey() {
  return crypto.randomBytes(24).toString("hex");
}

function requireApiKey(req, res, next) {
  const key = req.header("X-Api-Key") || req.query.apiKey;
  if (!key) return res.status(401).json({ error: "Missing API key (X-Api-Key header or ?apiKey=)" });
  const account = db.getAccount(key);
  if (!account) return res.status(401).json({ error: "Unknown API key" });
  req.account = account;
  req.apiKey = key;
  next();
}

app.post("/api/accounts", (req, res) => {
  const key = genApiKey();
  const label = (req.body && req.body.label) || "My Account";
  const account = db.createAccount(key, label);
  res.json({ apiKey: key, label: account.label });
});

app.post("/api/accounts/rotate", requireApiKey, (req, res) => {
  const newKey = genApiKey();
  db.rotateKey(req.apiKey, newKey);
  res.json({ apiKey: newKey });
});

app.post("/api/account", requireApiKey, (req, res) => {
  const { equity, balance, open_positions } = req.body || {};
  if (typeof equity !== "number" || typeof balance !== "number") {
    return res.status(400).json({ error: "equity and balance must be numbers" });
  }
  db.updateAccount(req.apiKey, { equity, balance, openPositions: open_positions });
  res.json({ ok: true });
});

app.post("/api/trade", requireApiKey, (req, res) => {
  const { robot, symbol, direction, volume, pnl } = req.body || {};
  if (!symbol || !direction) return res.status(400).json({ error: "symbol and direction are required" });
  const trade = db.addTrade(req.apiKey, { robot, symbol, direction, volume, pnl });
  res.json({ ok: true, trade });
});

app.get("/api/account", requireApiKey, (req, res) => {
  const a = req.account;
  const staleMs = a.lastSeen ? Date.now() - new Date(a.lastSeen).getTime() : Infinity;
  const connected = a.connected && staleMs < STALE_MS;
  res.json({
    label: a.label,
    equity: a.equity,
    balance: a.balance,
    openPositions: a.openPositions,
    connected,
    lastSeen: a.lastSeen,
  });
});

app.get("/api/equity-history", requireApiKey, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 500);
  res.json(db.getEquityHistory(req.apiKey, limit));
});

app.get("/api/trades", requireApiKey, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  res.json(db.getTrades(req.apiKey, limit));
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`TradeBot AI bridge server listening on port ${PORT}`);
});

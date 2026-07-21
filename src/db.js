const fs = require("fs");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data.json");

function load() {
  if (!fs.existsSync(DB_PATH)) {
    return { accounts: {}, snapshots: [], trades: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return { accounts: {}, snapshots: [], trades: [] };
  }
}

let state = load();
let nextTradeId = state.trades.reduce((m, t) => Math.max(m, t.id), 0) + 1;

function save() {
  fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2));
}

module.exports = {
  getAccount(apiKey) {
    return state.accounts[apiKey] || null;
  },

  createAccount(apiKey, label) {
    state.accounts[apiKey] = {
      apiKey,
      label,
      equity: 0,
      balance: 0,
      openPositions: 0,
      connected: false,
      lastSeen: null,
      createdAt: new Date().toISOString(),
    };
    save();
    return state.accounts[apiKey];
  },

  rotateKey(oldKey, newKey) {
    const acc = state.accounts[oldKey];
    if (!acc) return null;
    acc.apiKey = newKey;
    state.accounts[newKey] = acc;
    delete state.accounts[oldKey];
    state.snapshots.forEach((s) => { if (s.apiKey === oldKey) s.apiKey = newKey; });
    state.trades.forEach((t) => { if (t.apiKey === oldKey) t.apiKey = newKey; });
    save();
    return newKey;
  },

  updateAccount(apiKey, { equity, balance, openPositions }) {
    const acc = state.accounts[apiKey];
    if (!acc) return null;
    acc.equity = equity;
    acc.balance = balance;
    acc.openPositions = openPositions || 0;
    acc.connected = true;
    acc.lastSeen = new Date().toISOString();
    state.snapshots.push({ apiKey, equity, balance, ts: acc.lastSeen });
    save();
    return acc;
  },

  addTrade(apiKey, { robot, symbol, direction, volume, pnl }) {
    const trade = {
      id: nextTradeId++,
      apiKey,
      robot: robot || null,
      symbol,
      direction,
      volume: volume || null,
      pnl: pnl || 0,
      ts: new Date().toISOString(),
    };
    state.trades.push(trade);
    const acc = state.accounts[apiKey];
    if (acc) acc.lastSeen = trade.ts;
    save();
    return trade;
  },

  getEquityHistory(apiKey, limit) {
    return state.snapshots
      .filter((s) => s.apiKey === apiKey)
      .slice(-limit);
  },

  getTrades(apiKey, limit) {
    return state.trades
      .filter((t) => t.apiKey === apiKey)
      .slice(-limit)
      .reverse();
  },
};

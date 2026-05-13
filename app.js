const CONFIG_KEY = "sureshPortfolioConfig";
const HISTORY_KEY = "sureshPortfolioHistory";
const QUOTE_KEY = "sureshPortfolioQuotes";
const REFRESH_KEY = "sureshPortfolioLastRefresh";
const INVESTED_DEFAULT = 1300000;
const DATA_URL = "data/portfolio-data.json";

const holdings = [
  { symbol: "M&MFIN", yahoo: "M%26MFIN.NS", qty: 252, avgCost: 261.53, seedPrice: 300.85 },
  { symbol: "VGUARD", yahoo: "VGUARD.NS", qty: 179, avgCost: 364.97, seedPrice: 335.3 },
  { symbol: "INDHOTEL", yahoo: "INDHOTEL.NS", qty: 159, avgCost: 764.94, seedPrice: 661 },
  { symbol: "WABAG", yahoo: "WABAG.NS", qty: 138, avgCost: 1528.8, seedPrice: 1491.3 },
  { symbol: "HDFCBANK", yahoo: "HDFCBANK.NS", qty: 110, avgCost: 913.55, seedPrice: 803.9 },
  { symbol: "DABUR", yahoo: "DABUR.NS", qty: 104, avgCost: 526.97, seedPrice: 457.65 },
  { symbol: "WONDERLA", yahoo: "WONDERLA.NS", qty: 101, avgCost: 624.21, seedPrice: 529.5 },
  { symbol: "PVRINOX", yahoo: "PVRINOX.NS", qty: 71, avgCost: 1088.18, seedPrice: 976.05 },
  { symbol: "AHLUCONT", yahoo: "AHLUCONT.NS", qty: 61, avgCost: 955.84, seedPrice: 881.5 },
  { symbol: "AXISBANK", yahoo: "AXISBANK.NS", qty: 44, avgCost: 1069.8, seedPrice: 1385.6 },
  { symbol: "RELIANCE", yahoo: "RELIANCE.NS", qty: 39, avgCost: 1390.78, seedPrice: 1362.8 },
  { symbol: "ICICIBANK", yahoo: "ICICIBANK.NS", qty: 36, avgCost: 1424.66, seedPrice: 1370.5 },
  { symbol: "BHARTIARTL", yahoo: "BHARTIARTL.NS", qty: 48, avgCost: 1902.29, seedPrice: 1842 },
  { symbol: "M&M", yahoo: "M%26M.NS", qty: 27, avgCost: 3363.8, seedPrice: 3204 },
  { symbol: "LT", yahoo: "LT.NS", qty: 24, avgCost: 3602.78, seedPrice: 4043 },
  { symbol: "INDIGO", yahoo: "INDIGO.NS", qty: 18, avgCost: 5871.61, seedPrice: 4663 }
];

const els = {
  portfolioValue: document.querySelector("#portfolioValue"),
  valueSubtitle: document.querySelector("#valueSubtitle"),
  portfolioPnl: document.querySelector("#portfolioPnl"),
  dayChange: document.querySelector("#dayChange"),
  dayChangeSubtitle: document.querySelector("#dayChangeSubtitle"),
  lastUpdate: document.querySelector("#lastUpdate"),
  marketState: document.querySelector("#marketState"),
  weeklyReturn: document.querySelector("#weeklyReturn"),
  monthlyReturn: document.querySelector("#monthlyReturn"),
  yearlyReturn: document.querySelector("#yearlyReturn"),
  sinceTransferReturn: document.querySelector("#sinceTransferReturn"),
  historyChart: document.querySelector("#historyChart"),
  intradayChart: document.querySelector("#intradayChart"),
  dailyChangeChart: document.querySelector("#dailyChangeChart"),
  holdingsBody: document.querySelector("#holdingsBody"),
  dataSource: document.querySelector("#dataSource"),
  refreshBtn: document.querySelector("#refreshBtn"),
  installBtn: document.querySelector("#installBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importInput: document.querySelector("#importInput"),
  investedInput: document.querySelector("#investedInput"),
  startDateInput: document.querySelector("#startDateInput"),
  cashInput: document.querySelector("#cashInput"),
  historyRange: document.querySelector("#historyRange"),
  toast: document.querySelector("#toast")
};

let deferredInstallPrompt;
let state = {
  config: loadJson(CONFIG_KEY, {
    investedAmount: INVESTED_DEFAULT,
    startDate: `${new Date().getFullYear()}-04-01`,
    cashBalance: 0
  }),
  quotes: loadJson(QUOTE_KEY, seedQuotes()),
  history: loadJson(HISTORY_KEY, []),
  lastRefresh: localStorage.getItem(REFRESH_KEY)
};

function seedQuotes() {
  return Object.fromEntries(holdings.map((h) => [
    h.symbol,
    {
      price: h.seedPrice,
      previousClose: h.seedPrice,
      regularMarketTime: null,
      source: "Screenshot seed"
    }
  ]));
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
  localStorage.setItem(QUOTE_KEY, JSON.stringify(state.quotes));
  localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
  if (state.lastRefresh) {
    localStorage.setItem(REFRESH_KEY, state.lastRefresh);
  }
}

function money(value, compact = false) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: compact ? 0 : 2
  }).format(value || 0);
}

function pct(value) {
  if (!Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function priceFor(holding) {
  return state.quotes[holding.symbol]?.price ?? holding.seedPrice;
}

function previousCloseFor(holding) {
  return state.quotes[holding.symbol]?.previousClose ?? holding.seedPrice;
}

function portfolioValueFromPrices(priceGetter) {
  return holdings.reduce((sum, holding) => sum + holding.qty * priceGetter(holding), 0);
}

function cashBalance() {
  return Number(state.config.cashBalance) || 0;
}

function currentValue() {
  return portfolioValueFromPrices(priceFor) + cashBalance();
}

function previousCloseValue() {
  return portfolioValueFromPrices(previousCloseFor) + cashBalance();
}

function upsertHistoryPoint(point) {
  const byDate = new Map(state.history.map((entry) => [entry.date, entry]));
  byDate.set(point.date, { ...byDate.get(point.date), ...point });
  state.history = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function snapshotToday() {
  upsertHistoryPoint({
    date: todayKey(),
    value: currentValue(),
    source: "live-or-seed",
    savedAt: new Date().toISOString()
  });
  save();
}

function render() {
  const value = currentValue();
  const invested = Number(state.config.investedAmount) || INVESTED_DEFAULT;
  const pnl = value - invested;
  const day = value - previousCloseValue();
  const dayPct = previousCloseValue() ? (day / previousCloseValue()) * 100 : 0;
  const latestQuote = Object.values(state.quotes).map((q) => q.regularMarketTime).filter(Boolean).sort().at(-1);
  const latestHistory = state.history.at(-1);

  els.portfolioValue.textContent = money(value);
  els.valueSubtitle.textContent = `${holdings.length} holdings + ${money(cashBalance())} cash`;
  els.portfolioPnl.textContent = `${pnl >= 0 ? "+" : ""}${money(pnl)}`;
  els.portfolioPnl.className = pnl >= 0 ? "gain" : "loss";
  els.dayChange.textContent = `${day >= 0 ? "+" : ""}${money(day)} (${pct(dayPct)})`;
  els.dayChange.className = day >= 0 ? "gain" : "loss";
  els.dayChangeSubtitle.textContent = "Based on previous close from quote feed";
  els.lastUpdate.textContent = state.lastRefresh ? new Date(state.lastRefresh).toLocaleString() : "Seed data";
  els.marketState.textContent = latestQuote
    ? `Quote feed time: ${new Date(latestQuote * 1000).toLocaleString()}`
    : latestHistory ? `Saved history through ${latestHistory.date}` : "No saved history yet";
  els.dataSource.textContent = latestQuote ? "Yahoo Finance" : "Offline seed";

  renderReturnCards(value, invested);
  renderHoldings(value);
  drawCharts();
}

function renderReturnCards(value, invested) {
  const history = state.history.filter((entry) => Number.isFinite(entry.value));
  const lookup = (daysBack) => {
    const target = new Date();
    target.setDate(target.getDate() - daysBack);
    const key = todayKey(target);
    return [...history].reverse().find((entry) => entry.date <= key)?.value;
  };
  const calc = (base) => base ? ((value - base) / base) * 100 : NaN;

  setReturn(els.weeklyReturn, calc(lookup(7)));
  setReturn(els.monthlyReturn, calc(lookup(30)));
  setReturn(els.yearlyReturn, calc(lookup(365)));
  setReturn(els.sinceTransferReturn, calc(invested));
}

function setReturn(el, value) {
  el.textContent = pct(value);
  if (!Number.isFinite(value)) {
    el.className = "";
    return;
  }
  el.className = value >= 0 ? "gain" : "loss";
}

function renderHoldings(totalValue) {
  els.holdingsBody.innerHTML = holdings.map((holding) => {
    const quote = state.quotes[holding.symbol] || {};
    const price = priceFor(holding);
    const value = price * holding.qty;
    const cost = holding.avgCost * holding.qty;
    const pnl = value - cost;
    const weight = totalValue ? (value / totalValue) * 100 : 0;
    return `
      <tr>
        <td><strong>${holding.symbol}</strong></td>
        <td>${holding.qty}</td>
        <td>${money(holding.avgCost)}</td>
        <td>${money(price)}${quote.source === "Screenshot seed" ? " *" : ""}</td>
        <td>${money(value)}</td>
        <td class="${pnl >= 0 ? "gain" : "loss"}">${pnl >= 0 ? "+" : ""}${money(pnl)}</td>
        <td>${weight.toFixed(1)}%</td>
      </tr>
    `;
  }).join("");
}

async function refreshAll() {
  els.refreshBtn.disabled = true;
  els.refreshBtn.textContent = "Refreshing...";
  try {
    const publishedDataLoaded = await fetchPublishedData();
    if (publishedDataLoaded) {
      state.lastRefresh = new Date().toISOString();
      snapshotToday();
      toast("Portfolio updated from Git data");
      return;
    }

    const results = await Promise.allSettled([fetchQuotes(), fetchHistoricalPortfolio(), fetchIntradayPortfolio()]);
    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length) {
      console.warn("Some market-data refreshes failed", failed.map((result) => result.reason));
      toast("Some live data could not be reached; saved seed data is still shown");
    } else {
      toast("Portfolio updated");
    }
    state.lastRefresh = new Date().toISOString();
    snapshotToday();
  } finally {
    els.refreshBtn.disabled = false;
    els.refreshBtn.textContent = "Refresh prices";
    render();
  }
}

async function fetchQuotes() {
  const symbols = holdings.map((h) => h.yahoo).join(",");
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;
  const data = await getJson(url);
  const results = data?.quoteResponse?.result || [];
  for (const item of results) {
    const match = holdings.find((h) => decodeURIComponent(h.yahoo) === item.symbol);
    if (!match || !Number.isFinite(item.regularMarketPrice)) continue;
    state.quotes[match.symbol] = {
      price: item.regularMarketPrice,
      previousClose: item.regularMarketPreviousClose || item.regularMarketPrice,
      regularMarketTime: item.regularMarketTime || null,
      source: "Yahoo Finance"
    };
  }
  save();
}

async function fetchHistoricalPortfolio() {
  const start = new Date(`${state.config.startDate}T00:00:00`);
  const end = new Date();
  end.setDate(end.getDate() + 1);
  const period1 = Math.floor(start.getTime() / 1000);
  const period2 = Math.floor(end.getTime() / 1000);
  const series = await Promise.all(holdings.map(async (holding) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${holding.yahoo}?period1=${period1}&period2=${period2}&interval=1d`;
    return { holding, data: await chartPoints(url) };
  }));
  const dates = new Set(series.flatMap((item) => item.data.map((point) => point.date)));
  for (const date of [...dates].sort()) {
    let total = 0;
    let count = 0;
    for (const { holding, data } of series) {
      const point = data.find((entry) => entry.date === date);
      if (point) {
        total += point.close * holding.qty;
        count += 1;
      }
    }
    if (count > holdings.length * 0.65) {
      upsertHistoryPoint({ date, value: total, source: "Yahoo daily close", savedAt: new Date().toISOString() });
    }
  }
  save();
}

async function fetchIntradayPortfolio() {
  const series = await Promise.all(holdings.map(async (holding) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${holding.yahoo}?range=1d&interval=5m`;
    return { holding, data: await chartPoints(url, true) };
  }));
  const times = new Set(series.flatMap((item) => item.data.map((point) => point.time)));
  const intraday = [];
  for (const time of [...times].sort((a, b) => a - b)) {
    let total = 0;
    let count = 0;
    for (const { holding, data } of series) {
      const point = data.find((entry) => entry.time === time);
      if (point) {
        total += point.close * holding.qty;
        count += 1;
      }
    }
    if (count > holdings.length * 0.65) {
      intraday.push({ time, value: total });
    }
  }
  sessionStorage.setItem("sureshPortfolioIntraday", JSON.stringify(intraday));
}

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

async function chartPoints(url, includeTime = false) {
  const data = await getJson(url);
  const result = data?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  return timestamps.map((time, index) => ({
    date: new Date(time * 1000).toISOString().slice(0, 10),
    time,
    close: quote.close?.[index]
  })).filter((point) => Number.isFinite(point.close) && (includeTime || point.date));
}

function drawCharts() {
  const range = els.historyRange.value;
  const history = range === "all" ? state.history : state.history.slice(-Number(range));
  drawLineChart(els.historyChart, history.map((entry) => ({
    label: entry.date.slice(5),
    value: entry.value
  })), { color: "#0f766e", fill: "rgba(15,118,110,0.10)", prefix: "₹" });

  const intraday = loadJsonFromSession("sureshPortfolioIntraday", []);
  drawLineChart(els.intradayChart, intraday.map((entry) => ({
    label: new Date(entry.time * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    value: entry.value
  })), { color: "#2563eb", fill: "rgba(37,99,235,0.10)", prefix: "₹" });

  const changes = history.slice(1).map((entry, index) => ({
    label: entry.date.slice(5),
    value: entry.value - history[index].value
  }));
  drawBarChart(els.dailyChangeChart, changes, { positive: "#15803d", negative: "#b91c1c" });
}

async function fetchPublishedData() {
  try {
    const data = await getJson(`${DATA_URL}?t=${Date.now()}`);
    applyPublishedData(data);
    return true;
  } catch {
    return false;
  }
}

function applyPublishedData(data) {
  if (data?.quotes) {
    state.quotes = data.quotes;
  }
  if (Array.isArray(data?.history)) {
    state.history = data.history;
  }
  if (Array.isArray(data?.intraday)) {
    sessionStorage.setItem("sureshPortfolioIntraday", JSON.stringify(data.intraday));
  }
  if (data?.refreshedAt) {
    state.lastRefresh = data.refreshedAt;
  }
  save();
}

function loadJsonFromSession(key, fallback) {
  try {
    return JSON.parse(sessionStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function setupCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(Number(canvas.getAttribute("height")) * ratio));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width: rect.width, height: Number(canvas.getAttribute("height")) };
}

function drawLineChart(canvas, data, opts) {
  const { ctx, width, height } = setupCanvas(canvas);
  clearChart(ctx, width, height);
  if (data.length < 2) return drawEmpty(ctx, width, height, "More data will appear after refresh");
  const pad = { top: 18, right: 14, bottom: 34, left: 58 };
  const values = data.map((d) => d.value);
  const { min, max } = domainFor(values);
  const scale = scaleFor(values, height, pad);
  const x = (i) => pad.left + (i / (data.length - 1)) * (width - pad.left - pad.right);
  drawGrid(ctx, width, height, pad, min, max);
  ctx.beginPath();
  data.forEach((d, i) => {
    const y = scale(d.value);
    if (i === 0) ctx.moveTo(x(i), y);
    else ctx.lineTo(x(i), y);
  });
  ctx.lineTo(x(data.length - 1), height - pad.bottom);
  ctx.lineTo(x(0), height - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = opts.fill;
  ctx.fill();
  ctx.beginPath();
  data.forEach((d, i) => {
    const y = scale(d.value);
    if (i === 0) ctx.moveTo(x(i), y);
    else ctx.lineTo(x(i), y);
  });
  ctx.strokeStyle = opts.color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  drawAxisLabels(ctx, data, width, height, pad);
}

function drawBarChart(canvas, data, opts) {
  const { ctx, width, height } = setupCanvas(canvas);
  clearChart(ctx, width, height);
  if (data.length < 1) return drawEmpty(ctx, width, height, "Daily changes will appear after refresh");
  const pad = { top: 18, right: 14, bottom: 34, left: 58 };
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const zero = pad.top + (height - pad.top - pad.bottom) / 2;
  drawGrid(ctx, width, height, pad, -maxAbs, maxAbs);
  const gap = 3;
  const barWidth = Math.max(4, (width - pad.left - pad.right) / data.length - gap);
  data.forEach((d, i) => {
    const x = pad.left + i * ((width - pad.left - pad.right) / data.length) + gap / 2;
    const barHeight = (Math.abs(d.value) / maxAbs) * ((height - pad.top - pad.bottom) / 2);
    ctx.fillStyle = d.value >= 0 ? opts.positive : opts.negative;
    ctx.fillRect(x, d.value >= 0 ? zero - barHeight : zero, barWidth, Math.max(1, barHeight));
  });
  ctx.strokeStyle = "#94a3b8";
  ctx.beginPath();
  ctx.moveTo(pad.left, zero);
  ctx.lineTo(width - pad.right, zero);
  ctx.stroke();
  drawAxisLabels(ctx, data, width, height, pad);
}

function clearChart(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfdff";
  ctx.fillRect(0, 0, width, height);
}

function drawEmpty(ctx, width, height, label) {
  ctx.fillStyle = "#64748b";
  ctx.font = "700 14px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(label, width / 2, height / 2);
}

function scaleFor(values, height, pad) {
  const { min, max } = domainFor(values);
  const span = max - min;
  return (value) => pad.top + (1 - (value - min) / span) * (height - pad.top - pad.bottom);
}

function domainFor(values) {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.01, 1);
    min -= padding;
    max += padding;
  }
  return { min, max };
}

function drawGrid(ctx, width, height, pad, min, max) {
  ctx.strokeStyle = "#e5ebf3";
  ctx.fillStyle = "#64748b";
  ctx.font = "12px system-ui";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (i / 4) * (height - pad.top - pad.bottom);
    const value = max - (i / 4) * (max - min);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillText(formatAxis(value), pad.left - 8, y + 4);
  }
}

function drawAxisLabels(ctx, data, width, height, pad) {
  ctx.fillStyle = "#64748b";
  ctx.font = "12px system-ui";
  ctx.textAlign = "center";
  const labels = [0, Math.floor((data.length - 1) / 2), data.length - 1];
  for (const index of [...new Set(labels)]) {
    const x = pad.left + (index / Math.max(1, data.length - 1)) * (width - pad.left - pad.right);
    ctx.fillText(data[index].label, x, height - 12);
  }
}

function formatAxis(value) {
  const abs = Math.abs(value);
  if (abs >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return value.toFixed(0);
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function setupEvents() {
  els.refreshBtn.addEventListener("click", refreshAll);
  els.historyRange.addEventListener("change", drawCharts);
  els.investedInput.value = state.config.investedAmount;
  els.startDateInput.value = state.config.startDate;
  els.cashInput.value = state.config.cashBalance || 0;
  els.investedInput.addEventListener("change", () => {
    state.config.investedAmount = Number(els.investedInput.value) || INVESTED_DEFAULT;
    save();
    render();
  });
  els.startDateInput.addEventListener("change", async () => {
    state.config.startDate = els.startDateInput.value;
    save();
    await refreshAll();
  });
  els.cashInput.addEventListener("change", () => {
    state.config.cashBalance = Number(els.cashInput.value) || 0;
    save();
    render();
  });
  els.exportBtn.addEventListener("click", exportData);
  els.importInput.addEventListener("change", importData);
  window.addEventListener("resize", drawCharts);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    els.installBtn.hidden = false;
  });
  els.installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.installBtn.hidden = true;
  });
}

function exportData() {
  const blob = new Blob([JSON.stringify({ config: state.config, history: state.history, quotes: state.quotes }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `suresh-portfolio-${todayKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const data = JSON.parse(await file.text());
  state.config = data.config || state.config;
  state.history = data.history || state.history;
  state.quotes = data.quotes || state.quotes;
  save();
  render();
  toast("Imported saved portfolio data");
}

async function setupPwa() {
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.register("sw.js");
    if ("periodicSync" in registration) {
      try {
        await registration.periodicSync.register("daily-portfolio-reminder", { minInterval: 24 * 60 * 60 * 1000 });
      } catch {
        // Some browsers require the app to be installed or permission to be granted first.
      }
    }
  }
}

function scheduleAutoRefresh() {
  const lastAuto = localStorage.getItem("sureshPortfolioLastAutoRefresh");
  if (lastAuto !== todayKey()) {
    localStorage.setItem("sureshPortfolioLastAutoRefresh", todayKey());
    refreshAll();
  }
  setInterval(refreshAll, 15 * 60 * 1000);
}

setupEvents();
render();
setupPwa();
fetchPublishedData().then(() => {
  render();
  scheduleAutoRefresh();
});

const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data", "portfolio-data.json");
const startDate = process.env.PORTFOLIO_START_DATE || `${new Date().getFullYear()}-04-01`;

const holdings = [
  { symbol: "M&MFIN", yahoo: "M%26MFIN.NS", qty: 252, seedPrice: 300.85 },
  { symbol: "VGUARD", yahoo: "VGUARD.NS", qty: 179, seedPrice: 335.3 },
  { symbol: "INDHOTEL", yahoo: "INDHOTEL.NS", qty: 159, seedPrice: 661 },
  { symbol: "WABAG", yahoo: "WABAG.NS", qty: 138, seedPrice: 1491.3 },
  { symbol: "HDFCBANK", yahoo: "HDFCBANK.NS", qty: 110, seedPrice: 803.9 },
  { symbol: "DABUR", yahoo: "DABUR.NS", qty: 104, seedPrice: 457.65 },
  { symbol: "WONDERLA", yahoo: "WONDERLA.NS", qty: 101, seedPrice: 529.5 },
  { symbol: "PVRINOX", yahoo: "PVRINOX.NS", qty: 71, seedPrice: 976.05 },
  { symbol: "AHLUCONT", yahoo: "AHLUCONT.NS", qty: 61, seedPrice: 881.5 },
  { symbol: "AXISBANK", yahoo: "AXISBANK.NS", qty: 44, seedPrice: 1385.6 },
  { symbol: "RELIANCE", yahoo: "RELIANCE.NS", qty: 39, seedPrice: 1362.8 },
  { symbol: "ICICIBANK", yahoo: "ICICIBANK.NS", qty: 36, seedPrice: 1370.5 },
  { symbol: "BHARTIARTL", yahoo: "BHARTIARTL.NS", qty: 48, seedPrice: 1842 },
  { symbol: "M&M", yahoo: "M%26M.NS", qty: 27, seedPrice: 3204 },
  { symbol: "LT", yahoo: "LT.NS", qty: 24, seedPrice: 4043 },
  { symbol: "INDIGO", yahoo: "INDIGO.NS", qty: 18, seedPrice: 4663 }
];

function localDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}

async function readExistingData() {
  try {
    return JSON.parse(await fs.readFile(dataPath, "utf8"));
  } catch {
    return { quotes: {}, history: [], intraday: [] };
  }
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 portfolio-tracker"
    }
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} from ${url}`);
  }
  return response.json();
}

async function fetchQuotes(existingQuotes) {
  const quotes = { ...existingQuotes };

  await Promise.all(holdings.map(async (holding) => {
    const data = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${holding.yahoo}?range=5d&interval=1d`);
    const result = data?.chart?.result?.[0];
    const meta = result?.meta || {};
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const validCloses = closes.filter(Number.isFinite);
    const price = Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : validCloses.at(-1);
    const previousClose = Number.isFinite(meta.chartPreviousClose)
      ? meta.chartPreviousClose
      : validCloses.at(-2) || price;
    if (!Number.isFinite(price)) return;
    quotes[holding.symbol] = {
      price,
      previousClose,
      regularMarketTime: meta.regularMarketTime || null,
      source: "Yahoo Finance"
    };
  }));

  for (const holding of holdings) {
    if (!quotes[holding.symbol]) {
      quotes[holding.symbol] = {
        price: holding.seedPrice,
        previousClose: holding.seedPrice,
        regularMarketTime: null,
        source: "Screenshot seed"
      };
    }
  }

  return quotes;
}

async function chartPoints(url) {
  const data = await getJson(url);
  const result = data?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  return timestamps.map((time, index) => ({
    date: localDateKey(new Date(time * 1000)),
    time,
    close: quote.close?.[index]
  })).filter((point) => Number.isFinite(point.close));
}

async function fetchHistorical(existingHistory) {
  const start = new Date(`${startDate}T00:00:00+05:30`);
  const end = new Date();
  end.setDate(end.getDate() + 1);
  const period1 = Math.floor(start.getTime() / 1000);
  const period2 = Math.floor(end.getTime() / 1000);
  const series = await Promise.all(holdings.map(async (holding) => ({
    holding,
    points: await chartPoints(`https://query1.finance.yahoo.com/v8/finance/chart/${holding.yahoo}?period1=${period1}&period2=${period2}&interval=1d`)
  })));
  const dates = new Set(series.flatMap((item) => item.points.map((point) => point.date)));
  const historyByDate = new Map((existingHistory || []).map((entry) => [entry.date, entry]));

  for (const date of [...dates].sort()) {
    let value = 0;
    let count = 0;
    for (const { holding, points } of series) {
      const point = points.find((entry) => entry.date === date);
      if (point) {
        value += point.close * holding.qty;
        count += 1;
      }
    }
    if (count >= Math.ceil(holdings.length * 0.75)) {
      historyByDate.set(date, {
        date,
        value: Number(value.toFixed(2)),
        source: "Yahoo daily close",
        savedAt: new Date().toISOString()
      });
    }
  }

  return [...historyByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchIntraday() {
  const series = await Promise.all(holdings.map(async (holding) => ({
    holding,
    points: await chartPoints(`https://query1.finance.yahoo.com/v8/finance/chart/${holding.yahoo}?range=1d&interval=5m`)
  })));
  const times = new Set(series.flatMap((item) => item.points.map((point) => point.time)));
  const intraday = [];

  for (const time of [...times].sort((a, b) => a - b)) {
    let value = 0;
    let count = 0;
    for (const { holding, points } of series) {
      const point = points.find((entry) => entry.time === time);
      if (point) {
        value += point.close * holding.qty;
        count += 1;
      }
    }
    if (count >= Math.ceil(holdings.length * 0.75)) {
      intraday.push({ time, value: Number(value.toFixed(2)) });
    }
  }

  return intraday;
}

async function main() {
  const existing = await readExistingData();
  const [quotes, history, intraday] = await Promise.all([
    fetchQuotes(existing.quotes),
    fetchHistorical(existing.history),
    fetchIntraday()
  ]);

  const output = {
    refreshedAt: new Date().toISOString(),
    source: "Yahoo Finance via GitHub Actions",
    quotes,
    history,
    intraday
  };

  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Updated ${path.relative(root, dataPath)} with ${history.length} historical points and ${intraday.length} intraday points.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

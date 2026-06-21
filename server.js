const express = require("express");
const fs = require("fs");
const path = require("path");

const { Store } = require("./src/store");
const { DistributedCache } = require("./src/cache");
const { Trending } = require("./src/trending");
const { BatchWriter } = require("./src/batchWriter");

const PORT = process.env.PORT || 3000;
const CACHE_NODES = ["cache-node-1", "cache-node-2", "cache-node-3", "cache-node-4"];
const CACHE_TTL_MS = 30000;
const SUGGEST_LIMIT = 10;

function loadDataset() {
  const file = path.join(__dirname, "data", "queries.csv");
  if (!fs.existsSync(file)) {
    console.error("Dataset not found. Run: npm run download   (or offline: npm run gen)");
    process.exit(1);
  }
  const text = fs.readFileSync(file, "utf8").trim();
  const lines = text.split("\n");
  const entries = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const idx = line.lastIndexOf(",");
    if (idx === -1) continue;
    const query = line.slice(0, idx).trim().toLowerCase();
    const count = parseInt(line.slice(idx + 1).trim(), 10);
    if (query && !isNaN(count)) entries.push({ query, count });
  }
  return entries;
}

const store = new Store();
const cache = new DistributedCache(CACHE_NODES, CACHE_TTL_MS);
const trending = new Trending({ halfLifeMs: 5 * 60 * 1000 });

console.log("Loading dataset...");
const entries = loadDataset();
store.load(entries);
console.log("Loaded " + entries.length + " queries into the store.");

const batchWriter = new BatchWriter({
  store,
  cache,
  trending,
  flushIntervalMs: 3000,
  maxBatchSize: 50,
});

const latencies = [];
function recordLatency(ms) {
  latencies.push(ms);
  if (latencies.length > 1000) latencies.shift();
}
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Number(sorted[idx].toFixed(3));
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/suggest", (req, res) => {
  const start = process.hrtime.bigint();
  const prefix = String(req.query.q || "").trim().toLowerCase();
  const ranking = req.query.ranking === "recent" ? "recent" : "basic";

  if (!prefix) {
    return res.json({ prefix, ranking, source: "none", suggestions: [] });
  }

  let source;
  let suggestions;

  if (ranking === "basic") {
    source = "cache";
    suggestions = cache.get(prefix);
    if (suggestions === null) {
      source = "store";
      suggestions = store.suggest(prefix, SUGGEST_LIMIT);
      cache.set(prefix, suggestions);
    }
  } else {
    source = "store-live";
    const candidates = store.suggest(prefix, 50);
    const seen = new Set(candidates.map((c) => c.query));
    for (const q of trending.recentQueries()) {
      if (q.startsWith(prefix) && !seen.has(q)) {
        candidates.push({ query: q, count: store.getCount(q) });
        seen.add(q);
      }
    }
    const now = Date.now();
    suggestions = candidates
      .map((c) => {
        const recency = trending.scoreQuery(c.query, now);
        const score = recency * 10 + Math.log10(c.count + 1);
        return {
          query: c.query,
          count: c.count,
          recencyScore: Number(recency.toFixed(3)),
          score: Number(score.toFixed(3)),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, SUGGEST_LIMIT);
  }

  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  recordLatency(ms);

  res.set("x-cache", source === "cache" ? "HIT" : "MISS");
  res.json({
    prefix,
    ranking,
    source,
    ownerNode: cache.ring.getNode(prefix),
    latencyMs: Number(ms.toFixed(3)),
    suggestions,
  });
});

app.post("/search", (req, res) => {
  const query = String((req.body && req.body.query) || "").trim().toLowerCase();
  if (!query) {
    return res.status(400).json({ message: "query is required" });
  }
  batchWriter.submit(query);
  res.json({ message: "Searched" });
});

app.get("/cache/debug", (req, res) => {
  const prefix = String(req.query.prefix || "").trim().toLowerCase();
  if (!prefix) return res.status(400).json({ message: "prefix is required" });
  res.json(cache.debug(prefix));
});

app.get("/trending", (req, res) => {
  const mode = req.query.mode === "enhanced" ? "enhanced" : "basic";
  const limit = parseInt(req.query.limit, 10) || 10;
  const results = mode === "enhanced" ? trending.enhanced(store, limit) : trending.basic(store, limit);
  res.json({ mode, results });
});

app.get("/stats", (req, res) => {
  res.json({
    store: store.stats(),
    cache: cache.stats(),
    batch: batchWriter.stats(),
    suggestLatency: {
      samples: latencies.length,
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
      p99Ms: percentile(latencies, 99),
    },
  });
});

app.post("/flush", (req, res) => {
  res.json(batchWriter.flush("manual"));
});

const server = app.listen(PORT, () => {
  console.log("Search typeahead running at http://localhost:" + PORT);
});

function shutdown() {
  console.log("\nShutting down, flushing batch buffer...");
  batchWriter.stop();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

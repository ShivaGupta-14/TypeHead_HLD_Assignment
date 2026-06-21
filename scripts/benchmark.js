const PORT = process.env.PORT || 3000;
const BASE = "http://localhost:" + PORT;

const SUGGEST_REQUESTS = 2000;
const SEARCH_REQUESTS = 1000;
const CONCURRENCY = 20;

const words = [
  "iphone", "samsung", "laptop", "macbook", "headphones", "monitor", "keyboard",
  "mouse", "router", "camera", "tablet", "watch", "speaker", "charger", "java",
  "python", "react", "docker", "redis", "shoes", "jeans", "sofa", "coffee",
];

function skewedWord() {
  const i = Math.floor(Math.pow(Math.random(), 3) * words.length);
  return words[i];
}

function prefixOf(word) {
  const len = 1 + Math.floor(Math.random() * Math.min(word.length, 4));
  return word.slice(0, len);
}

async function suggest(prefix) {
  const start = process.hrtime.bigint();
  const res = await fetch(BASE + "/suggest?q=" + encodeURIComponent(prefix));
  await res.json();
  return Number(process.hrtime.bigint() - start) / 1e6;
}

async function search(query) {
  await fetch(BASE + "/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
}

async function pool(total, worker) {
  let next = 0;
  const out = [];
  async function lane() {
    while (next < total) {
      const i = next++;
      out[i] = await worker(i);
    }
  }
  const lanes = [];
  for (let i = 0; i < CONCURRENCY; i++) lanes.push(lane());
  await Promise.all(lanes);
  return out;
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Number(sorted[idx].toFixed(3));
}

async function main() {
  console.log("Benchmarking " + BASE);
  console.log("Suggest requests: " + SUGGEST_REQUESTS + ", searches: " + SEARCH_REQUESTS + ", concurrency: " + CONCURRENCY);

  try {
    await fetch(BASE + "/stats");
  } catch (e) {
    console.error("Could not reach the server. Start it first with: npm start");
    process.exit(1);
  }

  await pool(SEARCH_REQUESTS, () => search(skewedWord()));

  const latencies = await pool(SUGGEST_REQUESTS, () => suggest(prefixOf(skewedWord())));

  console.log("\nSuggest latency (client side):");
  console.log("  p50: " + percentile(latencies, 50) + " ms");
  console.log("  p95: " + percentile(latencies, 95) + " ms");
  console.log("  p99: " + percentile(latencies, 99) + " ms");

  const stats = await (await fetch(BASE + "/stats")).json();
  const hits = stats.cache.reduce((s, n) => s + n.hits, 0);
  const misses = stats.cache.reduce((s, n) => s + n.misses, 0);
  const hitRate = hits + misses ? (hits / (hits + misses)) : 0;

  console.log("\nServer side stats:");
  console.log("  cache hits: " + hits + ", misses: " + misses + ", hit rate: " + hitRate.toFixed(3));
  console.log("  store reads: " + stats.store.reads + ", writes: " + stats.store.writes);
  console.log("  searches submitted: " + stats.batch.totalSubmitted + ", writes: " + stats.batch.totalWrites + ", write reduction: " + stats.batch.writeReduction);
  console.log("  suggest p95 (server): " + stats.suggestLatency.p95Ms + " ms");
}

main();

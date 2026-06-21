const fs = require("fs");
const path = require("path");

const heads = [
  "iphone", "samsung", "laptop", "macbook", "headphones", "earbuds", "monitor",
  "keyboard", "mouse", "router", "camera", "tv", "tablet", "watch", "speaker",
  "printer", "charger", "cable", "adapter", "battery", "phone", "android",
  "ipad", "airpods", "shoes", "shirt", "jeans", "jacket", "bag", "wallet",
  "sofa", "chair", "table", "bed", "lamp", "fan", "cooler", "heater", "mixer",
  "blender", "oven", "fridge", "washing machine", "java", "python", "javascript",
  "react", "node", "docker", "kubernetes", "sql", "mongodb", "redis", "linux",
  "git", "html", "css", "spring", "django", "flask", "pizza", "burger", "coffee",
  "tea", "book", "novel", "movie", "song", "guitar", "piano", "bicycle", "car",
  "bike", "helmet", "ticket", "hotel", "flight", "course", "tutorial", "recipe",
];

const mods = [
  "pro", "max", "mini", "plus", "ultra", "lite", "case", "cover", "stand",
  "deals", "price", "review", "online", "best", "cheap", "new", "used", "wireless",
  "gaming", "office", "home", "kids", "women", "men", "black", "white", "red",
  "blue", "green", "16gb", "32gb", "256gb", "512gb", "2024", "2025", "model",
  "for beginners", "tutorial", "guide", "near me", "buy", "sale", "offer",
  "fast", "slim", "smart", "hd", "4k", "bluetooth", "usb",
];

function pickCount(parts) {
  if (parts === 1) return 50000 + Math.floor(rand() * 50000);
  if (parts === 2) return 5000 + Math.floor(rand() * 45000);
  return 100 + Math.floor(rand() * 5000);
}

let seed = 12345;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

function main() {
  const target = 100000;
  const seen = new Set();
  const rows = [];

  const seeds = [
    ["iphone", 100000],
    ["iphone 15", 85000],
    ["iphone charger", 60000],
    ["java tutorial", 40000],
  ];
  for (const [q, c] of seeds) {
    seen.add(q);
    rows.push([q, c]);
  }

  for (const h of heads) {
    if (seen.has(h)) continue;
    seen.add(h);
    rows.push([h, pickCount(1)]);
  }

  for (const h of heads) {
    for (const m of mods) {
      const q = h + " " + m;
      if (seen.has(q)) continue;
      seen.add(q);
      rows.push([q, pickCount(2)]);
      if (rows.length >= target) break;
    }
    if (rows.length >= target) break;
  }

  outer: for (const h of heads) {
    for (let i = 0; i < mods.length; i++) {
      for (let j = 0; j < mods.length; j++) {
        if (i === j) continue;
        const q = h + " " + mods[i] + " " + mods[j];
        if (seen.has(q)) continue;
        seen.add(q);
        rows.push([q, pickCount(3)]);
        if (rows.length >= target) break outer;
      }
    }
  }

  const outDir = path.join(__dirname, "..", "data");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "queries.csv");

  const lines = ["query,count"];
  for (const [q, c] of rows) lines.push(q + "," + c);
  fs.writeFileSync(outFile, lines.join("\n"));

  console.log("Wrote " + rows.length + " queries to " + outFile);
}

main();

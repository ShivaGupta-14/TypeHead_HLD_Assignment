const fs = require("fs");
const path = require("path");

const SOURCE = "https://norvig.com/ngrams/count_1w.txt";

async function main() {
  console.log("Downloading word frequency dataset from " + SOURCE);
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error("Download failed with status " + response.status);

  const text = await response.text();
  const lines = text.split("\n");
  const rows = ["query,count"];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const tab = trimmed.indexOf("\t");
    if (tab === -1) continue;

    const word = trimmed.slice(0, tab).trim().toLowerCase();
    const count = trimmed.slice(tab + 1).trim();
    if (!word || word.includes(",") || isNaN(parseInt(count, 10))) continue;

    rows.push(word + "," + count);
  }

  const outDir = path.join(__dirname, "..", "data");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "queries.csv");
  fs.writeFileSync(outFile, rows.join("\n") + "\n");

  console.log("Wrote " + (rows.length - 1) + " queries to " + outFile);
}

main().catch((error) => {
  console.error("Could not download the dataset.");
  console.error(error.message);
  console.error("If you are offline, generate a local dataset instead: npm run gen");
  process.exit(1);
});

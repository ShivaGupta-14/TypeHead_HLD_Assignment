# Search Typeahead System

A search typeahead (autocomplete) system. As the user types, it shows the top 10
matching queries sorted by how often they were searched. It has a dummy search
API, a distributed cache that uses consistent hashing, trending searches, and
batch writes.

This was built for the HLD101 assignment.

## What it does

- Type a prefix and get up to 10 suggestions sorted by search count.
- Submit a search (Enter or the Search button). The backend returns `Searched`
  and the query count is updated.
- Suggestions are served from a cache first, and the cache is spread across
  multiple cache nodes using consistent hashing.
- Trending searches in two modes: all time popular (basic) and recency aware
  (enhanced).
- Search counts are written in batches instead of one write per search.

## Tech used

- Node.js and Express for the backend.
- Plain HTML, CSS and JavaScript for the UI (with debouncing).
- A Trie for prefix search.
- A self written consistent hashing ring for cache routing.
- In memory store and cache (no external database needed to run the demo).

## Setup

You need Node.js installed (v18 or higher).

```
npm install
npm run download   # downloads the dataset into data/queries.csv
npm start          # starts the server on http://localhost:3000
```

If you are offline, use `npm run gen` instead of `npm run download` to build a
local dataset. The dataset file is not committed to the repository, so one of
these commands must be run once before starting the server.

Then open http://localhost:3000 in a browser.

To produce the performance numbers, with the server running open another
terminal and run:

```
npm run benchmark
```

## Dataset

The dataset is an open source word frequency list from Peter Norvig
(https://norvig.com/ngrams/count_1w.txt), built from the Google Web Trillion
Word Corpus. It has 333333 entries, each with a real frequency count, which is
well above the 100000 minimum. The file is stored at `data/queries.csv` in the
format:

```
query,count
the,23135851162
of,13151942776
iphone,50988
```

The dataset file `data/queries.csv` is not committed to the repository, so it
must be created once before starting the server. Download it from the source:

```
npm run download
```

If you are offline, generate a local dataset instead with `npm run gen`, which
builds search style queries with synthetic counts.

Any CSV with a `query,count` header works, so the dataset can be swapped freely.

## APIs

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/suggest?q=<prefix>&ranking=basic\|recent` | Up to 10 suggestions. `basic` (default) sorts by all time count and is served from the cache. `recent` re-ranks using recency and is computed live. |
| POST | `/search` | Body `{ "query": "..." }`. Returns `{ "message": "Searched" }` and records the search. |
| GET | `/cache/debug?prefix=<prefix>` | Shows which cache node owns the prefix and whether it is a hit or miss. |
| GET | `/trending?mode=basic\|enhanced` | Trending searches. |
| GET | `/stats` | Latency (p50/p95/p99), cache hit rate, batch write stats. |
| POST | `/flush` | Manually flush the batch buffer (useful for the demo). |

### Examples

```
curl "http://localhost:3000/suggest?q=iph"
curl "http://localhost:3000/suggest?q=iph&ranking=recent"
curl -X POST localhost:3000/search -H "Content-Type: application/json" -d '{"query":"iphone 15"}'
curl "http://localhost:3000/cache/debug?prefix=iph"
curl "http://localhost:3000/trending?mode=enhanced"
curl "http://localhost:3000/stats"
```

## Project structure

```
server.js                  wires everything and defines the APIs
src/trie.js                prefix search
src/consistentHash.js      consistent hashing ring
src/cache.js               cache node + distributed cache
src/store.js               primary data store (counts + trie)
src/trending.js            basic and recency aware trending
src/batchWriter.js         buffer searches and flush in batches
scripts/downloadDataset.js downloads the open source dataset to data/queries.csv
scripts/generateDataset.js makes an offline dataset if you have no internet
scripts/benchmark.js       load test that prints latency, hit rate, write reduction
public/                    UI (index.html, app.js, style.css)
docs/ARCHITECTURE.md       how the system fits together and trade-offs
docs/VIVA_NOTES.md         short notes to explain each part in the viva
```

## Performance report

Run `npm run benchmark` while the server is running, or read `/stats` after
using the UI. A sample benchmark run (2000 suggest requests, 1000 searches):

- Cache hit rate: about 0.96 (most suggest requests are served from the cache).
- Store reads dropped from 2000 requests to about 80 actual store lookups.
- Write reduction: 1000 searches became about 340 writes (around 0.66 fewer
  writes) because repeated queries are aggregated per flush.
- Suggest latency: a cache hit is well under a millisecond on the server side.

See `docs/ARCHITECTURE.md` for more detail on these numbers.

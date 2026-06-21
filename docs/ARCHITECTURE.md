# Architecture

## Flow diagram

```
                 +-------------------+
   user types -> |   Browser UI      |
                 | (debounced calls) |
                 +---------+---------+
                           |
            GET /suggest?q=<prefix>      POST /search
                           |                  |
                           v                  v
                 +-------------------------------------+
                 |          Express server             |
                 +------+-----------------+------------+
                        |                 |
                  (1) check cache    (4) put search in
                        |                 batch buffer
                        v                 |
        +------------------------------+  |
        |   Distributed Cache          |  |
        |   consistent hashing ring    |  |
        |   node1 node2 node3 node4    |  |
        +---------------+--------------+  |
                        |                 |
              (2) miss -> read store      |
                        v                 v
                 +-------------------------------------+
                 |   Primary Store (Map + Trie)        |
                 |   query -> count                    |
                 +------------------+------------------+
                                    ^
                          (5) batch writer flushes
                          aggregated counts and
                          invalidates cached prefixes
```

Numbers in order:

1. On `/suggest`, the server asks the distributed cache for the prefix.
2. On a cache miss, it reads suggestions from the store (Trie) and writes them
   back to the cache with a TTL.
3. On a cache hit, it returns immediately without touching the store.
4. On `/search`, the query goes into the batch buffer (not written right away).
5. The batch writer flushes the buffer on a timer or when it is full. It
   aggregates repeated queries, applies the counts to the store, and
   invalidates the cached prefixes that changed.

## Components

### Trie (src/trie.js)
Prefix search. We walk down the tree character by character to the prefix node,
then collect every complete query under it and sort by count. Picked because
typeahead is a "starts with" problem and a Trie answers that directly.

### Primary store (src/store.js)
The source of truth for counts. It holds a Map of query to count and a Trie for
suggestions. In a real system this would be a database; for a local demo it is
in memory, so counts are rebuilt from the dataset on restart.

### Distributed cache (src/cache.js)
There are four logical cache nodes. Each node is its own map with a time to live
(TTL) on every entry. The suggestion flow checks the cache first and only reads
the store on a miss. A short prefix can match many queries, so recomputing on
every keystroke would be wasteful; the cache stores the computed result so the
work happens once per prefix per TTL window.

### Consistent hashing (src/consistentHash.js)
Consistent hashing decides which cache node owns a prefix key. Each node is
placed at many points on a hash ring using virtual nodes (100 ring points per
node), which spreads keys evenly. To find the owner of a key we hash the key and
take the next node clockwise on the ring.

We hash with MD5 and take the first four bytes as a 32 bit number. A weaker hash
was tried first, but because every node name shares the prefix "cache-node-",
the virtual node points clustered together and almost every key landed on one
node. MD5 spreads the points uniformly, so the keys distribute across all nodes.

Two properties matter here. First, the same prefix always maps to the same node,
so the cache for a prefix is consistent. Second, adding or removing a node only
moves the keys near that point on the ring, not all of them. A plain
hash(key) modulo node-count would remap almost every key when the node set
changes, which would waste the whole cache.

`GET /cache/debug?prefix=<prefix>` shows this routing: the owner node for a
prefix and whether it is currently cached.

### Trending and recency aware ranking (src/trending.js)
The system supports two ranking modes, used by both `/trending` and the `ranking`
parameter on `/suggest`. Basic ranking sorts by the all time stored count.
Recency aware ranking blends recent activity with the all time count. The five
points the assignment asks to explain:

1. How recent searches are tracked. The trending module keeps a recency score
   and a last update time for each query. When a search is submitted, the score
   is decayed to the current time and then increased by one. This happens at
   submission time, so trending reacts immediately, before the batch flush.

2. How recent activity affects ranking. The final score is
   `recency * 10 + log10(count + 1)`. The recency part is weighted heavily, while
   the all time count adds a smaller boost through a log. So a query that is
   being searched a lot right now ranks high even if its total count is small,
   while genuinely popular queries still hold a reasonable position.

3. How a query that was popular only for a short time is prevented from ranking
   high forever. The recency score uses exponential time decay with a five minute
   half life, meaning the score halves every five minutes with no new searches.
   A short burst raises the score briefly and then it fades on its own, so the
   query falls back to its all time position. The log(count) term keeps a one
   time spike from dominating permanently.

4. How the cache stays correct when rankings change. The recency ranking changes
   continuously, so it is not cached; it is computed live on each request and is
   always fresh. The basic ranking changes slowly, so it is cached. When a count
   changes through a batch flush, the affected prefixes are invalidated, and a
   short TTL bounds how stale any cached entry can be. Trending lists are computed
   on demand so they always reflect the latest scores.

5. Trade-offs. Computing recency live keeps it fresh but does a little more work
   per request than a cache hit. A shorter TTL and a faster decay give fresher
   results but cause more recomputation. Keeping a single decayed score per query
   is simple and cheap to maintain, but it does not model longer patterns such as
   daily or weekly cycles. The weights (ten for recency, a log for count) are a
   tunable heuristic.

To see the difference, search a niche query a few times, then switch suggestions
to recent ranking. The query climbs above more popular ones, and it drifts back
down once the searches stop and the score decays.

### Batch writer (src/batchWriter.js)
Writing to the store on every search would be one write per request. Instead each
search goes into a buffer. The buffer flushes when it reaches the configured size
(50) or when the flush timer fires (every 3 seconds), whichever comes first. On
flush, repeated queries are aggregated so the same query becomes a single write
instead of many, the counts are applied to the store, recency is already recorded
at submit time, and the cached prefixes for the affected queries are invalidated.

## Storage and caching summary

The store is the source of truth (Trie plus count map). The cache is read
through: it is filled from the store on a miss and can be cleared at any time
without losing data. Cache entries expire by TTL on their own, and they are
invalidated directly when a write changes the underlying counts, so stale
suggestions do not remain.

## Design decisions and trade-offs

- A Trie gives prefix matches without scanning the whole dataset. The result is
  cached on a miss, so a short prefix that matches many queries is only computed
  once per TTL window.
- The cache nodes are in memory rather than Redis. This keeps the project easy to
  run locally with no external service, which the assignment asks for. The design
  is storage agnostic: the consistent hashing ring routes a prefix to its owner
  node whether that node is a map or a Redis client, so moving to Redis would
  change the node storage, not the routing.
- Consistent hashing with virtual nodes keeps the key spread even and limits how
  many keys move when the node set changes, at the cost of a little memory for the
  ring.
- TTL plus targeted invalidation keeps cached suggestions consistent with the
  store after writes without heavy bookkeeping.
- Recency uses a single decayed score per query. It is cheap and easy to explain,
  and the decay stops brief spikes from sticking at the top.
- Batching trades a small bounded risk of losing buffered searches for a large
  drop in write pressure.

## Failure handling

Buffered searches live in memory until the next flush. On a clean shutdown
(Ctrl+C or SIGTERM) the server flushes the buffer before exiting, so a normal
stop loses nothing. If the process crashes hard between flushes, at most one
buffer of searches is lost, which is acceptable for popularity counts. For
stronger durability the buffer could be backed by a write ahead log or a
persistent queue, which would trade some latency for no loss.

## Performance report

Reproduce with `npm run benchmark` while the server is running, or with the
`/stats` endpoint after using the UI. The benchmark sends 1000 searches and 2000
suggest requests with a skewed traffic pattern (a few prefixes are very common).

Sample numbers from a local run:

- Cache hit rate: about 0.96. Out of 2000 suggest requests only about 80 reached
  the store; the cache absorbed the rest.
- Latency: a cache hit is well under a millisecond on the server side. The client
  side p95 is a few milliseconds and includes HTTP overhead.
- Write reduction: 1000 searches became about 340 writes (around 0.66 fewer
  writes) because repeated queries are aggregated per flush.
- Cache distribution: keys spread across all four nodes, which the consistent
  hashing ring controls.

These confirm the two main goals: the cache makes suggestions fast and absorbs
most reads, and batching reduces writes to the store.

## Limitations and future work

- The store is in memory, so counts are rebuilt from the dataset on restart. A
  real deployment would back it with a database.
- The cache nodes are in memory logical nodes. The same ring code would route to
  Redis instances by changing each node from a map to a Redis client.
- Trending uses a single decayed score and does not model longer cycles such as
  daily or weekly patterns.
- Durability of buffered writes could be added with a write ahead log.

class Trending {
  constructor(options = {}) {
    const halfLifeMs = options.halfLifeMs || 5 * 60 * 1000;
    this.halfLifeMs = halfLifeMs;
    this.lambda = Math.LN2 / halfLifeMs;
    this.recent = new Map();
  }

  record(query, ts = Date.now()) {
    const entry = this.recent.get(query);
    if (!entry) {
      this.recent.set(query, { score: 1, lastTs: ts });
      return;
    }
    const dt = ts - entry.lastTs;
    const decayed = entry.score * Math.exp(-this.lambda * dt);
    entry.score = decayed + 1;
    entry.lastTs = ts;
  }

  currentScore(entry, now) {
    const dt = now - entry.lastTs;
    return entry.score * Math.exp(-this.lambda * dt);
  }

  scoreQuery(query, now = Date.now()) {
    const entry = this.recent.get(query);
    if (!entry) return 0;
    return this.currentScore(entry, now);
  }

  recentQueries() {
    return [...this.recent.keys()];
  }

  basic(store, limit = 10) {
    return [...store.counts.entries()]
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  enhanced(store, limit = 10, now = Date.now()) {
    const out = [];
    for (const [query, entry] of this.recent) {
      const recency = this.currentScore(entry, now);
      const total = store.getCount(query);
      const score = recency * 10 + Math.log10(total + 1);
      out.push({
        query,
        recencyScore: Number(recency.toFixed(3)),
        totalCount: total,
        score: Number(score.toFixed(3)),
      });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }
}

module.exports = { Trending };

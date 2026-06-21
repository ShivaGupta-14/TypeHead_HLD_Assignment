const { Trie } = require("./trie");

class Store {
  constructor() {
    this.counts = new Map();
    this.trie = new Trie();
    this.reads = 0;
    this.writes = 0;
  }

  load(entries) {
    for (const { query, count } of entries) {
      this.counts.set(query, count);
      this.trie.insert(query, count);
    }
  }

  applyBatch(aggregated) {
    for (const [query, delta] of aggregated) {
      const current = this.counts.get(query) || 0;
      this.counts.set(query, current + delta);
      this.trie.addCount(query, delta);
      this.writes++;
    }
  }

  suggest(prefix, limit) {
    this.reads++;
    return this.trie.suggest(prefix, limit);
  }

  getCount(query) {
    return this.counts.get(query) || 0;
  }

  stats() {
    return {
      distinctQueries: this.counts.size,
      reads: this.reads,
      writes: this.writes,
    };
  }
}

module.exports = { Store };

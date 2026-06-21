class BatchWriter {
  constructor(options) {
    this.store = options.store;
    this.cache = options.cache;
    this.trending = options.trending;
    this.flushIntervalMs = options.flushIntervalMs || 3000;
    this.maxBatchSize = options.maxBatchSize || 100;

    this.buffer = [];
    this.totalSubmitted = 0;
    this.totalFlushes = 0;
    this.totalWrites = 0;
    this.lastFlush = null;

    this.timer = setInterval(() => this.flush("interval"), this.flushIntervalMs);
  }

  submit(query) {
    this.totalSubmitted++;
    this.buffer.push(query);
    this.trending.record(query);
    if (this.buffer.length >= this.maxBatchSize) this.flush("size");
  }

  flush(reason = "manual") {
    if (this.buffer.length === 0) return { flushed: 0, reason };

    const aggregated = new Map();
    for (const q of this.buffer) {
      aggregated.set(q, (aggregated.get(q) || 0) + 1);
    }

    const batchSize = this.buffer.length;
    this.buffer = [];

    this.store.applyBatch(aggregated);

    for (const query of aggregated.keys()) {
      for (let i = 1; i <= query.length; i++) {
        this.cache.invalidate(query.slice(0, i));
      }
    }

    this.totalFlushes++;
    this.totalWrites += aggregated.size;
    this.lastFlush = { flushed: batchSize, uniqueQueries: aggregated.size, reason };
    return this.lastFlush;
  }

  stats() {
    const reduction = this.totalSubmitted
      ? Number((1 - this.totalWrites / this.totalSubmitted).toFixed(3))
      : 0;
    return {
      buffered: this.buffer.length,
      maxBatchSize: this.maxBatchSize,
      flushIntervalMs: this.flushIntervalMs,
      totalSubmitted: this.totalSubmitted,
      totalFlushes: this.totalFlushes,
      totalWrites: this.totalWrites,
      writeReduction: reduction,
      lastFlush: this.lastFlush,
    };
  }

  stop() {
    clearInterval(this.timer);
    this.flush("shutdown");
  }
}

module.exports = { BatchWriter };

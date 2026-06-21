const { ConsistentHash } = require("./consistentHash");

class CacheNode {
  constructor(name, ttlMs) {
    this.name = name;
    this.ttlMs = ttlMs;
    this.map = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      this.misses++;
      return null;
    }
    this.hits++;
    return entry.value;
  }

  set(key, value) {
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  invalidate(key) {
    this.map.delete(key);
  }

  stats() {
    const total = this.hits + this.misses;
    return {
      name: this.name,
      size: this.map.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total ? Number((this.hits / total).toFixed(3)) : 0,
    };
  }
}

class DistributedCache {
  constructor(nodeNames, ttlMs = 30000) {
    this.ttlMs = ttlMs;
    this.nodes = new Map();
    for (const name of nodeNames) this.nodes.set(name, new CacheNode(name, ttlMs));
    this.ring = new ConsistentHash(nodeNames);
  }

  nodeFor(prefix) {
    const name = this.ring.getNode(prefix);
    return this.nodes.get(name);
  }

  get(prefix) {
    return this.nodeFor(prefix).get(prefix);
  }

  set(prefix, value) {
    this.nodeFor(prefix).set(prefix, value);
  }

  invalidate(prefix) {
    this.nodeFor(prefix).invalidate(prefix);
  }

  debug(prefix) {
    const node = this.nodeFor(prefix);
    const entry = node.map.get(prefix);
    const hit = !!(entry && Date.now() <= entry.expiresAt);
    return {
      prefix,
      ownerNode: node.name,
      hit,
      cachedSuggestions: hit ? entry.value : null,
      allNodes: [...this.nodes.keys()],
    };
  }

  stats() {
    return [...this.nodes.values()].map((n) => n.stats());
  }
}

module.exports = { CacheNode, DistributedCache };

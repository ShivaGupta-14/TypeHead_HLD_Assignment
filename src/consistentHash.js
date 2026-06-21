const crypto = require("crypto");

class ConsistentHash {
  constructor(nodes = [], virtualReplicas = 100) {
    this.virtualReplicas = virtualReplicas;
    this.ring = [];
    this.nodes = new Set();
    for (const n of nodes) this.addNode(n);
  }

  hash(str) {
    return crypto.createHash("md5").update(str).digest().readUInt32BE(0);
  }

  addNode(node) {
    if (this.nodes.has(node)) return;
    this.nodes.add(node);
    for (let i = 0; i < this.virtualReplicas; i++) {
      this.ring.push({ hash: this.hash(node + "#" + i), node });
    }
    this.ring.sort((a, b) => a.hash - b.hash);
  }

  removeNode(node) {
    this.nodes.delete(node);
    this.ring = this.ring.filter((e) => e.node !== node);
  }

  getNode(key) {
    if (this.ring.length === 0) return null;
    const h = this.hash(key);

    if (h > this.ring[this.ring.length - 1].hash) return this.ring[0].node;

    let lo = 0;
    let hi = this.ring.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.ring[mid].hash >= h) {
        ans = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return this.ring[ans].node;
  }
}

module.exports = { ConsistentHash };

class TrieNode {
  constructor() {
    this.children = new Map();
    this.isWord = false;
    this.query = null;
    this.count = 0;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
    this.size = 0;
  }

  insert(query, count = 0) {
    let node = this.root;
    for (const ch of query) {
      if (!node.children.has(ch)) node.children.set(ch, new TrieNode());
      node = node.children.get(ch);
    }
    if (!node.isWord) this.size++;
    node.isWord = true;
    node.query = query;
    node.count = count;
  }

  addCount(query, delta) {
    let node = this.root;
    for (const ch of query) {
      if (!node.children.has(ch)) node.children.set(ch, new TrieNode());
      node = node.children.get(ch);
    }
    if (!node.isWord) {
      this.size++;
      node.isWord = true;
      node.query = query;
    }
    node.count += delta;
    return node.count;
  }

  findNode(prefix) {
    let node = this.root;
    for (const ch of prefix) {
      if (!node.children.has(ch)) return null;
      node = node.children.get(ch);
    }
    return node;
  }

  suggest(prefix, limit = 10) {
    const start = this.findNode(prefix);
    if (!start) return [];

    const results = [];
    const stack = [start];
    while (stack.length) {
      const node = stack.pop();
      if (node.isWord) results.push({ query: node.query, count: node.count });
      for (const child of node.children.values()) stack.push(child);
    }

    results.sort((a, b) => b.count - a.count);
    return results.slice(0, limit);
  }
}

module.exports = { Trie, TrieNode };

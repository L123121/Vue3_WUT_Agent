"use strict";

const fs = require('fs');
const path = require('path');

/**
 * 文件持久化内存存储 — 替代 Redis
 *
 * 所有数据存内存，同时自动写入 JSON 文件，重启后恢复。
 * 数据文件路径：backend/data/store.json
 */

const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

// ========== 通用内存 key-value 存储（替代 ioredis 命令） ==========

class MemoryStore {
  constructor() {
    this._data = new Map();   // hash / list / string 数据
    this._sets = new Map();   // set 数据
    this._saveTimer = null;
    this._dirty = false;

    // 启动时从文件恢复
    this._load();
  }

  // ==================== 持久化 ====================

  _load() {
    try {
      if (!fs.existsSync(DATA_FILE)) return;
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const json = JSON.parse(raw);
      if (json._data) {
        this._data = new Map(Object.entries(json._data));
      }
      if (json._sets) {
        this._sets = new Map(
          Object.entries(json._sets).map(([k, v]) => [k, new Set(v)])
        );
      }
      console.log(`[Store] 从 ${DATA_FILE} 恢复了数据`);
    } catch (e) {
      console.warn('[Store] 数据文件读取失败（首次运行可忽略）:', e.message);
    }
  }

  _scheduleSave() {
    this._dirty = true;
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      try {
        if (!this._dirty) return;
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        const json = JSON.stringify({
          _data: Object.fromEntries(this._data),
          _sets: Object.fromEntries(
            [...this._sets].map(([k, v]) => [k, [...v]])
          ),
        });
        fs.writeFileSync(DATA_FILE, json, 'utf-8');
        this._dirty = false;
      } catch (e) {
        console.error('[Store] 持久化写入失败:', e.message);
      }
      this._saveTimer = null;
    }, 200);
  }

  // ==================== Pipeline ====================

  pipeline() {
    const ops = [];
    const exec = async () => {
      const results = [];
      for (const [cmd, args] of ops) {
        try {
          const val = await this[cmd](...args);
          results.push([null, val]);
        } catch (e) {
          results.push([e, null]);
        }
      }
      return results;
    };
    return {
      sadd: (k, v) => ops.push(['sadd', [k, v]]),
      srem: (k, v) => ops.push(['srem', [k, v]]),
      smembers: (k) => ops.push(['smembers', [k]]),
      scard: (k) => ops.push(['scard', [k]]),
      hset: (k, ...args) => ops.push(['hset', [k, ...args]]),
      hgetall: (k) => ops.push(['hgetall', [k]]),
      hget: (k, f) => ops.push(['hget', [k, f]]),
      rpush: (k, v) => ops.push(['rpush', [k, v]]),
      lrange: (k, start, end) => ops.push(['lrange', [k, start, end]]),
      llen: (k) => ops.push(['llen', [k]]),
      ltrim: (k, start, end) => ops.push(['ltrim', [k, start, end]]),
      del: (k) => ops.push(['del', [k]]),
      expire: () => { /* no-op */ },
      exec,
    };
  }

  // ==================== Set 操作 ====================

  async sadd(key, value) {
    if (!this._sets.has(key)) this._sets.set(key, new Set());
    this._sets.get(key).add(value);
    this._scheduleSave();
    return 1;
  }

  async srem(key, value) {
    const set = this._sets.get(key);
    if (!set) return 0;
    set.delete(value);
    this._scheduleSave();
    return 1;
  }

  async smembers(key) {
    const set = this._sets.get(key);
    return set ? [...set] : [];
  }

  async scard(key) {
    const set = this._sets.get(key);
    return set ? set.size : 0;
  }

  async sismember(key, value) {
    const set = this._sets.get(key);
    return set ? set.has(value) : false;
  }

  // ==================== Hash 操作 ====================

  async hset(key, ...args) {
    if (!this._data.has(key)) this._data.set(key, {});
    const obj = this._data.get(key);
    if (args.length === 1 && typeof args[0] === 'object') {
      Object.assign(obj, args[0]);
    } else {
      for (let i = 0; i < args.length; i += 2) {
        obj[args[i]] = args[i + 1];
      }
    }
    this._scheduleSave();
    return args.length / 2;
  }

  async hgetall(key) {
    return this._data.get(key) || null;
  }

  async hget(key, field) {
    const obj = this._data.get(key);
    return obj ? obj[field] : null;
  }

  // ==================== List 操作 ====================

  async rpush(key, value) {
    if (!this._data.has(key)) this._data.set(key, []);
    this._data.get(key).push(value);
    this._scheduleSave();
    return 1;
  }

  async lrange(key, start, end) {
    const list = this._data.get(key) || [];
    if (end === -1) return list.slice(start);
    return list.slice(start, end + 1);
  }

  async llen(key) {
    const list = this._data.get(key);
    return list ? list.length : 0;
  }

  async ltrim(key, start, end) {
    const list = this._data.get(key);
    if (!list) return;
    this._data.set(key, end === -1 ? list.slice(start) : list.slice(start, end + 1));
    this._scheduleSave();
  }

  // ==================== Key 操作 ====================

  async del(key) {
    this._data.delete(key);
    this._sets.delete(key);
    this._scheduleSave();
    return 1;
  }

  // ==================== 其他 ====================

  async expire() { /* no-op, 内存模式 TTL 无意义 */ }

  // ==================== 状态 ====================

  get status() { return 'ready'; }
}

const redis = new MemoryStore();

module.exports = { redis };

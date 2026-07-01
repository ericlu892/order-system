/**
 * better-sqlite3 兼容层 —— 用 sql.js 模拟 better-sqlite3 的同步接口
 * 这样服务端代码不需要改任何 prepare/run/get/all 调用
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let SQL = null;
const dbCache = new Map();

class Statement {
  constructor(db, sql, parent) {
    this.db = db;
    this.sql = sql;
    this._stmt = null;
    this._parent = parent;
  }
  _ensure() {
    if (!this._stmt) {
      try { this._stmt = this.db.prepare(this.sql); } catch(e) { throw new Error(e.message); }
    }
    return this._stmt;
  }
  _isWrite(sql) {
    const s = sql.trim().toUpperCase();
    return s.startsWith('INSERT') || s.startsWith('UPDATE') || s.startsWith('DELETE') || s.startsWith('CREATE') || s.startsWith('DROP') || s.startsWith('ALTER') || s.startsWith('REPLACE');
  }
  run(...params) {
    const stmt = this._ensure();
    stmt.bind(params);
    stmt.step();
    stmt.reset();
    if (this._parent && this._isWrite(this.sql)) this._parent.save();
    return { changes: this.db.getRowsModified() };
  }
  get(...params) {
    const stmt = this._ensure();
    stmt.bind(params);
    if (stmt.step()) {
      const cols = stmt.getColumnNames();
      const vals = stmt.get();
      stmt.reset();
      const row = {};
      cols.forEach((c, i) => { row[c] = vals[i]; });
      return row;
    }
    stmt.reset();
    return undefined;
  }
  all(...params) {
    const stmt = this._ensure();
    stmt.bind(params);
    const rows = [];
    const cols = stmt.getColumnNames();
    while (stmt.step()) {
      const vals = stmt.get();
      const row = {};
      cols.forEach((c, i) => { row[c] = vals[i]; });
      rows.push(row);
    }
    stmt.reset();
    return rows;
  }
  finalize() {
    if (this._stmt) { this._stmt.free(); this._stmt = null; }
  }
}

class Database {
  constructor(filename, options) {
    this.filename = filename;
    this._db = null;
    this._statements = [];
  }
  async _init() {
    if (!SQL) SQL = await initSqlJs();
    if (this.filename && fs.existsSync(this.filename)) {
      const buf = fs.readFileSync(this.filename);
      this._db = new SQL.Database(buf);
    } else {
      this._db = new SQL.Database();
    }
    // Enable WAL-like behavior: run each statement immediately
    this._db.exec('PRAGMA journal_mode=MEMORY');
  }
  prepare(sql) {
    const stmt = new Statement(this._db, sql, this);
    this._statements.push(stmt);
    return stmt;
  }
  exec(sql) {
    this._db.exec(sql);
    this.save();
  }
  close() {
    if (this._db) {
      this._db.free();
      this._db = null;
    }
  }
  // Save to file (called manually after writes)
  save() {
    if (this.filename && this._db) {
      const data = this._db.export();
      fs.mkdirSync(path.dirname(this.filename), { recursive: true });
      fs.writeFileSync(this.filename, Buffer.from(data));
    }
  }
}

// Factory function: returns a Database instance (must await init)
async function createDatabase(filename) {
  const db = new Database(filename);
  await db._init();
  return db;
}

module.exports = { Database, createDatabase };

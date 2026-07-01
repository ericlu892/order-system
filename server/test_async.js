process.stdout.write('Starting...\n');
const { createDatabase } = require('./sqlite_compat');
const path = require('path');
const fs = require('fs');
const DB_PATH = path.join(__dirname, '..', 'data', 'order_system.db');

async function test() {
  process.stdout.write('1. createDatabase...\n');
  const db = await createDatabase(DB_PATH);
  process.stdout.write('2. pragma...\n');
  db._db.exec('PRAGMA foreign_keys = ON');
  process.stdout.write('3. check users...\n');
  const users = db.prepare('SELECT count(*) as cnt FROM users').all();
  process.stdout.write('4. users count: ' + users[0].cnt + '\n');
  process.stdout.write('DONE\n');
}
test().catch(e => { process.stderr.write('FAIL: ' + e.message + '\n' + e.stack + '\n'); });

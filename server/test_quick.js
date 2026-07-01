// 快速启动测试 - 看完整 server_new.js 哪里出错
const { createDatabase } = require('./sqlite_compat');
const path = require('path');
const DB_PATH = path.join(__dirname, '..', 'data', 'order_system.db');
process.env.PORT = '8766';

async function main() {
  console.log('1. Creating DB...');
  const db = await createDatabase(DB_PATH);
  console.log('2. DB created, setting pragma...');
  db._db.exec('PRAGMA foreign_keys = ON');
  
  console.log('3. Testing query...');
  const users = db.prepare('SELECT id,username FROM users LIMIT 3').all();
  console.log('   Users:', JSON.stringify(users));
  
  console.log('4. Testing prepare insert...');
  const r = db.prepare("SELECT 1 as ok").get();
  console.log('   Result:', r);
  
  console.log('5. OK - ready to initApp');
}
main().catch(e => { console.error('FAIL:', e.message, e.stack); process.exit(1); });

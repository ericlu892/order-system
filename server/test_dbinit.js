const { createDatabase } = require('./sqlite_compat');
const path = require('path');
(async () => {
  console.log('Starting DB init...');
  const db = await createDatabase(path.join(__dirname, '..', 'data', 'order_system.db'));
  console.log('DB ready, tables:', db._db.exec("SELECT name FROM sqlite_master WHERE type='table'"));
  console.log('SUCCESS');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });

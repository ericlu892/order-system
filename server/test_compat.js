const { createDatabase } = require('./sqlite_compat');
const path = require('path');
const fs = require('fs');

(async () => {
  try {
    const db = await createDatabase(path.join(__dirname, 'test_compat.db'));
    db.exec('CREATE TABLE IF NOT EXISTS t (a TEXT)');
    db.prepare('INSERT INTO t VALUES (?)').run('hello');
    console.log('Inserted:', db.prepare('SELECT * FROM t').all());
    db.close();
    console.log('SQL.JS COMPAT WORKS!');
  } catch(e) {
    console.error('FAIL:', e.message);
    console.error(e.stack);
  }
})();

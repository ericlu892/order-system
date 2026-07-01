const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = new Database(path.join(__dirname, '..', 'order_system.db'));
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('=== Tables ===');
tables.forEach(t => console.log('  ' + t.name));
const users = db.prepare('SELECT id,username,password FROM users').all();
console.log('\n=== Users (' + users.length + ') ===');
users.forEach(u => {
  const ok = bcrypt.compareSync('admin123', u.password);
  console.log('  ' + u.username + ' | match_admin123=' + ok + ' | hash=' + u.password.substring(0, 25) + '...');
});
db.close();

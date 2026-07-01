const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'order_system.db'));
const users = db.prepare('SELECT id,username,password FROM users').all();
console.log('=== Users ===');
users.forEach(u => {
  const valid = bcrypt.compareSync('admin123', u.password);
  console.log(`  ${u.username}: hash=${u.password.substring(0,20)}... match_admin123=${valid}`);
});
// Also check roles
const roles = db.prepare('SELECT * FROM roles').all();
console.log('\n=== Roles ===');
roles.forEach(r => console.log(`  ${r.id}: ${r.name} (${r.code})`));
db.close();

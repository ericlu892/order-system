const { createDatabase } = require('./sqlite_compat');
const bcrypt = require('bcryptjs');
const path = require('path');

(async () => {
  const db = await createDatabase(path.join(__dirname, '..', 'data', 'order_system.db'));
  const u = db.prepare("SELECT username,password FROM users WHERE username='admin'").get();
  console.log('User:', JSON.stringify(u));
  if (u) {
    console.log('typeof password:', typeof u.password);
    console.log('password length:', u.password.length);
    console.log('password starts with:', u.password.substring(0, 15));
    console.log('match admin123:', bcrypt.compareSync('admin123', u.password));
  }
  db.close();
})();

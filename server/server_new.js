// ═══════════════════════════════════════════
//  金石立美订单管理系统 v2.0（云端版+6状态流转）
//  draft→pending→assigned→designed→received→delivered
// ═══════════════════════════════════════════
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Database = require('./sqlite_compat').Database;
const { createDatabase } = require('./sqlite_compat');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 8765;
const JWT_SECRET = process.env.JWT_SECRET || 'jinshi-order-system-2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const DB_PATH = path.join(__dirname, '..', 'data', 'order_system.db');
const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const UPLOAD_DIR = path.join(DB_DIR, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 50 * 1024 * 1024 } });

let db;

const fs2 = require('fs');
const logFile = path.join(__dirname, '..', 'server_debug.log');
function log(msg) { fs2.appendFileSync(logFile, new Date().toISOString() + ' ' + msg + '\n'); }

async function initDb() {
  try {
    log('[initDb] creating database...');
    db = await createDatabase(DB_PATH);
    log('[initDb] setting pragma...');
    db._db.exec('PRAGMA foreign_keys = ON');
    log('[initDb] calling initApp...');
    await initApp();
    log('[initDb] initApp completed successfully');
  } catch(e) {
    log('[initDb] FAILED: ' + e.message);
    log(e.stack);
    process.exit(1);
  }
}

initDb().catch(e => { console.error('initDb FAILED:', e); process.exit(1); });

async function initApp() {

// ── 权限定义 ──
const ALL_PERMISSIONS = {
  'dashboard': { name: '仪表板', group: '首页' },
  'hospitals:view': { name: '查看医院', group: '医院管理' },
  'hospitals:create': { name: '新增医院', group: '医院管理' },
  'hospitals:edit': { name: '编辑医院', group: '医院管理' },
  'hospitals:delete': { name: '删除医院', group: '医院管理' },
  'hospitals:dept': { name: '管理科室', group: '医院管理' },
  'hospitals:doctor': { name: '管理医生', group: '医院管理' },
  'hospitals:tech': { name: '指派技术团队', group: '医院管理' },
  'orders:view': { name: '查看订单', group: '订单管理' },
  'orders:create': { name: '新建订单', group: '订单管理' },
  'orders:edit': { name: '编辑订单', group: '订单管理' },
  'orders:delete': { name: '删除订单', group: '订单管理' },
  'orders:submit': { name: '提交审核', group: '订单管理' },
  'orders:assign': { name: '指派工程师', group: '订单管理' },
  'orders:design': { name: '设计完成', group: '订单管理' },
  'orders:receive': { name: '确认收货', group: '订单管理' },
  'orders:deliver': { name: '确认交付', group: '订单管理' },
  'orders:cancel': { name: '取消订单', group: '订单管理' },
  'orders:export': { name: '导出订单', group: '订单管理' },
  'orders:upload': { name: '上传附件', group: '订单管理' },
  'stats:view': { name: '查看统计', group: '订单统计' },
  'agents:view': { name: '查看代理商', group: '代理商管理' },
  'agents:create': { name: '新增代理商', group: '代理商管理' },
  'agents:edit': { name: '编辑代理商', group: '代理商管理' },
  'agents:delete': { name: '删除代理商', group: '代理商管理' },
  'employees:view': { name: '查看人员', group: '人员管理' },
  'employees:create': { name: '新增人员', group: '人员管理' },
  'employees:edit': { name: '编辑人员', group: '人员管理' },
  'employees:delete': { name: '删除人员', group: '人员管理' },
  'users:view': { name: '查看用户', group: '用户管理' },
  'users:create': { name: '新增用户', group: '用户管理' },
  'users:edit': { name: '编辑用户', group: '用户管理' },
  'users:delete': { name: '删除用户', group: '用户管理' },
  'departments:view': { name: '查看部门', group: '部门管理' },
  'departments:create': { name: '新增部门', group: '部门管理' },
  'departments:edit': { name: '编辑部门', group: '部门管理' },
  'departments:delete': { name: '删除部门', group: '部门管理' },
  'roles:view': { name: '查看角色', group: '权限管理' },
  'roles:create': { name: '新增角色', group: '权限管理' },
  'roles:edit': { name: '编辑角色', group: '权限管理' },
  'roles:delete': { name: '删除角色', group: '权限管理' },
  'config:view': { name: '查看配置', group: '参数配置' },
  'config:edit': { name: '编辑配置', group: '参数配置' },
  'logs:view': { name: '查看日志', group: '操作日志' },
  'monitor:view': { name: '查看监控', group: '系统监控' },
};

const DEFAULT_ROLE_PERMS = {
  admin: Object.keys(ALL_PERMISSIONS),
  sales: ['dashboard','hospitals:view','orders:view','orders:create','orders:edit','orders:submit','orders:export','orders:upload','stats:view','agents:view'],
  finance: ['dashboard','orders:view','stats:view','agents:view','config:view'],
  engineer: ['dashboard','hospitals:view','orders:view','orders:design','orders:upload'],
  tech_leader: ['dashboard','hospitals:view','orders:view','orders:assign','orders:design','hospitals:tech'],
  ops_leader: ['dashboard','hospitals:view','orders:view','orders:receive','orders:deliver','orders:cancel','stats:view'],
};

// ── 数据库初始化 ──
function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (id TEXT PRIMARY KEY, name TEXT NOT NULL, leader TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT UNIQUE, created_at TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS role_permissions (role_id TEXT NOT NULL, permission TEXT NOT NULL, PRIMARY KEY(role_id, permission), FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, real_name TEXT, phone TEXT, email TEXT, department_id TEXT, role_id TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS hospitals (id TEXT PRIMARY KEY, name TEXT NOT NULL, short_name TEXT, province TEXT, city TEXT, district TEXT, address TEXT, level TEXT, type TEXT, contact_name TEXT, contact_phone TEXT, contact_email TEXT, remark TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS hospital_departments (id TEXT PRIMARY KEY, hospital_id TEXT NOT NULL, name TEXT NOT NULL, leader TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now','localtime')), FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS hospital_doctors (id TEXT PRIMARY KEY, hospital_id TEXT NOT NULL, department_id TEXT, name TEXT NOT NULL, title TEXT, specialty TEXT, phone TEXT, email TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now','localtime')), FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE);
    -- 技术团队已合并到 employees.hospital_ids + employees.user_id 中管理
    -- 旧表 hospital_tech_leaders / hospital_engineers 在数据迁移后删除
    CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, name TEXT NOT NULL, company TEXT, province TEXT, city TEXT, contact_name TEXT, contact_phone TEXT, contact_email TEXT, commission_rate REAL DEFAULT 0, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, order_no TEXT UNIQUE NOT NULL, hospital_id TEXT NOT NULL, department_id TEXT, agent_id TEXT, order_type TEXT, patient_name TEXT, body_part TEXT, quantity INTEGER DEFAULT 1, unit_price REAL DEFAULT 0, total_price REAL DEFAULT 0, status TEXT DEFAULT 'draft', urgency TEXT DEFAULT 'normal', delivery_date TEXT, salesperson_id TEXT, engineer_id TEXT, design_note TEXT, delivery_note TEXT, remark TEXT, cancel_reason TEXT, cancelled_by TEXT, cancelled_at TEXT, created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')), FOREIGN KEY (hospital_id) REFERENCES hospitals(id), FOREIGN KEY (department_id) REFERENCES hospital_departments(id), FOREIGN KEY (agent_id) REFERENCES agents(id));
    CREATE TABLE IF NOT EXISTS order_attachments (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, file_name TEXT NOT NULL, file_path TEXT NOT NULL, file_type TEXT, file_size INTEGER, category TEXT DEFAULT 'technical', created_at TEXT DEFAULT (datetime('now','localtime')), FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS order_status_logs (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL, operator_id TEXT, operator_name TEXT, note TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, content TEXT, type TEXT, order_id TEXT, is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS operation_logs (id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL, module TEXT, detail TEXT, ip TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS system_config (id TEXT PRIMARY KEY, key TEXT UNIQUE NOT NULL, value TEXT, updated_at TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS employees (id TEXT PRIMARY KEY, name TEXT NOT NULL, department_id TEXT, position TEXT, phone TEXT, email TEXT, hospital_ids TEXT DEFAULT '[]', is_headquarter INTEGER DEFAULT 0, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now','localtime')));
  `);
  // 兼容旧表新字段
  try { db.exec("ALTER TABLE employees ADD COLUMN hospital_ids TEXT DEFAULT '[]'"); } catch(e) {}
  try { db.exec("ALTER TABLE employees ADD COLUMN is_headquarter INTEGER DEFAULT 0"); } catch(e) {}
  try { db.exec("ALTER TABLE employees ADD COLUMN user_id TEXT"); } catch(e) {}
  try { db.exec("ALTER TABLE orders ADD COLUMN engineer_id TEXT"); } catch(e) {}
  try { db.exec("ALTER TABLE orders ADD COLUMN design_note TEXT"); } catch(e) {}
  try { db.exec("ALTER TABLE orders ADD COLUMN delivery_note TEXT"); } catch(e) {}
  try { db.exec("ALTER TABLE orders ADD COLUMN cancelled_by TEXT"); } catch(e) {}
  try { db.exec("ALTER TABLE orders ADD COLUMN cancelled_at TEXT"); } catch(e) {}
  try { db.exec("ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT (datetime('now','localtime'))"); } catch(e) {}
}

// ── 初始化种子 ──
function seed() {
  const adminRole = db.prepare("SELECT id FROM roles WHERE code='admin'").get();
  if (!adminRole) {
    const aId = uuidv4();
    db.prepare("INSERT INTO roles (id,name,code) VALUES (?,?,?)").run(aId, '管理员', 'admin');
    Object.keys(ALL_PERMISSIONS).forEach(p => db.prepare("INSERT INTO role_permissions VALUES (?,?)").run(aId, p));
    const sId = uuidv4(); db.prepare("INSERT INTO roles (id,name,code) VALUES (?,?,?)").run(sId, '销售', 'sales');
    DEFAULT_ROLE_PERMS.sales.forEach(p => db.prepare("INSERT INTO role_permissions VALUES (?,?)").run(sId, p));
    const fId = uuidv4(); db.prepare("INSERT INTO roles (id,name,code) VALUES (?,?,?)").run(fId, '财务', 'finance');
    DEFAULT_ROLE_PERMS.finance.forEach(p => db.prepare("INSERT INTO role_permissions VALUES (?,?)").run(fId, p));
    const eId = uuidv4(); db.prepare("INSERT INTO roles (id,name,code) VALUES (?,?,?)").run(eId, '设计工程师', 'engineer');
    DEFAULT_ROLE_PERMS.engineer.forEach(p => db.prepare("INSERT INTO role_permissions VALUES (?,?)").run(eId, p));
    const tlId = uuidv4(); db.prepare("INSERT INTO roles (id,name,code) VALUES (?,?,?)").run(tlId, '技术主管', 'tech_leader');
    DEFAULT_ROLE_PERMS.tech_leader.forEach(p => db.prepare("INSERT INTO role_permissions VALUES (?,?)").run(tlId, p));
    const opId = uuidv4(); db.prepare("INSERT INTO roles (id,name,code) VALUES (?,?,?)").run(opId, '运营主管', 'ops_leader');
    DEFAULT_ROLE_PERMS.ops_leader.forEach(p => db.prepare("INSERT INTO role_permissions VALUES (?,?)").run(opId, p));
  }
  const adminUser = db.prepare("SELECT id FROM users WHERE username='admin'").get();
  if (!adminUser) {
    const pwd = bcrypt.hashSync('admin123', 10);
    db.prepare("INSERT INTO users (id,username,password,real_name,status,role_id) VALUES (?,?,?,?,'active',(SELECT id FROM roles WHERE code='admin'))").run(uuidv4(),'admin',pwd,'系统管理员');
  }
  // 种子部门
  if (!db.prepare("SELECT id FROM departments LIMIT 1").get()) {
    ['市场部','技术部','运营部','财务部','内勤部'].forEach(n => db.prepare("INSERT INTO departments (id,name) VALUES (?,?)").run(uuidv4(), n));
  }
}
  initDB(); seed();
// ── 数据迁移：employees.user_id 反向填充 + 删除旧关联表 ──
function migrateV2() {
  try {
    const mig = db.prepare("SELECT value FROM system_config WHERE key='db_version'").get();
    if (mig && mig.value === 'v2.1') {
      // 已迁移，但检查角色权限是否需要补全
      const tlRole = db.prepare("SELECT id FROM roles WHERE code='tech_leader'").get();
      if (tlRole) {
        const hasDesign = db.prepare("SELECT 1 FROM role_permissions WHERE role_id=? AND permission='orders:design'").get(tlRole.id);
        if (!hasDesign) {
          db.prepare("INSERT INTO role_permissions (role_id,permission) VALUES (?,'orders:design')").run(tlRole.id);
          console.log('✅ 补全 tech_leader: orders:design 权限');
        }
      }
      return;
    }
  } catch(e) { return; }
  console.log('🏗 正在迁移数据库 v2.0→v2.1...');
  // 填充 user_id
  const emps = db.prepare("SELECT id, name FROM employees WHERE user_id IS NULL").all();
  emps.forEach(e => {
    const u = db.prepare("SELECT id FROM users WHERE real_name=? AND status='active' LIMIT 1").get(e.name);
    if (u) db.prepare("UPDATE employees SET user_id=? WHERE id=?").run(u.id, e.id);
  });
  // 删除旧关联表
  db.exec("DROP TABLE IF EXISTS hospital_tech_leaders");
  db.exec("DROP TABLE IF EXISTS hospital_engineers");
  // 角色权限补全
  const tlRole = db.prepare("SELECT id FROM roles WHERE code='tech_leader'").get();
  if (tlRole) {
    const hasDesign = db.prepare("SELECT 1 FROM role_permissions WHERE role_id=? AND permission='orders:design'").get(tlRole.id);
    if (!hasDesign) db.prepare("INSERT INTO role_permissions (role_id,permission) VALUES (?,'orders:design')").run(tlRole.id);
  }
  const migId = require('uuid').v4();
  db.prepare("INSERT OR REPLACE INTO system_config (id,key,value,updated_at) VALUES (?,?,?,datetime('now','localtime'))").run(migId, 'db_version', 'v2.1');
  console.log('✅ 数据迁移 v2.0→v2.1 完成（技术团队合并到 employees.hospital_ids）');
}
try { migrateV2(); } catch(e) { console.log('迁移跳过:', e.message); }

// ── 工具 ──
const U = () => uuidv4();
const T = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const now = T;
function logOp(action, module, detail, uid) { db.prepare("INSERT INTO operation_logs (id,user_id,action,module,detail) VALUES (?,?,?,?,?)").run(U(), uid, action, module, detail); }
function sendNotif(userId, title, content, type, orderId) { db.prepare("INSERT INTO notifications (id,user_id,title,content,type,order_id) VALUES (?,?,?,?,?,?)").run(U(), userId, title, content, type, orderId || null); }

// ── 数据迁移：employees.user_id 反向填充 + 删除旧关联表 ──
function migrateV2() {
  try {
    const mig = db.prepare("SELECT value FROM system_config WHERE key='db_version'").get();
    if (mig && mig.value === 'v2.1') {
      // 已迁移，检查角色权限补全
      const tlRole = db.prepare("SELECT id FROM roles WHERE code='tech_leader'").get();
      if (tlRole) {
        const hasDesign = db.prepare("SELECT 1 FROM role_permissions WHERE role_id=? AND permission='orders:design'").get(tlRole.id);
        if (!hasDesign) {
          db.prepare("INSERT INTO role_permissions (role_id,permission) VALUES (?,'orders:design')").run(tlRole.id);
          console.log('✅ 补全 tech_leader: orders:design 权限');
        }
      }
      return;
    }
  } catch(e) { return; }
  console.log('🏗 正在迁移数据库 v2.0→v2.1...');
  // 填充 user_id
  const emps = db.prepare("SELECT id, name FROM employees WHERE user_id IS NULL").all();
  emps.forEach(e => {
    const u = db.prepare("SELECT id FROM users WHERE real_name=? AND status='active' LIMIT 1").get(e.name);
    if (u) db.prepare("UPDATE employees SET user_id=? WHERE id=?").run(u.id, e.id);
  });
  // 删除旧关联表
  db.exec("DROP TABLE IF EXISTS hospital_tech_leaders");
  db.exec("DROP TABLE IF EXISTS hospital_engineers");
  // 角色权限补全
  const tlRole = db.prepare("SELECT id FROM roles WHERE code='tech_leader'").get();
  if (tlRole) {
    const hasDesign = db.prepare("SELECT 1 FROM role_permissions WHERE role_id=? AND permission='orders:design'").get(tlRole.id);
    if (!hasDesign) db.prepare("INSERT INTO role_permissions (role_id,permission) VALUES (?,'orders:design')").run(tlRole.id);
  }
  const migId = require('uuid').v4();
  db.prepare("INSERT OR REPLACE INTO system_config (id,key,value,updated_at) VALUES (?,?,?,datetime('now','localtime'))").run(migId, 'db_version', 'v2.1');
  console.log('✅ 数据迁移 v2.0→v2.1 完成');
}

// ── Auth ──
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare("SELECT u.*, r.code as role_code, r.name as role_name FROM users u LEFT JOIN roles r ON u.role_id=r.id WHERE u.username=? AND u.status='active'").get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: '用户名或密码错误' });
  const perms = user.role_id ? db.prepare("SELECT permission FROM role_permissions WHERE role_id=?").all(user.role_id).map(p => p.permission) : [];
  const token = jwt.sign({ id: user.id, username: user.username, role_code: user.role_code }, JWT_SECRET, { expiresIn: '7d' });
  logOp('login', '认证', `登录系统`, user.id);
  res.json({ token, user: { id: user.id, username: user.username, real_name: user.real_name, role_code: user.role_code, role_name: user.role_name, department_id: user.department_id, phone: user.phone, email: user.email }, permissions: perms });
});

function auth(req, res, next) {
  const tok = req.headers.authorization?.replace('Bearer ', '');
  if (!tok) return res.status(401).json({ error: '请先登录' });
  try {
    const d = jwt.verify(tok, JWT_SECRET);
    req.user = { id: d.id, username: d.username, role_code: d.role_code };
    const perms = db.prepare("SELECT permission FROM role_permissions rp JOIN users u ON u.role_id=rp.role_id WHERE u.id=?").all(d.id).map(p => p.permission);
    req.user.permissions = req.user.role_code === 'admin' ? Object.keys(ALL_PERMISSIONS) : perms;
    next();
  } catch { res.status(401).json({ error: '登录已过期' }); }
}
function requirePerm(perm) { return (req, res, next) => req.user.permissions.includes(perm) ? next() : res.status(403).json({ error: '权限不足' }); }

// ── Dashboard ──
app.get('/api/dashboard', auth, (req, res) => {
  const orderCount = db.prepare("SELECT COUNT(*) as c FROM orders").get().c;
  const hospitalCount = db.prepare("SELECT COUNT(*) as c FROM hospitals WHERE status='active'").get().c;
  const todayOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE date(created_at)=date('now','localtime')").get().c;
  const deliveredOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status='delivered'").get().c;
  const pendingOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status IN ('pending','assigned')").get().c;
  const unreadNotifs = db.prepare("SELECT COUNT(*) as c FROM notifications WHERE user_id=? AND is_read=0").get(req.user.id).c;
  const recentOrders = db.prepare("SELECT o.order_no, o.order_type, o.patient_name, o.status, o.created_at, o.total_price, h.name as hospital_name FROM orders o LEFT JOIN hospitals h ON o.hospital_id=h.id ORDER BY o.created_at DESC LIMIT 8").all();
  const monthRevenue = db.prepare("SELECT COALESCE(SUM(COALESCE(total_price,0)),0) as rev FROM orders WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now','localtime') AND status NOT IN ('cancelled','draft')").get().rev;
  res.json({ orderCount, hospitalCount, todayOrders, deliveredOrders, pendingOrders, unreadNotifs, monthRevenue, recentOrders });
});

// ── 订单管理 ──
app.get('/api/orders', auth, requirePerm('orders:view'), (req, res) => {
  const { start_date, end_date, status, hospital_id, search, page = 1, pageSize = 20 } = req.query;
  let where = "1=1", params = [];
  if (start_date) { where += " AND date(o.created_at)>=?"; params.push(start_date); }
  if (end_date) { where += " AND date(o.created_at)<=?"; params.push(end_date); }
  if (status && status !== 'all') { where += " AND o.status=?"; params.push(status); }
  if (hospital_id) { where += " AND o.hospital_id=?"; params.push(hospital_id); }
  if (search) { where += " AND (o.order_no LIKE ? OR o.patient_name LIKE ?)"; params.push('%'+search+'%', '%'+search+'%'); }
  const sql = `SELECT o.*, h.name as hospital_name, h.province, d.name as department_name, a.name as agent_name FROM orders o LEFT JOIN hospitals h ON o.hospital_id=h.id LEFT JOIN hospital_departments d ON o.department_id=d.id LEFT JOIN agents a ON o.agent_id=a.id WHERE ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
  const total = db.prepare(`SELECT COUNT(*) as c FROM orders o WHERE ${where}`).get(...params).c;
  const items = db.prepare(sql).all(...params, parseInt(pageSize), (parseInt(page)-1)*parseInt(pageSize));
  res.json({ items, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

app.get('/api/orders/:id', auth, requirePerm('orders:view'), (req, res) => {
  const o = db.prepare("SELECT o.*, h.name as hospital_name, h.province, h.city, d.name as department_name, a.name as agent_name, u1.real_name as creator_name, u2.real_name as engineer_name FROM orders o LEFT JOIN hospitals h ON o.hospital_id=h.id LEFT JOIN hospital_departments d ON o.department_id=d.id LEFT JOIN agents a ON o.agent_id=a.id LEFT JOIN users u1 ON o.salesperson_id=u1.id LEFT JOIN users u2 ON o.engineer_id=u2.id WHERE o.id=?").get(req.params.id);
  if (!o) return res.status(404).json({ error: '订单不存在' });
  o.attachments = db.prepare("SELECT * FROM order_attachments WHERE order_id=?").all(req.params.id);
  o.logs = db.prepare("SELECT * FROM order_status_logs WHERE order_id=? ORDER BY created_at ASC").all(req.params.id);
  // 从 employees.hospital_ids 反向查询可指派人员
  o.available_assignees = db.prepare("SELECT u.id as user_id, u.real_name, u.username, CASE WHEN (SELECT r.code FROM users u2 JOIN roles r ON u2.role_id=r.id WHERE u2.id=u.id)='tech_leader' THEN 'tech_leader' ELSE 'engineer' END as assign_type FROM employees e JOIN users u ON e.user_id=u.id WHERE e.hospital_ids LIKE ? AND (SELECT r.code FROM users u2 JOIN roles r ON u2.role_id=r.id WHERE u2.id=u.id) IN ('engineer','tech_leader') ORDER BY assign_type, u.real_name").all('%"'+o.hospital_id+'"%');
  res.json(o);
});

app.post('/api/orders', auth, requirePerm('orders:create'), (req, res) => {
  const id = U();
  const { hospital_id, department_id, agent_id, order_type, patient_name, body_part, quantity, unit_price, total_price, urgency, delivery_date, remark } = req.body;
  if (!hospital_id) return res.status(400).json({ error: '请选择医院' });
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const maxNo = db.prepare("SELECT MAX(CAST(substr(order_no, 11) AS INTEGER)) as m FROM orders WHERE order_no LIKE ?").get('DD' + today + '%').m || 0;
  const seq = String(maxNo + 1).padStart(4, '0');
  const orderNo = 'DD' + today + seq;
  const qty = quantity ? parseInt(quantity) : 1;
  const uPrice = unit_price ? parseFloat(unit_price) : 0;
  const tPrice = total_price !== undefined ? parseFloat(total_price) : (qty * uPrice);
  db.prepare("INSERT INTO orders (id,order_no,hospital_id,department_id,agent_id,order_type,patient_name,body_part,quantity,unit_price,total_price,status,urgency,delivery_date,remark,salesperson_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, orderNo, hospital_id, department_id||null, agent_id||null, order_type, patient_name, body_part, qty, uPrice, tPrice, 'draft', urgency, delivery_date, remark, req.user.id);
  db.prepare("INSERT INTO order_status_logs (id,order_id,from_status,to_status,operator_id,operator_name,note) VALUES (?,?,?,?,?,?,?)").run(U(), id, null, 'draft', req.user.id, req.user.username, '创建订单');
  logOp('create', '订单管理', `创建订单: ${orderNo}`, req.user.id);
  res.status(201).json({ id, order_no: orderNo });
});

app.put('/api/orders/:id', auth, (req, res) => {
  const { department_id, agent_id, order_type, patient_name, body_part, quantity, unit_price, total_price, status, urgency, delivery_date, remark, cancel_reason, engineer_id, design_note, delivery_note } = req.body;
  const o = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!o) return res.status(404).json({ error: '订单不存在' });
  const tm = T();

  // 状态变更走6状态流转
  if (status && status !== o.status) {
    const TRANS = { draft: ['pending','cancelled'], pending: ['assigned', 'cancelled'], assigned: ['designed', 'cancelled'], designed: ['received', 'cancelled'], received: ['delivered', 'cancelled'], delivered: [], cancelled: [] };
    if (!(TRANS[o.status]||[]).includes(status)) return res.status(400).json({ error: `不能从 ${o.status} 直接转到 ${status}` });

    // 权限校验
    if (o.status==='draft'&&status==='pending' && !req.user.permissions.includes('orders:submit')) return res.status(403).json({ error: '无提交权限' });
    if (o.status==='pending'&&status==='assigned' && !req.user.permissions.includes('orders:assign')) return res.status(403).json({ error: '无指派权限' });
    if (o.status==='assigned'&&status==='designed' && !req.user.permissions.includes('orders:design')) return res.status(403).json({ error: '无设计权限' });
    if (o.status==='designed'&&status==='received' && !req.user.permissions.includes('orders:receive')) return res.status(403).json({ error: '无收货权限' });
    if (o.status==='received'&&status==='delivered' && !req.user.permissions.includes('orders:deliver')) return res.status(403).json({ error: '无交付权限' });
    if (status==='cancelled' && !req.user.permissions.includes('orders:cancel')) return res.status(403).json({ error: '无取消权限' });

    if (o.status==='pending'&&status==='assigned' && !engineer_id) return res.status(400).json({ error: '请选择工程师' });
    if (status==='cancelled' && !cancel_reason) return res.status(400).json({ error: '请填写取消原因' });

    let extra = '', note = '';
    if (o.status==='draft'&&status==='pending') note='提交审核';
    if (o.status==='pending'&&status==='assigned') { extra = ', engineer_id=?'; note = '指派工程师'; }
    if (o.status==='assigned'&&status==='designed') { extra = ', design_note=?'; note = design_note||'设计完成'; }
    if (o.status==='designed'&&status==='received') note='确认收货';
    if (o.status==='received'&&status==='delivered') { extra = ', delivery_note=?'; note = delivery_note||'确认交付'; }
    if (status==='cancelled') { extra = ', cancel_reason=?, cancelled_by=?, cancelled_at=?'; note = cancel_reason; }

    const params = [status, tm];
    if (extra.includes('engineer_id')) params.push(engineer_id);
    if (extra.includes('design_note')) params.push(design_note||'');
    if (extra.includes('delivery_note')) params.push(delivery_note||'');
    if (extra.includes('cancel_reason')) params.push(cancel_reason, req.user.id, tm);
    params.push(req.params.id);

    db.prepare(`UPDATE orders SET status=?, updated_at=?${extra} WHERE id=?`).run(...params);
    db.prepare("INSERT INTO order_status_logs (id,order_id,from_status,to_status,operator_id,operator_name,note) VALUES (?,?,?,?,?,?,?)").run(U(), req.params.id, o.status, status, req.user.id, req.user.username, note);

    // 通知
    const oi = db.prepare("SELECT o.*, h.name as hospital_name FROM orders o LEFT JOIN hospitals h ON o.hospital_id=h.id WHERE o.id=?").get(req.params.id);
    const lab = `${oi.order_no} (${oi.patient_name||'无'}, ${oi.hospital_name})`;
    if (o.status==='draft'&&status==='pending') {
      // 通知该医院绑定的技术主管（从 employees 表反向查）
      const techLeaders = db.prepare("SELECT u.id FROM employees e JOIN users u ON e.user_id=u.id WHERE e.hospital_ids LIKE ? AND (SELECT r.code FROM users u2 JOIN roles r ON u2.role_id=r.id WHERE u2.id=u.id)='tech_leader'").all('%"'+o.hospital_id+'"%');
      techLeaders.forEach(tl => sendNotif(tl.id, '新订单待指派', `订单 ${lab} 已提交审核，请指派设计工程师`, 'order', req.params.id));
    }
    if (o.status==='pending'&&status==='assigned' && engineer_id) {
      sendNotif(engineer_id, '新设计任务', `订单 ${lab} 已指派给您，请完成三维设计`, 'order', req.params.id);
    }
    if (o.status==='assigned'&&status==='designed') {
      db.prepare("SELECT u.id FROM users u JOIN roles r ON u.role_id=r.id WHERE r.code IN ('ops_leader','admin') AND u.status='active'").all().forEach(u => sendNotif(u.id, '设计已完成', `订单 ${lab} 设计已完成，请确认收货`, 'order', req.params.id));
    }
    if ((o.status==='designed'&&status==='received') || (o.status==='received'&&status==='delivered')) {
      if (oi.salesperson_id) sendNotif(oi.salesperson_id, `订单已${status==='received'?'收货':'交付'}`, `订单 ${lab} 已${status==='received'?'确认收货':'交付完成'}`, 'order', req.params.id);
    }
    if (status==='cancelled') {
      if (oi.salesperson_id) sendNotif(oi.salesperson_id, '订单已取消', `订单 ${lab} 已取消: ${cancel_reason}`, 'order', req.params.id);
      if (oi.engineer_id) sendNotif(oi.engineer_id, '订单已取消', `订单 ${lab} 已取消`, 'order', req.params.id);
    }
    logOp('update', '订单管理', `状态: ${o.status}→${status}, ${oi.order_no}`, req.user.id);
    return res.json({ ok: true });
  }
  // 仅字段更新（保留已有值）
  const qty = quantity !== undefined ? (parseInt(quantity)||0) : o.quantity;
  const uPrice = unit_price !== undefined ? (parseFloat(unit_price)||0) : o.unit_price;
  const tPrice = total_price !== undefined ? (parseFloat(total_price)||0) : o.total_price;
  db.prepare("UPDATE orders SET department_id=?,agent_id=?,order_type=?,patient_name=?,body_part=?,quantity=?,unit_price=?,total_price=?,urgency=?,delivery_date=?,remark=?,updated_at=? WHERE id=?").run(department_id||o.department_id, agent_id||o.agent_id, order_type||o.order_type, patient_name||o.patient_name, body_part||o.body_part, qty, uPrice, tPrice, urgency||o.urgency, delivery_date||o.delivery_date, remark||o.remark, tm, req.params.id);
  logOp('update', '订单管理', `更新订单字段: ${o.order_no}`, req.user.id);
  res.json({ ok: true });
});

app.delete('/api/orders/:id', auth, requirePerm('orders:delete'), (req, res) => {
  db.prepare("DELETE FROM orders WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── 订单附件 ──
app.post('/api/orders/:id/attachments', auth, requirePerm('orders:upload'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择文件' });
  const id = U();
  db.prepare("INSERT INTO order_attachments (id,order_id,file_name,file_path,file_type,file_size,category) VALUES (?,?,?,?,?,?,?)").run(id, req.params.id, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.body.category||'technical');
  logOp('upload', '订单附件', `上传: ${req.file.originalname}`, req.user.id);
  res.status(201).json({ id, file_name: req.file.originalname });
});
app.delete('/api/orders/:oid/attachments/:aid', auth, requirePerm('orders:edit'), (req, res) => {
  const a = db.prepare("SELECT * FROM order_attachments WHERE id=?").get(req.params.aid);
  if (a) { try { fs.unlinkSync(path.join(UPLOAD_DIR, a.file_path)); } catch(e) {} }
  db.prepare("DELETE FROM order_attachments WHERE id=?").run(req.params.aid);
  res.json({ ok: true });
});
app.get('/api/attachments/:id/download', auth, (req, res) => {
  const a = db.prepare("SELECT * FROM order_attachments WHERE id=?").get(req.params.id);
  if (!a || !fs.existsSync(path.join(UPLOAD_DIR, a.file_path))) return res.status(404).json({ error: '文件不存在' });
  res.download(path.join(UPLOAD_DIR, a.file_path), a.file_name);
});

// ── 通知 ──
app.get('/api/notifications', auth, (req, res) => {
  const items = db.prepare("SELECT n.*, o.order_no FROM notifications n LEFT JOIN orders o ON n.order_id=o.id WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 100").all(req.user.id);
  const unread = db.prepare("SELECT COUNT(*) as c FROM notifications WHERE user_id=? AND is_read=0").get(req.user.id).c;
  res.json({ items, unread });
});
app.put('/api/notifications/:id/read', auth, (req, res) => {
  db.prepare("UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?").run(req.params.id, req.user.id);
  res.json({ ok: true });
});
app.put('/api/notifications/read-all', auth, (req, res) => {
  db.prepare("UPDATE notifications SET is_read=1 WHERE user_id=?").run(req.user.id);
  res.json({ ok: true });
});

// ── 医院可指派人员（基于 employees.hospital_ids 反向查询）──
app.get('/api/hospitals/:id/assignees', auth, requirePerm('hospitals:view'), (req, res) => {
  // 查询负责该医院且角色为 engineer/tech_leader 的员工
  const assignees = db.prepare("SELECT u.id as user_id, u.real_name, u.username, CASE WHEN (SELECT r.code FROM users u2 JOIN roles r ON u2.role_id=r.id WHERE u2.id=u.id)='tech_leader' THEN 'tech_leader' ELSE 'engineer' END as assign_type, e.id as employee_id FROM employees e JOIN users u ON e.user_id=u.id WHERE e.hospital_ids LIKE ? AND (SELECT r.code FROM users u2 JOIN roles r ON u2.role_id=r.id WHERE u2.id=u.id) IN ('engineer','tech_leader') ORDER BY assign_type, u.real_name").all('%"'+req.params.id+'"%');
  res.json({ leaders: assignees.filter(a=>a.assign_type==='tech_leader'), engineers: assignees.filter(a=>a.assign_type==='engineer'), assignees });
});

// ── 医院管理（保留完整）─
app.get('/api/hospitals', auth, requirePerm('hospitals:view'), (req, res) => {
  const { search, province, page = 1, pageSize = 200 } = req.query;
  let where = "WHERE 1=1", params = [];
  if (search) { where += " AND (name LIKE ? OR city LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
  if (province) { where += " AND province=?"; params.push(province); }
  const total = db.prepare(`SELECT COUNT(*) as c FROM hospitals ${where}`).get(...params).c;
  const items = db.prepare(`SELECT * FROM hospitals ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(pageSize), (parseInt(page)-1)*parseInt(pageSize));
  res.json({ items, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});
app.get('/api/hospitals/:id', auth, requirePerm('hospitals:view'), (req, res) => {
  const h = db.prepare("SELECT * FROM hospitals WHERE id=?").get(req.params.id);
  if (!h) return res.status(404).json({ error: '不存在' });
  // 从 employees.hospital_ids 反向查询该医院绑定的技术团队
  h.tech_members = db.prepare("SELECT e.id as employee_id, e.name, e.position, u.id as user_id, u.real_name, u.username, (SELECT r.code FROM users u2 JOIN roles r ON u2.role_id=r.id WHERE u2.id=u.id) as role_code FROM employees e JOIN users u ON e.user_id=u.id WHERE e.hospital_ids LIKE ? AND e.user_id IS NOT NULL ORDER BY e.position, e.name").all('%"'+req.params.id+'"%');
  res.json(h);
});
app.post('/api/hospitals', auth, requirePerm('hospitals:create'), (req, res) => {
  const { name, short_name, province, city, district, address, level, type, contact_name, contact_phone, contact_email, remark } = req.body;
  if (!name) return res.status(400).json({ error: '医院名称必填' });
  const id = U();
  db.prepare("INSERT INTO hospitals (id,name,short_name,province,city,district,address,level,type,contact_name,contact_phone,contact_email,remark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, name, short_name, province, city, district, address, level, type, contact_name, contact_phone, contact_email, remark);
  logOp('create', '医院管理', `新增: ${name}`, req.user.id);
  res.status(201).json({ id });
});
app.put('/api/hospitals/:id', auth, requirePerm('hospitals:edit'), (req, res) => {
  const { name, short_name, province, city, district, address, level, type, contact_name, contact_phone, contact_email, remark } = req.body;
  db.prepare("UPDATE hospitals SET name=?,short_name=?,province=?,city=?,district=?,address=?,level=?,type=?,contact_name=?,contact_phone=?,contact_email=?,remark=? WHERE id=?").run(name, short_name, province, city, district, address, level, type, contact_name, contact_phone, contact_email, remark, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/hospitals/:id', auth, requirePerm('hospitals:delete'), (req, res) => {
  db.prepare("DELETE FROM hospitals WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── 医院科室 ──
app.get('/api/hospitals/:id/departments', auth, (req, res) => {
  res.json(db.prepare("SELECT * FROM hospital_departments WHERE hospital_id=? ORDER BY name").all(req.params.id));
});
app.post('/api/hospitals/:id/departments', auth, requirePerm('hospitals:dept'), (req, res) => {
  const id = U();
  db.prepare("INSERT INTO hospital_departments (id,hospital_id,name,leader) VALUES (?,?,?,?)").run(id, req.params.id, req.body.name, req.body.leader);
  res.status(201).json({ id });
});
app.put('/api/hospitals/:id/departments/:did', auth, requirePerm('hospitals:dept'), (req, res) => {
  db.prepare("UPDATE hospital_departments SET name=?,leader=? WHERE id=?").run(req.body.name, req.body.leader, req.params.did);
  res.json({ ok: true });
});
app.delete('/api/hospitals/:id/departments/:did', auth, requirePerm('hospitals:dept'), (req, res) => {
  db.prepare("DELETE FROM hospital_departments WHERE id=?").run(req.params.did);
  res.json({ ok: true });
});

// ── 医院医生 ──
app.get('/api/hospitals/:id/doctors', auth, (req, res) => {
  res.json(db.prepare("SELECT * FROM hospital_doctors WHERE hospital_id=? ORDER BY name").all(req.params.id));
});
app.post('/api/hospitals/:id/doctors', auth, requirePerm('hospitals:doctor'), (req, res) => {
  const id = U();
  db.prepare("INSERT INTO hospital_doctors (id,hospital_id,department_id,name,title,specialty,phone,email) VALUES (?,?,?,?,?,?,?,?)").run(id, req.params.id, req.body.department_id, req.body.name, req.body.title, req.body.specialty, req.body.phone, req.body.email);
  res.status(201).json({ id });
});
app.put('/api/hospitals/:id/doctors/:did', auth, requirePerm('hospitals:doctor'), (req, res) => {
  db.prepare("UPDATE hospital_doctors SET department_id=?,name=?,title=?,specialty=?,phone=?,email=? WHERE id=?").run(req.body.department_id, req.body.name, req.body.title, req.body.specialty, req.body.phone, req.body.email, req.params.did);
  res.json({ ok: true });
});
app.delete('/api/hospitals/:id/doctors/:did', auth, requirePerm('hospitals:doctor'), (req, res) => {
  db.prepare("DELETE FROM hospital_doctors WHERE id=?").run(req.params.did);
  res.json({ ok: true });
});

// ── 订单统计 ──
app.get('/api/stats/orders', auth, requirePerm('stats:view'), (req, res) => {
  const { start_date, end_date } = req.query;
  let w = "1=1", p = [];
  if (start_date) { w += " AND date(o.created_at)>=?"; p.push(start_date); }
  if (end_date) { w += " AND date(o.created_at)<=?"; p.push(end_date); }
  const byStatus = db.prepare(`SELECT status, COUNT(*) as count, COALESCE(SUM(COALESCE(o.total_price,0)),0) as total FROM orders o WHERE ${w} GROUP BY status`).all(...p);
  const byType = db.prepare(`SELECT order_type, COUNT(*) as count FROM orders WHERE ${w} AND order_type!='' GROUP BY order_type`).all(...p);
  const byMonth = db.prepare(`SELECT strftime('%Y-%m',created_at) as month, COUNT(*) as count, COALESCE(SUM(COALESCE(o.total_price,0)),0) as total FROM orders o WHERE ${w} GROUP BY month ORDER BY month ASC LIMIT 24`).all(...p);
  const byHospital = db.prepare(`SELECT h.name, COUNT(*) as count, COALESCE(SUM(COALESCE(o.total_price,0)),0) as total FROM orders o JOIN hospitals h ON o.hospital_id=h.id WHERE ${w} GROUP BY h.name ORDER BY count DESC LIMIT 20`).all(...p);
  res.json({ byStatus, byType, byMonth, byHospital });
});

// ── CSV导出 ──
app.get('/api/export/orders', auth, requirePerm('orders:export'), (req, res) => {
  const rows = db.prepare("SELECT o.order_no, o.order_type, o.patient_name, o.status, o.urgency, o.quantity, o.total_price, o.created_at, h.name as hospital_name FROM orders o LEFT JOIN hospitals h ON o.hospital_id=h.id ORDER BY o.created_at DESC").all();
  const csv = '\uFEFF订单编号,类型,患者,状态,紧急,数量,金额,医院,创建时间\n' + rows.map(o => [o.order_no, o.order_type||'', o.patient_name||'', o.status, o.urgency, o.quantity, o.total_price, o.hospital_name||'', o.created_at].join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=orders.csv');
  res.send(csv);
});

// ── 代理商 ──
app.get('/api/agents', auth, requirePerm('agents:view'), (req, res) => {
  const { search, page = 1, pageSize = 200 } = req.query;
  let w = "WHERE 1=1", p = [];
  if (search) { w += " AND (name LIKE ? OR company LIKE ?)"; p.push(`%${search}%`, `%${search}%`); }
  const total = db.prepare(`SELECT COUNT(*) as c FROM agents ${w}`).get(...p).c;
  const items = db.prepare(`SELECT * FROM agents ${w} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...p, parseInt(pageSize), (parseInt(page)-1)*parseInt(pageSize));
  res.json({ items, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});
app.post('/api/agents', auth, requirePerm('agents:create'), (req, res) => {
  const { name, company, province, city, contact_name, contact_phone, contact_email, commission_rate } = req.body;
  const id = U();
  db.prepare("INSERT INTO agents (id,name,company,province,city,contact_name,contact_phone,contact_email,commission_rate) VALUES (?,?,?,?,?,?,?,?,?)").run(id, name, company, province, city, contact_name, contact_phone, contact_email, commission_rate);
  logOp('create', '代理商管理', `新增: ${name}`, req.user.id);
  res.status(201).json({ id });
});
app.put('/api/agents/:id', auth, requirePerm('agents:edit'), (req, res) => {
  const old = db.prepare("SELECT * FROM agents WHERE id=?").get(req.params.id);
  if (!old) return res.status(404).json({ error: '不存在' });
  const { name, company, province, city, contact_name, contact_phone, contact_email, commission_rate } = req.body;
  db.prepare("UPDATE agents SET name=?,company=?,province=?,city=?,contact_name=?,contact_phone=?,contact_email=?,commission_rate=? WHERE id=?").run(name??old.name, company??old.company, province??old.province, city??old.city, contact_name??old.contact_name, contact_phone??old.contact_phone, contact_email??old.contact_email, commission_rate??old.commission_rate, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/agents/:id', auth, requirePerm('agents:delete'), (req, res) => {
  db.prepare("DELETE FROM agents WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── 人员管理 ──
app.get('/api/employees', auth, requirePerm('employees:view'), (req, res) => {
  const { search, page = 1, pageSize = 200 } = req.query;
  let w = "WHERE 1=1", p = [];
  if (search) { w += " AND (e.name LIKE ? OR e.position LIKE ?)"; p.push(`%${search}%`, `%${search}%`); }
  const total = db.prepare(`SELECT COUNT(*) as c FROM employees e ${w}`).get(...p).c;
  const items = db.prepare(`SELECT e.*, d.name as dept_name FROM employees e LEFT JOIN departments d ON e.department_id=d.id ${w} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`).all(...p, parseInt(pageSize), (parseInt(page)-1)*parseInt(pageSize));
  res.json({ items, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});
app.post('/api/employees', auth, requirePerm('employees:create'), (req, res) => {
  const { name, department_id, position, phone, email, hospital_ids, is_headquarter } = req.body;
  const hids = hospital_ids ? (Array.isArray(hospital_ids) ? JSON.stringify(hospital_ids) : hospital_ids) : '[]';
  const id = U();
  const user = db.prepare("SELECT id FROM users WHERE real_name=? AND status='active' LIMIT 1").get(name);
  db.prepare("INSERT INTO employees (id,name,department_id,position,phone,email,hospital_ids,is_headquarter,user_id) VALUES (?,?,?,?,?,?,?,?,?)").run(id, name, department_id, position, phone, email, hids, is_headquarter ? 1 : 0, user ? user.id : null);
  logOp('create', '人员管理', `新增: ${name}`, req.user.id);
  res.status(201).json({ id });
});
app.put('/api/employees/:id', auth, requirePerm('employees:edit'), (req, res) => {
  const { name, department_id, position, phone, email, hospital_ids, is_headquarter } = req.body;
  const hids = hospital_ids ? (Array.isArray(hospital_ids) ? JSON.stringify(hospital_ids) : hospital_ids) : '[]';
  const user = db.prepare("SELECT id FROM users WHERE real_name=? AND status='active' LIMIT 1").get(name);
  db.prepare("UPDATE employees SET name=?,department_id=?,position=?,phone=?,email=?,hospital_ids=?,is_headquarter=?,user_id=? WHERE id=?").run(name, department_id, position, phone, email, hids, is_headquarter ? 1 : 0, user ? user.id : null, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/employees/:id', auth, requirePerm('employees:delete'), (req, res) => {
  db.prepare("DELETE FROM employees WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── 用户管理 ──
app.get('/api/users', auth, requirePerm('users:view'), (req, res) => {
  const { search, page = 1, pageSize = 200 } = req.query;
  let w = "WHERE 1=1", p = [];
  if (search) { w += " AND (u.username LIKE ? OR u.real_name LIKE ?)"; p.push(`%${search}%`, `%${search}%`); }
  const total = db.prepare(`SELECT COUNT(*) as c FROM users u ${w}`).get(...p).c;
  const items = db.prepare(`SELECT u.id,u.username,u.real_name,u.phone,u.email,u.status,u.created_at,d.name as dept_name,r.name as role_name FROM users u LEFT JOIN departments d ON u.department_id=d.id LEFT JOIN roles r ON u.role_id=r.id ${w} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`).all(...p, parseInt(pageSize), (parseInt(page)-1)*parseInt(pageSize));
  res.json({ items, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});
app.post('/api/users', auth, requirePerm('users:create'), (req, res) => {
  const { username, password, real_name, phone, email, department_id, role_id } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  if (db.prepare("SELECT id FROM users WHERE username=?").get(username)) return res.status(400).json({ error: '用户名已存在' });
  const pwd = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO users (id,username,password,real_name,phone,email,department_id,role_id) VALUES (?,?,?,?,?,?,?,?)").run(U(), username, pwd, real_name, phone, email, department_id, role_id);
  logOp('create', '用户管理', `新增: ${username}`, req.user.id);
  res.status(201).json({ ok: true });
});
app.put('/api/users/:id', auth, requirePerm('users:edit'), (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const sets=[],vals=[];
  for(const f of ['username','real_name','phone','email','department_id','role_id','status']){
    if(req.body[f]!==undefined){sets.push(f+'=?');vals.push(req.body[f]);}
  }
  if(sets.length){vals.push(req.params.id);db.prepare('UPDATE users SET '+sets.join(',')+' WHERE id=?').run(...vals);}
  res.json({ ok: true });
});
app.delete('/api/users/:id', auth, requirePerm('users:delete'), (req, res) => {
  db.prepare("DELETE FROM users WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
app.post('/api/users/:id/reset-pwd', auth, requirePerm('users:edit'), (req, res) => {
  db.prepare("UPDATE users SET password=? WHERE id=?").run(bcrypt.hashSync(req.body.password || '123456', 10), req.params.id);
  res.json({ ok: true });
});

// ── 角色/权限 ──
app.get('/api/roles', auth, requirePerm('roles:view'), (req, res) => {
  const roles = db.prepare("SELECT * FROM roles ORDER BY created_at").all();
  res.json(roles.map(r => {
    const perms = db.prepare("SELECT permission FROM role_permissions WHERE role_id=?").all(r.id).map(p => p.permission);
    return { ...r, permissions: perms };
  }));
});
app.post('/api/roles', auth, requirePerm('roles:create'), (req, res) => {
  const id = U();
  db.prepare("INSERT INTO roles (id,name,code) VALUES (?,?,?)").run(id, req.body.name, req.body.code);
  if (req.body.permissions) {
    const ins = db.prepare("INSERT OR IGNORE INTO role_permissions VALUES (?,?)");
    req.body.permissions.forEach(p => ins.run(id, p));
  }
  logOp('create', '权限管理', `新增角色: ${req.body.name}`, req.user.id);
  res.status(201).json({ id });
});
app.put('/api/roles/:id', auth, requirePerm('roles:edit'), (req, res) => {
  db.prepare("UPDATE roles SET name=?,code=? WHERE id=?").run(req.body.name, req.body.code, req.params.id);
  if (req.body.permissions !== undefined) {
    db.prepare("DELETE FROM role_permissions WHERE role_id=?").run(req.params.id);
    if (req.body.permissions.length) {
      const ins = db.prepare("INSERT OR IGNORE INTO role_permissions VALUES (?,?)");
      req.body.permissions.forEach(p => ins.run(req.params.id, p));
    }
  }
  logOp('update', '权限管理', `更新角色: ${req.body.name}`, req.user.id);
  res.json({ ok: true });
});
app.delete('/api/roles/:id', auth, requirePerm('roles:delete'), (req, res) => {
  db.prepare("DELETE FROM roles WHERE id=? AND code!='admin'").run(req.params.id);
  res.json({ ok: true });
});
app.get('/api/permissions', auth, requirePerm('roles:view'), (req, res) => {
  const g = {};
  for (const [k, v] of Object.entries(ALL_PERMISSIONS)) {
    if (!g[v.group]) g[v.group] = [];
    g[v.group].push({ key: k, name: v.name });
  }
  res.json(g);
});

// ── 部门 ──
app.get('/api/departments', auth, requirePerm('departments:view'), (req, res) => {
  res.json(db.prepare("SELECT * FROM departments ORDER BY name").all());
});
app.post('/api/departments', auth, requirePerm('departments:create'), (req, res) => {
  db.prepare("INSERT INTO departments (id,name,leader) VALUES (?,?,?)").run(U(), req.body.name, req.body.leader);
  logOp('create', '部门管理', `新增: ${req.body.name}`, req.user.id);
  res.status(201).json({ id: U() });
});
app.put('/api/departments/:id', auth, requirePerm('departments:edit'), (req, res) => {
  db.prepare("UPDATE departments SET name=?,leader=? WHERE id=?").run(req.body.name, req.body.leader, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/departments/:id', auth, requirePerm('departments:delete'), (req, res) => {
  db.prepare("DELETE FROM departments WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── 日志 ──
app.get('/api/logs', auth, requirePerm('logs:view'), (req, res) => {
  const { search, start_date, end_date, page = 1, pageSize = 50 } = req.query;
  let w = "1=1", p = [];
  if (search) { w += " AND (action LIKE ? OR module LIKE ? OR detail LIKE ?)"; p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (start_date) { w += " AND date(created_at)>=?"; p.push(start_date); }
  if (end_date) { w += " AND date(created_at)<=?"; p.push(end_date); }
  const total = db.prepare(`SELECT COUNT(*) as c FROM operation_logs WHERE ${w}`).get(...p).c;
  const items = db.prepare(`SELECT * FROM operation_logs WHERE ${w} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...p, parseInt(pageSize), (parseInt(page)-1)*parseInt(pageSize));
  res.json({ items, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// ── 系统监控 ──
app.get('/api/monitor', auth, requirePerm('monitor:view'), (req, res) => {
  const dbSize = fs.statSync(DB_PATH).size;
  const upSize = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR).reduce((s,f)=>{try{return s+fs.statSync(path.join(UPLOAD_DIR,f)).size}catch{return s}},0) : 0;
  res.json({ dbSize: (dbSize/1024/1024).toFixed(2)+'MB', uploadSize: (upSize/1024/1024).toFixed(2)+'MB', nodeVersion: process.version, time: new Date().toLocaleString('zh-CN') });
});

// ── 系统配置 ──
app.get('/api/config', auth, requirePerm('config:view'), (req, res) => {
  const cfgs = db.prepare("SELECT * FROM system_config").all();
  const o = {}; cfgs.forEach(c => o[c.key] = c.value);
  res.json(o);
});
app.put('/api/config', auth, requirePerm('config:edit'), (req, res) => {
  for (const [k, v] of Object.entries(req.body)) db.prepare("INSERT OR REPLACE INTO system_config (id,key,value,updated_at) VALUES (?,?,?,datetime('now','localtime'))").run(U(), k, String(v));
  res.json({ ok: true });
});

// ── 省份列表 ──
app.get('/api/provinces', (req, res) => {
  res.json(['北京','天津','河北','山西','内蒙古','辽宁','吉林','黑龙江','上海','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','广西','海南','重庆','四川','贵州','云南','西藏','陕西','甘肃','青海','宁夏','新疆']);
});

// ── 前端路由 ──
app.get('/index_new.html', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index_new.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index_new.html')));

app.listen(PORT, () => {
  console.log(`✅ 金石立美订单管理系统 http://localhost:${PORT}/index_new.html`);
  console.log(`🔑 admin / admin123`);
});

} // end initApp




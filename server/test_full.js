const http = require('http');
const base = 'http://localhost:8766';
const loginData = JSON.stringify({ username: 'admin', password: 'admin123' });

function req(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const opts = { method, hostname: 'localhost', port: 8766, path, headers: {} };
    if (data) opts.headers['Content-Type'] = 'application/json';
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const r = http.request(opts, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  // Login
  let r = await req('POST', '/api/login', loginData);
  const token = JSON.parse(r.body).token;
  console.log('✅ Login OK');
  if (!token) return;

  // 1. Hospitals
  r = await req('GET', '/api/hospitals?pageSize=50', null, token);
  const hData = JSON.parse(r.body);
  const hospitals = hData.items || [];
  console.log(`\n📋 医院列表 (${hospitals.length}家):`);
  hospitals.forEach(h => console.log(`  ${h.id.slice(0,8)}... | ${h.name} | ${h.province} | ${h.status}`));
  if (hospitals.length === 0) { console.log('  没有医院数据'); return; }

  // 2. Employees
  r = await req('GET', '/api/employees?pageSize=50', null, token);
  const eData = JSON.parse(r.body);
  const employees = eData.items || [];
  console.log(`\n👥 员工列表 (${employees.length}人):`);
  employees.forEach(e => console.log(`  ${e.real_name} | ${e.role_name} | dept=${e.department_name||'-'}`));

  // 3. Orders
  r = await req('GET', '/api/orders?pageSize=30', null, token);
  const oData = JSON.parse(r.body);
  const orders = oData.items || [];
  console.log(`\n📦 订单列表 (${orders.length}单):`);
  orders.forEach(o => console.log(`  ${o.order_no} | ${o.hospital_name} | ${o.status} | ¥${o.total_amount||0}`));

  // 4. Create a draft order
  if (hospitals.length > 0) {
    const hid = hospitals[0].id;
    const dept = (hospitals[0].departments || [])[0];
    const newOrder = {
      hospital_id: hid,
      department_id: dept ? dept.id : null,
      patient_name: '测试患者',
      patient_gender: '男',
      patient_age: 35,
      diagnosis: '测试诊断',
      order_type: '测试订单',
      description: 'API测试订单',
      total_amount: 1000,
      urgent: false
    };
    r = await req('POST', '/api/orders', JSON.stringify(newOrder), token);
    const created = JSON.parse(r.body);
    console.log(`\n🆕 创建订单: ${r.status} | ${created.order_no || JSON.stringify(created).substring(0,100)}`);
  }

  // 5. Stats detail
  r = await req('GET', '/api/stats/orders', null, token);
  console.log(`\n📊 统计: ${r.body.substring(0, 300)}`);

  // 6. Notifications
  r = await req('GET', '/api/notifications', null, token);
  const nData = JSON.parse(r.body);
  const notifs = nData.items || [];
  console.log(`\n🔔 通知 (${notifs.length}条):`);
  notifs.slice(0, 5).forEach(n => console.log(`  ${n.title} | ${n.read ? '已读' : '未读'}`));

  // 7. Roles & Users
  r = await req('GET', '/api/roles', null, token);
  const roles = JSON.parse(r.body);
  console.log(`\n🔐 角色 (${roles.length}个):`);
  roles.forEach(ro => console.log(`  ${ro.name} (${ro.code})`));

  r = await req('GET', '/api/users?pageSize=20', null, token);
  const uData = JSON.parse(r.body);
  const users = uData.items || [];
  console.log(`\n👤 用户 (${users.length}人):`);
  users.forEach(u => console.log(`  ${u.username} | ${u.real_name} | role=${u.role_name}`));

  console.log('\n🎉 ALL TESTS COMPLETE');
})();

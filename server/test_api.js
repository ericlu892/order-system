const http = require('http');

const base = 'http://localhost:8765';
const loginData = JSON.stringify({ username: 'admin', password: 'admin123' });

function request(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const opts = { method, hostname: 'localhost', port: 8765, path, headers: {} };
    if (data) opts.headers['Content-Type'] = 'application/json';
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(opts, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  console.log('=== 1. Login ===');
  let r = await request('POST', '/api/login', loginData);
  let body = JSON.parse(r.body);
  console.log('Status:', r.status, '| Token:', body.token ? 'OK' : 'FAIL');
  const token = body.token;
  if (!token) { console.log('ABORT'); return; }

  console.log('\n=== 2. Dashboard ===');
  r = await request('GET', '/api/dashboard', null, token);
  console.log('Status:', r.status, '|', r.body.substring(0, 200));

  console.log('\n=== 3. Hospitals ===');
  r = await request('GET', '/api/hospitals', null, token);
  const hData = JSON.parse(r.body);
  console.log('Raw hospitals type:', typeof hData, Array.isArray(hData), Object.keys(hData).slice(0,5));
  const hospitals = Array.isArray(hData) ? hData : (hData.hospitals || hData.data || []);
  console.log('Count:', hospitals.length);
  if (hospitals.length > 0) console.log('Names:', hospitals.map(h => h.name).join(', '));
  else console.log('Raw sample:', JSON.stringify(hData).substring(0, 300));

  console.log('\n=== 4. Orders ===');
  r = await request('GET', '/api/orders', null, token);
  const oData = JSON.parse(r.body);
  console.log('Raw orders type:', typeof oData, Array.isArray(oData), Object.keys(oData).slice(0,5));
  const orderList = Array.isArray(oData) ? oData : (oData.orders || oData.data || []);
  console.log('Count:', orderList.length);
  if (orderList.length > 0) {
    orderList.forEach(o => console.log('  ' + o.order_no + ' | ' + o.hospital_name + ' | status=' + o.status));
  }

  console.log('\n=== 5. Stats ===');
  r = await request('GET', '/api/stats/orders', null, token);
  console.log('Status:', r.status, '|', r.body.substring(0, 300));

  console.log('\n=== 6. Employees ===');
  r = await request('GET', '/api/employees', null, token);
  const eData = JSON.parse(r.body);
  console.log('Raw employees type:', typeof eData, Array.isArray(eData), Object.keys(eData).slice(0,5));
  const empList = Array.isArray(eData) ? eData : (eData.employees || eData.data || []);
  console.log('Count:', empList.length);
  if (empList.length > 0) {
    empList.forEach(e => console.log('  ' + e.real_name + ' | role=' + e.role_name));
  }

  console.log('\n=== ALL TESTS DONE ===');
})();

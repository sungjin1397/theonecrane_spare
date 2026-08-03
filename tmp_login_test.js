const http = require('http');
const req = http.request({
  host: '127.0.0.1',
  port: 3001,
  path: '/api/auth/login',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('status=' + res.statusCode);
    console.log(data);
  });
});
req.on('error', err => {
  console.error(err);
  process.exit(1);
});
req.write(JSON.stringify({ password: 'THEONE_MASTER_CODE_2026' }));
req.end();

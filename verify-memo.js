const dotenv = require('dotenv');
dotenv.config({ path: require('path').join(process.cwd(), '.env') });
const base = 'http://localhost:3001';

async function request(path, options = {}) {
  const res = await fetch(base + path, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { res, data };
}

(async () => {
  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: process.env.MASTER_PASSWORD })
  });
  console.log('admin login', adminLogin.res.status, adminLogin.data);
  const token = adminLogin.data.token;

  const userId = 'be734a34-b297-45a1-97ed-f5b478828238';
  const memo = await request(`/api/admin/users/${encodeURIComponent(userId)}/memo`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ memo: '디버그 메모' })
  });
  console.log('memo response', memo.res.status, memo.data);
})().catch(err => {
  console.error(err);
  process.exit(1);
});

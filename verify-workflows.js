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
  if (!adminLogin.res.ok || !adminLogin.data.token) throw new Error('admin login failed');
  const token = adminLogin.data.token;

  const unique = Date.now();
  const inquiryPayload = { company: `테스트업체${unique}`, name: '자동검증', tel: '010-0000-0000', type: '100톤 이하', memo: '자동검증' };
  const inquiry = await request('/api/inbox/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inquiryPayload) });
  if (!inquiry.res.ok) throw new Error('inquiry create failed');

  const inbox = await request('/api/inbox/request', { headers: { Authorization: `Bearer ${token}` } });
  if (!inbox.res.ok) throw new Error('inbox lookup failed');
  const createdReq = (Array.isArray(inbox.data) ? inbox.data : []).slice().reverse().find(item => item.company === inquiryPayload.company);
  if (!createdReq) throw new Error('created inquiry not found');

  const complete = await request(`/api/admin/inbox/request/${encodeURIComponent(createdReq.id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!complete.res.ok) throw new Error('inquiry completion failed');

  const orders = await request('/api/admin/orders', { headers: { Authorization: `Bearer ${token}` } });
  if (!orders.res.ok) throw new Error('orders lookup failed');
  const createdOrder = (Array.isArray(orders.data) ? orders.data : []).find(item => item.sourceInquiryId === createdReq.id || item.company === inquiryPayload.company);
  if (!createdOrder) throw new Error('order not created');

  const toggle = await request(`/api/admin/orders/${encodeURIComponent(createdOrder.id)}/dispatchStatus`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ value: '배차완료' }) });
  if (!toggle.res.ok) throw new Error('order toggle failed');

  const del = await request(`/api/admin/orders/${encodeURIComponent(createdOrder.id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!del.res.ok) throw new Error('order delete failed');

  const driverPayload = { name: `자동검증기사${unique}`, tel: '010-1111-1111', type: '200톤 이하', cert: '기중기', memo: '자동검증' };
  const driverCreate = await request('/api/inbox/driver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(driverPayload) });
  if (!driverCreate.res.ok) throw new Error('driver create failed');

  const inboxDrivers = await request('/api/inbox/driver', { headers: { Authorization: `Bearer ${token}` } });
  if (!inboxDrivers.res.ok) throw new Error('driver inbox lookup failed');
  const createdDriver = (Array.isArray(inboxDrivers.data) ? inboxDrivers.data : []).slice().reverse().find(item => item.name === driverPayload.name);
  if (!createdDriver) throw new Error('created driver not found');

  const approve = await request('/api/admin/approve-driver', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: createdDriver.id }) });
  if (!approve.res.ok) throw new Error('driver approve failed');

  const pool = await request('/api/drivers-pool', { headers: { Authorization: `Bearer ${token}` } });
  if (!pool.res.ok) throw new Error('driver pool lookup failed');
  const approvedDriver = (Array.isArray(pool.data) ? pool.data : []).find(item => item.name === driverPayload.name);
  if (!approvedDriver || !approvedDriver.type) throw new Error('approved driver missing type');

  const memoTarget = 'be734a34-b297-45a1-97ed-f5b478828238';
  const memo = await request(`/api/admin/users/${encodeURIComponent(memoTarget)}/memo`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ memo: '자동검증 메모' }) });
  if (!memo.res.ok) throw new Error('memo save failed');

  console.log(JSON.stringify({
    inquiryCompleted: true,
    orderCreated: Boolean(createdOrder),
    orderToggled: toggle.res.ok,
    orderDeleted: del.res.ok,
    driverApproved: true,
    driverType: approvedDriver.type,
    memoSaved: memo.data.success === true
  }, null, 2));
})().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function makeTempDataDir() {
  const tempDir = path.join(__dirname, `tmp-board-auth-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(tempDir, { recursive: true });

  for (const file of ['board.json', 'users.json', 'orders.json', 'products.json', 'drivers_pool.json', 'inbox_req.json', 'inbox_drv.json', 'interior_gallery.json', 'notice.json', 'rental_reg.json', 'rental_req.json', 'telegram.config.json']) {
    const fullPath = path.join(tempDir, file);
    fs.writeFileSync(fullPath, '[]', 'utf8');
  }

  return tempDir;
}

function createAppForTest() {
  const tempDir = makeTempDataDir();
  process.env.DATA_DIR = tempDir;
  process.env.JWT_SECRET = 'board-auth-test-secret-1234567890';
  process.env.MASTER_PASSWORD = 'board-auth-test-password-123';
  delete require.cache[require.resolve('../server')];
  const { app } = require('../server');
  return { app, tempDir };
}

test('user token can create a general board post', async () => {
  const { app } = createAppForTest();
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;

  try {
    const registerRes = await fetch(`http://127.0.0.1:${port}/api/user/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '테스터',
        phone: `010${Date.now().toString().slice(-8)}`,
        password: 'abcd1234',
        role: 'USER'
      })
    });
    const registerBody = await registerRes.json();
    assert.equal(registerRes.status, 200, registerBody.error || 'register failed');
    const token = registerBody.token;
    assert.ok(token, 'user token missing');

    const postRes = await fetch(`http://127.0.0.1:${port}/api/board`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        title: '회원 게시글 테스트',
        content: '다른 브라우저에서도 보이게 해야 합니다.',
        category: 'GENERAL',
        isPinned: false
      })
    });

    const postBody = await postRes.json();
    assert.equal(postRes.status, 200, postBody.error || 'board post failed');
    assert.equal(postBody.data.writer, '테스터');
    assert.equal(postBody.data.category, 'GENERAL');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('user token cannot create notice posts', async () => {
  const { app } = createAppForTest();
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;

  try {
    const registerRes = await fetch(`http://127.0.0.1:${port}/api/user/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '테스터2',
        phone: `010${Date.now().toString().slice(-8)}`,
        password: 'abcd1234',
        role: 'USER'
      })
    });
    const registerBody = await registerRes.json();
    assert.equal(registerRes.status, 200, registerBody.error || 'register failed');

    const postRes = await fetch(`http://127.0.0.1:${port}/api/board`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${registerBody.token}`
      },
      body: JSON.stringify({
        title: '관리자 공지 시도',
        content: '허용되면 안 됩니다.',
        category: 'NOTICE',
        isPinned: true
      })
    });

    const body = await postRes.json();
    assert.equal(postRes.status, 400);
    assert.match(String(body.error || ''), /공지|관리자/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

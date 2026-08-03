const test = require('node:test');
const assert = require('node:assert/strict');
const { getAdminTokenTtl } = require('../shared/authConfig');

test('admin token ttl defaults to 24h and respects env override', () => {
  const original = process.env.ADMIN_JWT_TTL;
  delete process.env.ADMIN_JWT_TTL;
  assert.equal(getAdminTokenTtl(), '24h');

  process.env.ADMIN_JWT_TTL = '12h';
  assert.equal(getAdminTokenTtl(), '12h');

  if (original === undefined) {
    delete process.env.ADMIN_JWT_TTL;
  } else {
    process.env.ADMIN_JWT_TTL = original;
  }
});

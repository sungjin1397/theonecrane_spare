const test = require('node:test');
const assert = require('node:assert/strict');
const { listVisitorSessions } = require('../shared/visitorSessions');

test('keeps multiple concurrent sessions', () => {
  const visitorSessions = new Map([
    ['client-a:user-1', { sessionKey: 'client-a:user-1', userId: 'user-1', name: '홍길동', phone: '010-1111-1111', lastSeenAt: '2026-08-01T00:00:00.000Z' }],
    ['client-b:user-1', { sessionKey: 'client-b:user-1', userId: 'user-1', name: '홍길동', phone: '010-1111-1111', lastSeenAt: '2026-08-01T00:01:00.000Z' }]
  ]);

  const result = listVisitorSessions(visitorSessions, new Date('2026-08-01T00:02:00.000Z').getTime());
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(entry => entry.sessionKey).sort(), ['client-a:user-1', 'client-b:user-1']);
});

test('removes expired sessions', () => {
  const visitorSessions = new Map([
    ['client-a:user-2', { sessionKey: 'client-a:user-2', userId: 'user-2', name: '김철수', phone: '010-2222-2222', lastSeenAt: '2026-07-31T00:00:00.000Z' }]
  ]);

  const result = listVisitorSessions(visitorSessions, new Date('2026-08-01T00:02:00.000Z').getTime());
  assert.equal(result.length, 0);
});

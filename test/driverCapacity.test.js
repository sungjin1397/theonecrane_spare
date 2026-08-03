const test = require('node:test');
const assert = require('node:assert/strict');
const { inferDriverCapacityValue } = require('../shared/driverCapacity');

test('inferDriverCapacityValue extracts tonnage from crane type strings', () => {
  assert.equal(inferDriverCapacityValue({ type: '25톤 이하 카고' }), '25톤');
  assert.equal(inferDriverCapacityValue({ possibleType: '100톤 이하' }), '100톤');
  assert.equal(inferDriverCapacityValue({ capacity: '50' }), '50톤');
});

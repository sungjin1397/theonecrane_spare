const test = require('node:test');
const assert = require('node:assert/strict');
const { calcOrderMoney, createOrderFromInquiry, getOrdersForUser, findMissingOrderFields } = require('../shared/settlement');

test('calcOrderMoney computes VAT and driver payout from gross amount without deducting expenses from VAT', () => {
  const result = calcOrderMoney({ totalAmount: 500000, extraExpenses: 20000, feeRate: 0.03 });

  assert.equal(result.supply, 454545);
  assert.equal(result.vat, 45455);
  assert.equal(result.margin, 13636);
  assert.equal(result.driverPay, 460909);
});

test('createOrderFromInquiry maps an inquiry into a ledger entry', () => {
  const order = createOrderFromInquiry({
    company: '더원테크',
    name: '홍길동',
    tel: '01012341234',
    type: '25톤',
    memo: '송도 현장'
  });

  assert.equal(order.company, '더원테크');
  assert.equal(order.craneType, '25톤');
  assert.equal(order.driverName, '홍길동');
  assert.equal(order.clientTel, '01012341234');
  assert.equal(order.locationName, '송도 현장');
  assert.equal(order.totalAmount, 0);
  assert.equal(order.dispatchStatus, '배차대기');
  assert.equal(order.payStatus, '미수');
});

test('findMissingOrderFields reports required ERP fields', () => {
  const missing = findMissingOrderFields({
    date: '2026-08-01',
    company: '더원테크',
    locationName: '송도 현장'
  });

  assert.deepEqual(missing, ['driverName', 'craneType', 'workTime', 'totalAmount']);
});

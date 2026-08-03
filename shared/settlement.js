function calcOrderMoney(order) {
  const total = Number(order?.totalAmount) || 0;
  const extra = Number(order?.extraExpenses) || 0;
  const rate = Number(order?.feeRate) || 0;
  const taxableBase = Math.max(total, 0);
  const supply = Math.round(taxableBase / 1.1);
  const vat = taxableBase - supply;
  const margin = Math.round(supply * rate);
  const driverPay = Math.max(supply + extra - margin, 0);
  return { total, extra, supply, vat, margin, driverPay };
}

function createOrderFromInquiry(inquiry) {
  const normalizedInquiry = inquiry || {};
  return {
    date: new Date().toISOString().slice(0, 10),
    craneType: normalizedInquiry.type || normalizedInquiry.craneType || '',
    company: normalizedInquiry.company || normalizedInquiry.contactCompany || '',
    clientTel: normalizedInquiry.tel || normalizedInquiry.contactTel || '',
    locationName: normalizedInquiry.memo || normalizedInquiry.locationName || '',
    driverName: normalizedInquiry.name || normalizedInquiry.contactName || '',
    workTime: '',
    nightWork: 'X',
    extraExpenses: 0,
    totalAmount: 0,
    feeRate: 0.03,
    invoice: '발행전',
    dueDate: '',
    dispatchStatus: '배차대기',
    payStatus: '미수',
    createdAt: new Date().toISOString(),
    fromInquiry: true,
    sourceInquiryId: normalizedInquiry.id || '',
    sourceInquiryTime: normalizedInquiry.time || ''
  };
}

function findMissingOrderFields(order) {
  const normalizedOrder = order || {};
  const missing = [];
  const totalAmount = Number(normalizedOrder.totalAmount);

  if (!normalizedOrder.date) missing.push('date');
  if (!normalizedOrder.company) missing.push('company');
  if (!normalizedOrder.locationName) missing.push('locationName');
  if (!normalizedOrder.driverName) missing.push('driverName');
  if (!normalizedOrder.craneType) missing.push('craneType');
  if (!normalizedOrder.workTime) missing.push('workTime');
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) missing.push('totalAmount');

  return missing;
}

function getOrdersForUser(orders, userPhone) {
  const normalizedPhone = String(userPhone || '').replace(/[^0-9]/g, '');
  if (!normalizedPhone) return [];

  return (Array.isArray(orders) ? orders : []).filter(order => {
    const clientTel = String(order?.clientTel || order?.phone || order?.companyPhone || '').replace(/[^0-9]/g, '');
    const driverTel = String(order?.driverTel || order?.driverPhone || '').replace(/[^0-9]/g, '');
    return clientTel === normalizedPhone || driverTel === normalizedPhone;
  });
}

module.exports = { calcOrderMoney, createOrderFromInquiry, findMissingOrderFields, getOrdersForUser };

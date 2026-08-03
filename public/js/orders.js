/* ==========================================================
   THE ONE CRANE SPARE - orders.js (종합정산 ERP: 서버 장부 연동 완성본)
   - index.html의 실제 입력 폼 ID(orderDate/clientCompany/... )와 일치
   - 등록/조회/상태변경/삭제 모두 서버 /api/admin/orders 사용
   ========================================================== */

// 🔒 1. Safe Toast 알림 래퍼
if (typeof window.safeToast !== 'function') {
  window.safeToast = function(msg, type = 'info') {
    try {
      if (typeof window.showToast === 'function') {
        window.showToast(msg, type);
      } else {
        alert(msg);
      }
    } catch (e) {
      alert(msg);
    }
  };
}

function ordersToken() {
  return window.getAdminToken?.() || sessionStorage.getItem('theone_secure_token') || '';
}

// 💰 2. 정산 계산 (청구액=VAT·실비 포함, 실비=VAT 제외 대상)
function calcOrderMoney(order) {
  const total = Number(order.totalAmount) || 0;
  const extra = Number(order.extraExpenses) || 0;
  const rate = Number(order.feeRate) || 0;
  const taxableBase = Math.max(total, 0);
  const supply = Math.round(taxableBase / 1.1);
  const vat = taxableBase - supply;
  const margin = Math.round(supply * rate);
  const driverPay = Math.max(supply + extra - margin, 0);
  return { total, extra, supply, vat, margin, driverPay };
}

let erpOrdersCache = [];

function bindOrderTableEvents() {
  const tbody = document.getElementById('gridBody');
  if (!tbody || tbody.dataset.orderBound === 'true') return;
  tbody.dataset.orderBound = 'true';
  tbody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-order-action]');
    if (!button) return;
    const id = button.getAttribute('data-order-id');
    const action = button.getAttribute('data-order-action');
    if (!id) return;
    if (action === 'toggle') {
      await window.toggleOrderField(id, button.getAttribute('data-order-field'));
    } else if (action === 'delete') {
      await window.deleteOrder(id);
    }
  });
}

// 🚀 3. 신규 오더 등록 (index.html 실제 ID 기준)
window.addOrderData = async function (e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  const date = (document.getElementById('orderDate')?.value || '').trim();
  const craneType = document.getElementById('craneType')?.value || '';
  const company = (document.getElementById('clientCompany')?.value || '').trim();
  const clientTel = (document.getElementById('clientTel')?.value || '').trim();
  const locationName = (document.getElementById('locationName')?.value || '').trim();
  const driverName = (document.getElementById('driverName')?.value || '').trim();
  const workTime = (document.getElementById('workTime')?.value || '').trim();
  const nightWork = document.getElementById('nightWork')?.value || 'X';
  const extraExpenses = Number(String(document.getElementById('extraExpenses')?.value || '0').replace(/[^0-9]/g, '')) || 0;
  const totalAmount = Number(String(document.getElementById('totalAmount')?.value || '0').replace(/[^0-9]/g, '')) || 0;
  const feeRate = Number(document.getElementById('feeRate')?.value || '0');
  const taxInvoice = document.getElementById('taxInvoice')?.value || '발행전';
  const dueDate = document.getElementById('dueDate')?.value || '';

  const missing = [];
  if (!date) missing.push('작업일');
  if (!company) missing.push('거래처 상호');
  if (!locationName) missing.push('현장명');
  if (!driverName) missing.push('기사명');
  if (!craneType) missing.push('기종');
  if (!workTime) missing.push('작업시간');
  if (totalAmount <= 0) missing.push('총 청구 금액');

  if (missing.length) {
    window.safeToast(`다음 항목은 필수입니다: ${missing.join(', ')}`, 'warning');
    return;
  }

  const newOrder = {
    date, craneType, company, clientTel, locationName, driverName,
    workTime, nightWork, extraExpenses, totalAmount, feeRate,
    invoice: taxInvoice, dueDate,
    dispatchStatus: '배차대기',
    payStatus: '미수',
    createdAt: new Date().toISOString()
  };

  const btn = document.querySelector('button[onclick*="addOrderData"]');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/admin/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ordersToken()}` },
      body: JSON.stringify(newOrder)
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result.success === false) throw new Error(result.error || '서버 저장 실패');

    window.safeToast('오더가 장부에 등록되었습니다.', 'success');
    ['clientCompany', 'clientTel', 'locationName', 'workTime'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    await window.renderERPGrid();
  } catch (err) {
    console.error('[Orders] 오더 등록 실패:', err);
    window.safeToast('오더 등록에 실패했습니다. 관리자 로그인 상태를 확인해 주세요.', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
};

// 📊 4. 장부 그리드 + 요약 카드 렌더링
window.renderERPGrid = async function () {
  const tbody = document.getElementById('gridBody');
  if (!tbody) return;
  const token = ordersToken();
  if (!token || !window.isAdminSessionActive?.()) return;

  try {
    const res = await fetch('/api/admin/orders', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const orders = await res.json();
    erpOrdersCache = Array.isArray(orders) ? orders : [];
    try { localStorage.setItem('server_orders', JSON.stringify(erpOrdersCache)); } catch (err) { console.warn('[Orders] server_orders 저장 실패:', err); }
  } catch (err) {
    if (window.handleAdminApiError?.(err, '관리자 인증이 만료되어 다시 로그인해 주세요.')) {
      if (window.__erpAutoRefreshTimer) {
        clearInterval(window.__erpAutoRefreshTimer);
        window.__erpAutoRefreshTimer = null;
      }
      return;
    }
    console.error('[Orders] 장부 조회 실패:', err);
    tbody.innerHTML = '<tr><td colspan="15" style="text-align:center; color:#ef4444; padding:20px;">장부 데이터를 불러오지 못했습니다.</td></tr>';
    return;
  }

  let sumTotal = 0, sumMargin = 0, sumUnpaid = 0;

  if (erpOrdersCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="15" style="text-align:center; padding:20px; color:#94a3b8;">등록된 오더가 없습니다.</td></tr>';
  } else {
    tbody.innerHTML = erpOrdersCache.map(o => {
      const m = calcOrderMoney(o);
      sumTotal += m.total;
      sumMargin += m.margin;
      if (o.payStatus !== '입금완료') sumUnpaid += m.total;

      const esc = window.escapeHtml;
      const id = encodeURIComponent(String(o.id || o._id || ''));
      const ratePct = Math.round((Number(o.feeRate) || 0) * 100);
      const dispatch = o.dispatchStatus || '배차대기';
      const pay = o.payStatus || '미수';
      const invoice = o.invoice || '발행전';

      return `
        <tr>
          <td style="white-space:nowrap;">${esc(o.date || '-')}</td>
          <td>${esc(o.company || '-')}<br><small style="color:#64748b;">${esc(o.clientTel || '')}</small></td>
          <td>${esc(o.locationName || '-')}</td>
          <td>${esc(o.driverName || '-')}</td>
          <td>${esc(o.craneType || '-')}<br><small style="color:#64748b;">${esc(o.workTime || '')}${o.nightWork === 'O' ? ' · 야간' : ''}</small></td>
          <td style="text-align:right;">${m.total.toLocaleString()}원</td>
          <td style="text-align:right;">${m.supply.toLocaleString()}원</td>
          <td style="text-align:right;">${m.vat.toLocaleString()}원</td>
          <td style="text-align:right;">${m.margin.toLocaleString()}원<br><small style="color:#64748b;">(${ratePct}%)</small></td>
          <td style="text-align:right;"><b>${m.driverPay.toLocaleString()}원</b></td>
          <td><button type="button" data-order-action="toggle" data-order-id="${id}" data-order-field="invoice" style="border:none; border-radius:4px; padding:4px 6px; cursor:pointer; background:${invoice === '발행완료' ? '#dcfce7' : '#f1f5f9'};">${esc(invoice)}</button></td>
          <td style="white-space:nowrap;">${esc(o.dueDate || '-')}</td>
          <td><button type="button" data-order-action="toggle" data-order-id="${id}" data-order-field="dispatchStatus" style="border:none; border-radius:4px; padding:4px 6px; cursor:pointer; background:${dispatch === '배차완료' ? '#dcfce7' : '#fef3c7'};">${esc(dispatch)}</button></td>
          <td><button type="button" data-order-action="toggle" data-order-id="${id}" data-order-field="payStatus" style="border:none; border-radius:4px; padding:4px 6px; cursor:pointer; background:${pay === '입금완료' ? '#dcfce7' : '#fee2e2'};">${esc(pay)}</button></td>
          <td><button type="button" data-order-action="delete" data-order-id="${id}" style="background:#dc2626; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">삭제</button></td>
        </tr>
      `;
    }).join('');
  }

  const elTotal = document.getElementById('txtTotalSum');
  const elMargin = document.getElementById('txtMarginSum');
  const elUnpaid = document.getElementById('txtUnpaidSum');
  if (elTotal) elTotal.innerText = `${sumTotal.toLocaleString()}원`;
  if (elMargin) elMargin.innerText = `${sumMargin.toLocaleString()}원`;
  if (elUnpaid) elUnpaid.innerText = `${sumUnpaid.toLocaleString()}원`;

  bindOrderTableEvents();
  window.calculateDriverSettlement();
};

// 🔁 5. 상태 토글 (배차상태 / 입금여부 / 계산서) — 서버 허용 필드만 사용
const ORDER_FIELD_CYCLES = {
  dispatchStatus: ['배차대기', '배차완료'],
  payStatus: ['미수', '입금완료'],
  invoice: ['발행전', '발행완료', '미발행']
};

window.toggleOrderField = async function (encodedId, field) {
  const cycle = ORDER_FIELD_CYCLES[field];
  if (!cycle) return;
  const id = decodeURIComponent(encodedId);
  const order = erpOrdersCache.find(o => String(o.id) === id || String(o._id) === id);
  if (!order) return;

  const currentIndex = cycle.indexOf(order[field]);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % cycle.length : 0;
  const nextValue = cycle[nextIndex];

  try {
    const res = await fetch(`/api/admin/orders/${encodeURIComponent(id)}/${field}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ordersToken()}` },
      body: JSON.stringify({ value: nextValue })
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result.success === false) throw new Error(result.error || `HTTP ${res.status}`);
    await window.renderERPGrid();
  } catch (err) {
    console.error('[Orders] 상태 변경 실패:', err);
    window.safeToast('상태 변경에 실패했습니다.', 'error');
  }
};

// 🗑️ 6. 오더 삭제
window.deleteOrder = async function (encodedId) {
  if (!confirm('해당 오더를 장부에서 삭제하시겠습니까?')) return;
  try {
    const id = decodeURIComponent(encodedId);
    const res = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ordersToken()}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    window.safeToast('오더가 삭제되었습니다.', 'warning');
    await window.renderERPGrid();
  } catch (err) {
    console.error('[Orders] 오더 삭제 실패:', err);
    window.safeToast('삭제에 실패했습니다.', 'error');
  }
};

// 👷 7. 기사별 정산 요약 (기사명 검색 즉시 계산)
window.calculateDriverSettlement = function () {
  const keyword = (document.getElementById('driverCalcSearch')?.value || '').trim();
  const elCount = document.getElementById('driverTotalCount');
  const elPayout = document.getElementById('driverTotalPayout');
  if (!elCount || !elPayout) return;

  if (!keyword) {
    elCount.innerText = '0건';
    elPayout.innerText = '0원';
    return;
  }

  const mine = erpOrdersCache.filter(o => String(o.driverName || '').includes(keyword));
  const payout = mine.reduce((sum, o) => sum + calcOrderMoney(o).driverPay, 0);
  elCount.innerText = `${mine.length}건`;
  elPayout.innerText = `${payout.toLocaleString()}원`;
};

// 💾 8. CSV(엑셀) 다운로드 — 한글 깨짐 방지 BOM + 수식 인젝션 문자 소독
function sanitizeCsvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

window.saveToCSV = function () {
  if (!erpOrdersCache.length) {
    window.safeToast('다운로드할 장부 데이터가 없습니다.', 'warning');
    return;
  }

  const header = ['날짜', '거래처', '연락처', '현장명', '기사명', '기종', '작업시간', '야간', '청구액', '실비', '공급가액', '부가세', '더원마진', '기사지급액', '계산서', '입금예정일', '배차상태', '입금여부'];
  const rows = erpOrdersCache.map(o => {
    const m = calcOrderMoney(o);
    return [o.date, o.company, o.clientTel, o.locationName, o.driverName, o.craneType, o.workTime, o.nightWork,
      m.total, m.extra, m.supply, m.vat, m.margin, m.driverPay, o.invoice, o.dueDate, o.dispatchStatus, o.payStatus]
      .map(sanitizeCsvCell).join(',');
  });

  const csv = '﻿' + [header.map(sanitizeCsvCell).join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `더원_정산장부_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
  window.safeToast('정산 장부 CSV가 다운로드되었습니다.', 'success');
};

// 호환 별칭 (다른 모듈에서 loadOrders 이름으로 호출)
window.loadOrders = window.renderERPGrid;

window.startAutoRefresh = function () {
  if (window.__erpAutoRefreshTimer) return;
  if (!window.isAdminSessionActive?.()) return;
  window.__erpAutoRefreshTimer = window.setInterval(() => {
    if (typeof window.renderERPGrid === 'function') window.renderERPGrid();
    if (typeof window.renderInboxRequests === 'function') window.renderInboxRequests();
    if (typeof window.renderInboxDrivers === 'function') window.renderInboxDrivers();
    if (typeof window.renderDriversPool === 'function') window.renderDriversPool();
  }, 10000);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.startAutoRefresh);
} else {
  window.startAutoRefresh();
}

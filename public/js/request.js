/* ==========================================================
   [더원크레인 스페어 시스템 V5.4] request.js
   - 날짜+시간(HH:mm) 표시
   - 가능기종/크레인타입 전방위 수집 및 호환
   - 등록/완료/삭제 버튼 전역 바인딩 완전 보장
========================================================== */

// 🔒 1. XSS 방지 HTML 소독
if (typeof window.escapeHtml !== 'function') {
  window.escapeHtml = function (str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };
}

// 🔒 2. 전화번호 안전 정제
if (typeof window.sanitizeTel !== 'function') {
  window.sanitizeTel = function (tel) {
    if (!tel) return '';
    return String(tel).replace(/[^0-9-]/g, '');
  };
}

// ⏰ 3. 날짜 + 시간(시:분) 추출 포맷터 (YYYY.MM.DD HH:mm)
function getFormattedDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}.${month}.${day} ${hours}:${minutes}`;
}

function formatDisplayDateTime(value, fallback = '-') {
  const raw = value === undefined || value === null ? '' : String(value).trim();
  if (!raw) return fallback;

  const compact = raw.replace(/[/]/g, '-').replace(/\s+/g, ' ').trim();
  const simpleMatch = compact.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})(?:\s+(\d{1,2})(?::?(\d{1,2}))?)?$/);
  if (simpleMatch) {
    const [, year, month, day, hour = '00', minute = '00'] = simpleMatch;
    return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  const dateParts = compact.match(/(\d{4})[^\d]*(\d{1,2})[^\d]*(\d{1,2})/);
  const meridiemMatch = compact.match(/(오전|오후)\s*(\d{1,2})(?:[:.]?(\d{1,2}))?/);
  if (dateParts) {
    const [, year, month, day] = dateParts;
    let hour = '00';
    let minute = '00';
    if (meridiemMatch) {
      const [, meridiem, hourRaw = '00', minuteRaw = '00'] = meridiemMatch;
      hour = String(Number(hourRaw) || 0).padStart(2, '0');
      minute = String(Number(minuteRaw) || 0).padStart(2, '0');
      if (meridiem === '오후' && Number(hour) < 12) hour = String(Number(hour) + 12).padStart(2, '0');
      if (meridiem === '오전' && Number(hour) === 12) hour = '00';
    }
    return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')} ${hour}:${minute}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    return `${year}.${month}.${day} ${hours}:${minutes}`;
  }

  return raw;
}

// 🔒 4. Safe Toast 알림
function safeToast(msg, type = 'info') {
  try {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    } else if (typeof showToast === 'function') {
      showToast(msg, type);
    } else {
      alert(msg);
    }
  } catch (e) {
    alert(msg);
  }
}

// 🔒 5. Safe LocalStorage 읽기/쓰기
function getSafeStorage(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error(`[Request] Storage 읽기 오류 [${key}]:`, err);
    return [];
  }
}

function setSafeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error(`[Request] Storage 저장 오류 [${key}]:`, err);
    return false;
  }
}

// 📱 6. 전화번호 유효성 검사
function isValidTel(tel) {
  const clean = window.sanitizeTel(tel).replace(/-/g, '');
  return clean.length >= 8;
}

// 🎯 7. 가능기종(크레인 종류) 폼 내부 자동 추출 유틸리티
function extractCraneType(formEl, isDriver = false) {
  if (!formEl) return '';
 
  // 1차: ID 기반 찾기
  const ids = isDriver
    ? ['regType', 'regCraneType', 'regPossibleType', 'regCrane', 'driverType', 'craneType']
    : ['reqType', 'reqCraneType', 'reqPossibleType', 'reqCrane', 'equipment', 'craneType'];

  for (const id of ids) {
    const el = document.getElementById(id) || formEl.querySelector(`#${id}`);
    if (el && el.value && el.value.trim() !== '') {
      return el.value.trim();
    }
  }

  // 2차: name 속성 기반 찾기
  const names = ['craneType', 'type', 'possibleType', 'crane', 'equipment', 'spec'];
  for (const name of names) {
    const el = formEl.querySelector(`[name="${name}"]`);
    if (el && el.value && el.value.trim() !== '') {
      return el.value.trim();
    }
  }

  // 3차: form 내부 첫 번째 select 태그 검색
  const selectEl = formEl.querySelector('select');
  if (selectEl && selectEl.value && selectEl.value.trim() !== '') {
    return selectEl.value.trim();
  }

  return '';
}

// 🚀 8. 폼 제출 처리 (시간 포함 및 가능기종 완전 수집)
window.handleFormSubmit = async function (e, type) {
  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault();
  }

  const form = e?.target || e?.form;
  const submitBtn = form?.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const currentDateTime = getFormattedDateTime();

    if (type === 'request') {
      const company = document.getElementById('reqCompany')?.value?.trim() || form?.querySelector('[name="company"]')?.value?.trim() || '';
      const name = document.getElementById('reqName')?.value?.trim() || form?.querySelector('[name="name"]')?.value?.trim() || '';
      const tel = document.getElementById('reqTel')?.value?.trim() || form?.querySelector('[name="tel"]')?.value?.trim() || '';
      const craneType = extractCraneType(form, false);
      const memo = document.getElementById('reqMemo')?.value?.trim() || form?.querySelector('[name="memo"]')?.value?.trim() || '';
      const privacyCheck = document.getElementById('reqPrivacyCheck')?.checked ?? form?.querySelector('input[type="checkbox"]')?.checked;

      if (!company || !name || !tel) {
        safeToast("회사명, 성함, 연락처를 모두 입력해 주세요.", "warning");
        return;
      }

      if (!isValidTel(tel)) {
        safeToast("올바른 전화번호 형식으로 입력해 주세요.", "warning");
        return;
      }

      if (privacyCheck === false) {
        safeToast("개인정보 수집·이용 동의에 체크해 주세요.", "warning");
        return;
      }

      const newItem = {
        id: Date.now(),
        date: currentDateTime, // 날짜 + 시간 저장
        company,
        name,
        tel: window.sanitizeTel(tel),
        craneType: craneType || '미지정',
        type: craneType || '미지정',
        possibleType: craneType || '미지정',
        memo
      };

      try {
        await fetch('/api/inbox/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newItem)
        });
      } catch (err) {
        console.warn("[Request] 오프라인 모드로 저장합니다.", err);
      }

      const list = getSafeStorage('crane_requests');
      list.unshift(newItem);
      setSafeStorage('crane_requests', list);

      safeToast("기사 배치 요청이 성공적으로 접수되었습니다.", "success");
      if (form && typeof form.reset === 'function') form.reset();

      window.renderInboxRequests();

    } else if (type === 'driver') {
      const name = document.getElementById('regName')?.value?.trim() || form?.querySelector('[name="name"]')?.value?.trim() || '';
      const tel = document.getElementById('regTel')?.value?.trim() || form?.querySelector('[name="tel"]')?.value?.trim() || '';
      const craneType = extractCraneType(form, true);
      const cert = document.getElementById('regCert')?.value?.trim() || form?.querySelector('[name="cert"]')?.value?.trim() || '';
      const memo = document.getElementById('regMemo')?.value?.trim() || form?.querySelector('[name="memo"]')?.value?.trim() || '';
      const privacyCheck = document.getElementById('regPrivacyCheck')?.checked ?? form?.querySelector('input[type="checkbox"]')?.checked;

      if (!name || !tel) {
        safeToast("성함과 연락처를 반드시 입력해주세요.", "warning");
        return;
      }

      if (!isValidTel(tel)) {
        safeToast("올바른 전화번호 형식으로 입력해 주세요.", "warning");
        return;
      }

      if (privacyCheck === false) {
        safeToast("개인정보 수집·이용 동의에 체크해 주세요.", "warning");
        return;
      }

      const resolvedType = craneType || '미지정';
      const newItem = {
        id: Date.now(),
        date: currentDateTime, // 날짜 + 시간 저장
        name,
        tel: window.sanitizeTel(tel),
        type: resolvedType,
        craneType: resolvedType,
        possibleType: resolvedType,
        regType: resolvedType,
        driverType: resolvedType,
        cert,
        memo
      };

      try {
        await fetch('/api/inbox/driver', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newItem)
        });
      } catch (err) {
        console.warn("[Request] 오프라인 모드로 저장합니다.", err);
      }

      const list = getSafeStorage('crane_drivers');
      list.unshift(newItem);
      setSafeStorage('crane_drivers', list);

      safeToast("스페어 기사 신청 등록이 완료되었습니다.", "success");
      if (form && typeof form.reset === 'function') form.reset();

      window.renderInboxDrivers();
    }
  } catch (err) {
    console.error("[Request] 폼 제출 에러:", err);
    safeToast("처리 중 오류가 발생했습니다.", "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
};

// 📊 9. 수신함 - 기사 배치 요청 내역 렌더링
window.renderInboxRequests = function () {
  try {
    const tbody = document.getElementById('inboxRequestGrid');
    if (!tbody) return;

    const reqs = getSafeStorage('crane_requests');
    const countSpan = document.getElementById('txtReqCount');
    if (countSpan) countSpan.innerText = `${Array.isArray(reqs) ? reqs.length : 0}건`;

    tbody.innerHTML = '';

    if (!Array.isArray(reqs) || reqs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">접수된 기사 요청 내역이 없습니다.</td></tr>';
      return;
    }

    reqs.forEach(r => {
      const safeDate = window.escapeHtml(formatDisplayDateTime(r.date || r.time || r.createdAt || r.regDate || getFormattedDateTime()));
      const safeCompany = window.escapeHtml(r.company || '-');
      const safeName = window.escapeHtml(r.name || '-');
      const safeTel = window.escapeHtml(r.tel || '-');
      const cleanTel = window.sanitizeTel(r.tel);
     
      // 모든 필드 조합하여 가능기종 탐색
      const rawType = r.craneType || r.type || r.possibleType || r.reqType || r.equipment || r.crane || '-';
      const safeType = window.escapeHtml(rawType);
      const safeMemo = window.escapeHtml(r.memo || '-');
      const safeId = window.escapeHtml(String(r.id));

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="white-space:nowrap; font-size:13px; color:#64748b;">${safeDate}</td>
        <td><b>${safeCompany}</b></td>
        <td>${safeName}</td>
        <td><a href="tel:${cleanTel}" style="color:#2563eb; text-decoration:underline; font-weight:600;">${safeTel}</a></td>
        <td><span style="background:#eff6ff; color:#1e40af; padding:4px 8px; border-radius:4px; font-weight:bold; font-size:13px;">${safeType}</span></td>
        <td>${safeMemo}</td>
        <td style="white-space:nowrap;">
          <button onclick="window.deleteRequest('${safeId}')" style="background:#dc2626; color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:bold;">
            접수완료/삭제
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("[Request] renderInboxRequests 오류:", err);
  }
};

// 📊 10. 수신함 - 스페어 기사 신청 내역 렌더링
window.renderInboxDrivers = function () {
  try {
    const tbody = document.getElementById('inboxDriverGrid');
    if (!tbody) return;

    const drivers = getSafeStorage('crane_drivers');
    const countSpan = document.getElementById('txtDriverCount');
    if (countSpan) countSpan.innerText = `${Array.isArray(drivers) ? drivers.length : 0}건`;

    tbody.innerHTML = '';

    if (!Array.isArray(drivers) || drivers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">등록된 기사 신청 내역이 없습니다.</td></tr>';
      return;
    }

    drivers.forEach(d => {
      const safeDate = window.escapeHtml(formatDisplayDateTime(d.date || d.time || d.createdAt || d.regDate || getFormattedDateTime()));
      const safeName = window.escapeHtml(d.name || '-');
      const safeTel = window.escapeHtml(d.tel || '-');
      const cleanTel = window.sanitizeTel(d.tel);

      // 모든 필드 조합하여 가능기종 탐색
      const rawType = d.type || d.craneType || d.possibleType || d.regType || d.driverType || d.equipment || d.crane || '-';
      const safeType = window.escapeHtml(rawType);
      const safeCert = window.escapeHtml(d.cert || '-');
      const safeMemo = window.escapeHtml(d.memo || '-');
      const safeId = window.escapeHtml(String(d.id));

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="white-space:nowrap; font-size:13px; color:#64748b;">${safeDate}</td>
        <td><b>${safeName}</b></td>
        <td><a href="tel:${cleanTel}" style="color:#2563eb; text-decoration:underline; font-weight:600;">${safeTel}</a></td>
        <td><span style="background:#eff6ff; color:#1e40af; padding:4px 8px; border-radius:4px; font-weight:bold; font-size:13px;">${safeType}</span></td>
        <td>${safeCert}</td>
        <td>${safeMemo}</td>
        <td style="white-space:nowrap;">
          <button onclick="window.registerDriver('${safeId}')" style="background:#10b981; color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:bold; margin-right:4px;">
            등록
          </button>
          <button onclick="window.deleteDriver('${safeId}')" style="background:#dc2626; color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:bold;">
            삭제
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("[Request] renderInboxDrivers 오류:", err);
  }
};

// 📌 11. 정식 기사 명단(인력풀) 등록 기능
window.registerDriver = function (id) {
  try {
    let drivers = getSafeStorage('crane_drivers');
    const target = drivers.find(d => String(d.id) === String(id));

    if (!target) {
      safeToast("해당 기사 신청 정보를 찾을 수 없습니다.", "error");
      return;
    }

    if (!confirm(`[${target.name}] 기사님을 정식 인력풀 명단에 등록하시겠습니까?`)) return;

    const resolvedType = target.type || target.craneType || target.possibleType || target.equipment || '미지정';

    // 정식 인력풀 스토리지에 추가
    let registeredPool = getSafeStorage('crane_registered_drivers');
    const exists = registeredPool.some(p => String(p.id) === String(id) || p.tel === target.tel);

    if (!exists) {
      registeredPool.unshift({
        ...target,
        type: resolvedType,
        craneType: resolvedType,
        registeredAt: getFormattedDateTime(),
        status: '활동중'
      });
      setSafeStorage('crane_registered_drivers', registeredPool);
    }

    // 신청함에서 제거
    drivers = drivers.filter(d => String(d.id) !== String(id));
    setSafeStorage('crane_drivers', drivers);

    // 화면 동시 갱신
    window.renderInboxDrivers();
    if (typeof window.renderDrivers === 'function') window.renderDrivers();

    safeToast(`[${target.name}] 기사님이 정식 명단에 등록되었습니다.`, "success");
  } catch (err) {
    console.error("[Request] registerDriver 오류:", err);
    safeToast("등록 처리 중 오류가 발생했습니다.", "error");
  }
};

// 🗑️ 12. 기사 배치 요청 건 삭제
window.deleteRequest = function (id) {
  if (!confirm("해당 기사 요청 건을 삭제/완료 처리하시겠습니까?")) return;
  let reqs = getSafeStorage('crane_requests');
  reqs = reqs.filter(r => String(r.id) !== String(id));
  setSafeStorage('crane_requests', reqs);
  window.renderInboxRequests();
  safeToast("삭제되었습니다.", "warning");
};

// 🗑️ 13. 기사 신청 건 삭제
window.deleteDriver = function (id) {
  if (!confirm("해당 기사 신청 건을 삭제하시겠습니까?")) return;
  let drivers = getSafeStorage('crane_drivers');
  drivers = drivers.filter(d => String(d.id) !== String(id));
  setSafeStorage('crane_drivers', drivers);
  window.renderInboxDrivers();
  safeToast("삭제되었습니다.", "warning");
};

// 🔗 14. HTML 버튼 이벤트 다중 바인딩 (이름 불일치 방지용 Alias)
window.deleteReq = window.deleteRequest;
window.completeRequest = window.deleteRequest;
window.approveDriver = window.registerDriver;
window.removeDriver = window.deleteDriver;

// 🎧 15. DOM 준비 및 로드 즉시 초기화
function initRequestModule() {
  window.renderInboxRequests();
  window.renderInboxDrivers();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRequestModule);
} else {
  initRequestModule();
}

/* Server-backed inbox overrides. Do not keep contact information in a visitor's local storage. */
function adminToken() {
  return window.getAdminToken?.() || sessionStorage.getItem('theone_secure_token') || '';
}

function createInboxCell(text, options = {}) {
  const cell = document.createElement('td');
  if (options.bold) {
    const strong = document.createElement('strong');
    strong.textContent = text || '-';
    cell.appendChild(strong);
  } else if (options.phone) {
    const link = document.createElement('a');
    link.href = `tel:${window.sanitizeTel(text || '')}`;
    link.textContent = text || '-';
    cell.appendChild(link);
  } else {
    cell.textContent = text || '-';
  }
  return cell;
}

function renderEmptyInbox(tbody, message) {
  tbody.innerHTML = '';
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = 7;
  cell.textContent = message;
  cell.style.cssText = 'text-align:center; padding:24px; color:#94a3b8;';
  row.appendChild(cell);
  tbody.appendChild(row);
}

window.handleFormSubmit = async function (event, formType) {
  event?.preventDefault?.();
  const form = event?.target;
  const submitButton = form?.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  const isRequest = formType === 'request';
  const payload = isRequest
    ? { company: document.getElementById('reqCompany')?.value.trim() || '', name: document.getElementById('reqName')?.value.trim() || '', tel: document.getElementById('reqTel')?.value.trim() || '', type: document.getElementById('reqType')?.value || '', memo: document.getElementById('reqMemo')?.value.trim() || '' }
    : { name: document.getElementById('regName')?.value.trim() || '', tel: document.getElementById('regTel')?.value.trim() || '', type: document.getElementById('regType')?.value || '', cert: document.getElementById('regCert')?.value.trim() || '', memo: document.getElementById('regMemo')?.value.trim() || '' };
  const consent = document.getElementById(isRequest ? 'reqPrivacyCheck' : 'regPrivacyCheck')?.checked;
  try {
    if (!payload.name || !payload.tel || !payload.type || !isValidTel(payload.tel)) throw new Error('성함, 올바른 연락처, 기종을 모두 확인해 주세요.');
    if (!consent) throw new Error('개인정보 수집·이용 동의가 필요합니다.');
    const response = await fetch(isRequest ? '/api/inbox/request' : '/api/inbox/driver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || '접수 저장에 실패했습니다.');
    form?.reset?.();
    safeToast(isRequest ? '기사 요청이 접수되었습니다. 확인 후 신속히 안내드리겠습니다.' : '기사 등록 신청이 접수되었습니다. 확인 후 안내드리겠습니다.', 'success');
  } catch (error) {
    console.error('[Request] submit failed:', error);
    safeToast(error.message || '처리 중 오류가 발생했습니다.', 'error');
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
};

window.renderInboxRequests = async function () {
  const tbody = document.getElementById('inboxRequestGrid');
  if (!tbody || !adminToken() || !window.isAdminSessionActive?.()) return;
  try {
    const response = await fetch('/api/inbox/request', { headers: { Authorization: `Bearer ${adminToken()}` } });
    if (!response.ok) {
      const err = new Error('요청 목록을 불러오지 못했습니다.');
      err.status = response.status;
      throw err;
    }
    const list = await response.json();
    const count = document.getElementById('txtReqCount');
    if (count) count.textContent = `${list.length}건`;
    if (!list.length) return renderEmptyInbox(tbody, '접수된 기사 요청이 없습니다.');
    tbody.innerHTML = '';
    list.forEach((item) => {
      const row = document.createElement('tr');
      row.append(createInboxCell(formatDisplayDateTime(item.time || item.date || item.createdAt || item.regDate || '-')));
      row.append(createInboxCell(item.company, { bold: true }));
      row.append(createInboxCell(item.name)); row.append(createInboxCell(item.tel, { phone: true })); row.append(createInboxCell(item.type)); row.append(createInboxCell(item.memo));
      const actions = document.createElement('td'); const button = document.createElement('button'); button.type = 'button'; button.textContent = '완료 처리'; button.className = 'inbox-action'; button.addEventListener('click', () => window.deleteRequest(item.id)); actions.appendChild(button); row.appendChild(actions); tbody.appendChild(row);
    });
  } catch (error) {
    if (window.handleAdminApiError?.(error, '관리자 인증이 만료되어 다시 로그인해 주세요.')) {
      return;
    }
    renderEmptyInbox(tbody, '요청 목록을 불러오지 못했습니다.');
  }
};

window.renderInboxDrivers = async function () {
  const tbody = document.getElementById('inboxDriverGrid');
  if (!tbody || !adminToken() || !window.isAdminSessionActive?.()) return;
  try {
    const response = await fetch('/api/inbox/driver', { headers: { Authorization: `Bearer ${adminToken()}` } });
    if (!response.ok) {
      const err = new Error('기사 목록을 불러오지 못했습니다.');
      err.status = response.status;
      throw err;
    }
    const list = await response.json();
    const count = document.getElementById('txtRegCount');
    if (count) count.textContent = `${list.length}건`;
    if (!list.length) return renderEmptyInbox(tbody, '접수된 기사 등록이 없습니다.');
    tbody.innerHTML = '';
    list.forEach((item) => {
      const row = document.createElement('tr');
      row.append(createInboxCell(formatDisplayDateTime(item.time || item.date || item.createdAt || item.regDate || '-'))); row.append(createInboxCell(item.name, { bold: true })); row.append(createInboxCell(item.tel, { phone: true })); row.append(createInboxCell(item.type)); row.append(createInboxCell(item.cert)); row.append(createInboxCell(item.memo));
      const actions = document.createElement('td');
      [['승인', 'inbox-action approve', () => window.registerDriver(item.id)], ['거절', 'inbox-action reject', () => window.deleteDriver(item.id)]].forEach(([label, className, action]) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.className = className; button.addEventListener('click', action); actions.appendChild(button); });
      row.appendChild(actions); tbody.appendChild(row);
    });
  } catch (error) {
    if (window.handleAdminApiError?.(error, '관리자 인증이 만료되어 다시 로그인해 주세요.')) {
      return;
    }
    renderEmptyInbox(tbody, '기사 목록을 불러오지 못했습니다.');
  }
};

window.deleteRequest = async function (id) {
  if (!confirm('이 요청을 완료 처리하시겠습니까?')) return;
  try {
    const response = await fetch(`/api/admin/inbox/request/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken()}` }
    });
    if (response.status === 401 || response.status === 403) {
      const err = new Error('관리자 인증이 필요합니다.');
      err.status = response.status;
      throw err;
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || '처리 실패');

    safeToast('완료 처리했습니다. 종합정산 등록 화면으로 이동합니다.', 'success');

    if (typeof window.renderInboxRequests === 'function') await window.renderInboxRequests();
    if (typeof window.switchAdminTab === 'function') {
      window.switchAdminTab('erp');
    }

    const target = result?.data || null;
    if (target) {
      const fill = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value || '';
      };
      fill('clientCompany', target.company || '');
      fill('clientTel', target.clientTel || target.tel || '');
      fill('locationName', target.locationName || target.memo || '');
      fill('driverName', target.driverName || target.name || '');
      fill('craneType', target.craneType || target.type || '');
      fill('workTime', target.workTime || '');
      fill('nightWork', target.nightWork || 'X');
      fill('extraExpenses', target.extraExpenses || 0);
      fill('totalAmount', target.totalAmount || 0);
      fill('feeRate', target.feeRate || 0.03);
      fill('taxInvoice', target.invoice || '발행전');
      fill('dueDate', target.dueDate || '');
      const dateEl = document.getElementById('orderDate');
      if (dateEl && !dateEl.value) {
        const today = new Date().toISOString().slice(0, 10);
        dateEl.value = today;
      }
      const noteEl = document.getElementById('erpNote');
      if (noteEl) noteEl.value = `문의 완료 처리된 항목: ${target.company || target.name || ''}`;
    }
  } catch (error) {
    if (window.handleAdminApiError?.(error, '관리자 인증이 만료되어 다시 로그인해 주세요.')) {
      return;
    }
    console.error('[Request] complete failed:', error);
    safeToast('처리에 실패했습니다.', 'error');
  }
};
window.registerDriver = async function (id) {
  if (!confirm('이 기사님을 정식 인력풀에 등록하시겠습니까?')) return;
  try {
    const response = await fetch('/api/admin/approve-driver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken()}` },
      body: JSON.stringify({ id })
    });
    if (!response.ok) {
      const err = new Error('승인 실패');
      err.status = response.status;
      throw err;
    }
    safeToast('정식 인력풀에 등록했습니다.', 'success');
    await window.renderInboxDrivers();
    if (typeof window.renderDriversPool === 'function') {
      await window.renderDriversPool();
    }
  } catch (error) {
    if (window.handleAdminApiError?.(error, '관리자 인증이 만료되어 다시 로그인해 주세요.')) {
      return;
    }
    safeToast('승인 처리에 실패했습니다.', 'error');
  }
};
window.deleteDriver = async function (id) {
  if (!confirm('이 기사 등록을 거절하시겠습니까?')) return;
  try {
    const response = await fetch(`/api/admin/inbox/driver/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken()}` } });
    if (!response.ok) {
      const err = new Error('거절 실패');
      err.status = response.status;
      throw err;
    }
    safeToast('거절 처리했습니다.', 'success');
    await window.renderInboxDrivers();
  } catch (error) {
    if (window.handleAdminApiError?.(error, '관리자 인증이 만료되어 다시 로그인해 주세요.')) {
      return;
    }
    safeToast('처리에 실패했습니다.', 'error');
  }
};
window.approveDriver = window.registerDriver;
// 서버 연동 최종 버전으로 별칭 재바인딩
// (파일 상단 14번 항목의 별칭은 localStorage 구버전을 가리키므로 여기서 덮어쓴다)
window.deleteReq = window.deleteRequest;
window.completeRequest = window.deleteRequest;
window.removeDriver = window.deleteDriver;

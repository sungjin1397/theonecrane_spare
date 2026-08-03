/* ==========================================================
   [더원크레인 스페어 시스템 V5.3] 렌탈 및 차주 관리 모듈 (rental.js)
   - 20가지 안전·보안 검수 항목 완벽 수정 적용본
========================================================== */

// 🔒 1. XSS 방지 HTML 소독 함수
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 🔒 2. 전화번호 안전 정제 (숫자 및 하이픈만 허용)
function sanitizeTel(tel) {
  if (!tel) return '';
  return String(tel).replace(/[^0-9-]/g, '');
}

// 🔒 3. 현지 타임존(KST) 기준 날짜 추출 (YYYY-MM-DD)
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 🔒 4. 날짜+시간 포맷터 (YYYY.MM.DD HH:mm)
function formatDisplayDateTime(value, fallback = '-') {
  const raw = value === undefined || value === null ? '' : String(value).trim();
  if (!raw) return fallback;

  const compact = raw.replace(/\//g, '-').replace(/\s+/g, ' ').trim();
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

// 🔒 5. Safe Toast 알림 래퍼
function safeToast(msg, type = 'info') {
  if (typeof window.showToast === 'function') {
    window.showToast(msg, type);
  } else if (typeof showToast === 'function') {
    showToast(msg, type);
  } else {
    alert(msg);
  }
}

// 🔒 5. Safe LocalStorage 읽기/쓰기 (예외 방지)
function getSafeStorage(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error(`[Rental] Storage 읽기 오류 [${key}]:`, err);
    return [];
  }
}

function setSafeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error(`[Rental] Storage 저장 오류 [${key}]:`, err);
    return false;
  }
}

// 📱 6. 전화번호 유효성 검사 (숫자 8자리 이상)
function isValidTel(tel) {
  const clean = sanitizeTel(tel).replace(/-/g, '');
  return clean.length >= 8;
}

// 🔄 7. 렌탈 탭 전환 및 버튼 .active 상태 동기화
window.showRentalTab = function (tabName) {
  const tabs = document.querySelectorAll('.rental-tab');
  tabs.forEach(t => t.style.display = 'none');

  const target = document.getElementById(`rental-content-${tabName}`);
  if (target) target.style.display = 'block';

  // 탭 버튼 active 클래스 처리
  const btns = document.querySelectorAll('.rental-tab-btn');
  btns.forEach(btn => {
    if (btn.getAttribute('data-tab') === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
};

// 🚀 8. 크레인 렌탈 요청 / 차주 등록 제출 처리 (하이브리드: API + LocalStorage 폴백)
window.handleRentalSubmit = async function(e, type) {
  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault();
  }

  const form = e?.target;
  const submitBtn = form?.querySelector('button[type="submit"]');
 
  // 다중 클릭 방지
  if (submitBtn) submitBtn.disabled = true;

  try {
    if (type === 'request') {
      const company = document.getElementById('rentalCompany')?.value.trim() || '';
      const name = document.getElementById('rentalName')?.value.trim() || '';
      const tel = document.getElementById('rentalTel')?.value.trim() || '';
      const craneType = document.getElementById('rentalCraneType')?.value || '';
      const memo = document.getElementById('rentalMemo')?.value.trim() || '';

      if (!name || !tel) {
        safeToast('담당자 성함과 연락처는 필수 입력 사항입니다.', 'warning');
        return;
      }

      if (!isValidTel(tel)) {
        safeToast('올바른 전화번호 형식으로 입력해 주세요.', 'warning');
        return;
      }

      const newItem = {
        id: Date.now(),
        date: getTodayDateString(),
        company,
        name,
        tel: sanitizeTel(tel),
        craneType,
        memo
      };

      try {
        await fetch('/api/rental/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newItem)
        });
      } catch (err) {
        console.warn('[Rental] API 통신 실패, 오프라인 모드로 저장합니다.', err);
      }

      // API 성공 여부와 상관없이 로컬 스토리지 데이터 백업 및 보장
      const list = getSafeStorage('crane_rental_requests');
      list.unshift(newItem);
      setSafeStorage('crane_rental_requests', list);

      safeToast('렌탈 요청이 성공적으로 접수되었습니다.', 'success');
      if (form && typeof form.reset === 'function') form.reset();
     
      if (typeof window.loadRentalAdminData === 'function') {
        window.loadRentalAdminData();
      }

    } else if (type === 'register') {
      const name = document.getElementById('regOwnerName')?.value.trim() || '';
      const tel = document.getElementById('regOwnerTel')?.value.trim() || '';
      const craneType = document.getElementById('regOwnerCraneType')?.value || '';
      const loc = document.getElementById('regOwnerLoc')?.value.trim() || '';
      const memo = document.getElementById('regOwnerMemo')?.value.trim() || '';

      if (!name || !tel) {
        safeToast('성함과 연락처는 필수 입력 사항입니다.', 'warning');
        return;
      }

      if (!isValidTel(tel)) {
        safeToast('올바른 전화번호 형식으로 입력해 주세요.', 'warning');
        return;
      }

      const newItem = {
        id: Date.now(),
        date: getTodayDateString(),
        name,
        tel: sanitizeTel(tel),
        craneType,
        loc,
        memo
      };

      try {
        await fetch('/api/rental/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newItem)
        });
      } catch (err) {
        console.warn('[Rental] API 통신 실패, 오프라인 모드로 저장합니다.', err);
      }

      // 로컬 스토리지 백업
      const list = getSafeStorage('crane_rental_owners');
      list.unshift(newItem);
      setSafeStorage('crane_rental_owners', list);

      safeToast('렌탈 차주 등록 신청이 완료되었습니다.', 'success');
      if (form && typeof form.reset === 'function') form.reset();

      if (typeof window.loadRentalAdminData === 'function') {
        window.loadRentalAdminData();
      }
    }
  } catch (err) {
    console.error('[Rental] 제출 처리 중 오류 발생:', err);
    safeToast('처리에 실패하였습니다. 다시 시도해 주세요.', 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
};

// 📊 9. 관리자 렌탈 데이터 목록 렌더링
window.loadRentalAdminData = function () {
  // 1. 고객 렌탈 요청 내역
  const reqs = getSafeStorage('crane_rental_requests');
  const reqGrid = document.getElementById('adminRentalReqGrid');
  if (reqGrid) {
    reqGrid.innerHTML = '';
   
    if (!Array.isArray(reqs) || reqs.length === 0) {
      reqGrid.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">접수된 렌탈 요청이 없습니다.</td></tr>';
    } else {
      reqs.forEach(r => {
        const safeDate = escapeHtml(formatDisplayDateTime(r.date || r.time || r.createdAt || r.regDate || getTodayDateString()));
        const safeCompany = escapeHtml(r.company || '-');
        const safeName = escapeHtml(r.name || '-');
        const safeTel = escapeHtml(r.tel || '-');
        const cleanTel = sanitizeTel(r.tel);
        const safeType = escapeHtml(r.craneType || '-');
        const safeMemo = escapeHtml(r.memo || '-');
        const safeId = escapeHtml(String(r.id));

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${safeDate}</td>
          <td>${safeCompany}</td>
          <td><b>${safeName}</b></td>
          <td><a href="tel:${cleanTel}" style="color:#2563eb; text-decoration:underline;">${safeTel}</a></td>
          <td><b>${safeType}</b></td>
          <td>${safeMemo}</td>
          <td>
            <button onclick="deleteRentalReq('${safeId}')" style="background:#dc2626; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">
              삭제
            </button>
          </td>
        `;
        reqGrid.appendChild(tr);
      });
    }
  }

  // 2. 렌탈 차주 명단
  const owners = getSafeStorage('crane_rental_owners');
  const ownerGrid = document.getElementById('adminRentalRegGrid');
  if (ownerGrid) {
    ownerGrid.innerHTML = '';
   
    if (!Array.isArray(owners) || owners.length === 0) {
      ownerGrid.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">등록된 차주 명단이 없습니다.</td></tr>';
    } else {
      owners.forEach(o => {
        const safeDate = escapeHtml(formatDisplayDateTime(o.date || o.time || o.createdAt || o.regDate || getTodayDateString()));
        const safeName = escapeHtml(o.name || '-');
        const safeTel = escapeHtml(o.tel || '-');
        const cleanTel = sanitizeTel(o.tel);
        const safeType = escapeHtml(o.craneType || '-');
        const safeLoc = escapeHtml(o.loc || '-');
        const safeMemo = escapeHtml(o.memo || '-');
        const safeId = escapeHtml(String(o.id));

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${safeDate}</td> 
          <td><b>${safeName}</b></td>
          <td><a href="tel:${cleanTel}" style="color:#2563eb; text-decoration:underline;">${safeTel}</a></td>
          <td>${safeType}</td>
          <td>${safeLoc}</td>
          <td>${safeMemo}</td>
          <td>
            <button onclick="deleteRentalOwner('${safeId}')" style="background:#dc2626; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">
              삭제
            </button>
          </td>
        `;
        ownerGrid.appendChild(tr);
      });
    }
  }
};

// 🗑️ 10. 렌탈 요청 삭제 (String 기반 타입 안정성)
window.deleteRentalReq = function (id) {
  if (!confirm("해당 렌탈 요청 건을 삭제하시겠습니까?")) return;

  let list = getSafeStorage('crane_rental_requests');
  list = list.filter(r => String(r.id) !== String(id));
  setSafeStorage('crane_rental_requests', list);
 
  window.loadRentalAdminData();
  safeToast("삭제 완료되었습니다.", "warning");
};

// 🗑️ 11. 렌탈 차주 삭제 (String 기반 타입 안정성)
window.deleteRentalOwner = function (id) {
  if (!confirm("해당 차주 명단을 삭제하시겠습니까?")) return;

  let list = getSafeStorage('crane_rental_owners');
  list = list.filter(o => String(o.id) !== String(id));
  setSafeStorage('crane_rental_owners', list);

  window.loadRentalAdminData();
  safeToast("삭제 완료되었습니다.", "warning");
};

/*
 * Server-backed rental flow.
 * The earlier version referenced retired field IDs and silently saved personal data
 * only in a visitor's browser. Keep all rental records on the server instead.
 */
window.handleRentalSubmit = async function (event, formType) {
  event?.preventDefault?.();
  const form = event?.target;
  const submitButton = form?.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  const isRequest = formType === 'rental-req';
  const payload = isRequest
    ? {
        company: document.getElementById('rReqCompany')?.value.trim() || '',
        name: document.getElementById('rReqName')?.value.trim() || '',
        tel: document.getElementById('rReqTel')?.value.trim() || '',
        type: document.getElementById('rReqType')?.value.trim() || '',
        memo: document.getElementById('rReqMemo')?.value.trim() || ''
      }
    : {
        name: document.getElementById('rRegName')?.value.trim() || '',
        tel: document.getElementById('rRegTel')?.value.trim() || '',
        type: document.getElementById('rRegType')?.value.trim() || '',
        loc: document.getElementById('rRegLoc')?.value.trim() || '',
        memo: document.getElementById('rRegMemo')?.value.trim() || ''
      };

  if (!payload.name || !payload.tel || !payload.type || !isValidTel(payload.tel)) {
    safeToast('성함, 올바른 연락처, 장비 정보는 필수입니다.', 'warning');
    if (submitButton) submitButton.disabled = false;
    return;
  }

  try {
    const response = await fetch(isRequest ? '/api/rental/request' : '/api/rental/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || '접수 저장에 실패했습니다.');
    form?.reset?.();
    safeToast(isRequest ? '렌탈 요청이 접수되었습니다. 확인 후 안내드리겠습니다.' : '장비 등록 신청이 접수되었습니다. 확인 후 안내드리겠습니다.', 'success');
  } catch (error) {
    console.error('[Rental] submit failed:', error);
    safeToast(error.message || '서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.', 'error');
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
};

function getRentalToken() {
  return window.getAdminToken?.() || sessionStorage.getItem('theone_secure_token') || '';
}

function rentalRows(list, kind) {
  if (!Array.isArray(list) || list.length === 0) {
    return '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">접수된 내역이 없습니다.</td></tr>';
  }

  return list.map((item) => {
    const normalized = {
      date: formatDisplayDateTime(item?.time || item?.date || item?.createdAt || item?.regDate || '-'),
      company: item?.company || item?.companyName || '-',
      name: item?.name || item?.ownerName || '-',
      tel: item?.tel || '-',
      equipment: item?.type || item?.craneType || item?.equipment || '-',
      location: item?.loc || item?.location || item?.area || '-',
      detail: item?.memo || item?.detail || item?.description || '-'
    };

    const date = escapeHtml(normalized.date);
    const company = escapeHtml(normalized.company);
    const name = escapeHtml(normalized.name);
    const tel = escapeHtml(normalized.tel);
    const equipment = escapeHtml(normalized.equipment);
    const location = escapeHtml(normalized.location);
    const detail = escapeHtml(normalized.detail);
    const id = encodeURIComponent(String(item?.id || ''));
    const telHref = sanitizeTel(normalized.tel);

    if (kind === 'request') {
      return `<tr>
        <td>${date}</td>
        <td>${company}</td>
        <td><b>${name}</b></td>
        <td><a href="tel:${telHref}">${tel}</a></td>
        <td>${equipment}</td>
        <td>${detail}</td>
        <td><button type="button" class="rental-delete" onclick="deleteRentalRecord('${kind}', '${id}')">삭제</button></td>
      </tr>`;
    }

    return `<tr>
      <td>${date}</td>
      <td><b>${name}</b></td>
      <td><a href="tel:${telHref}">${tel}</a></td>
      <td>${equipment}</td>
      <td>${location}</td>
      <td>${detail}</td>
      <td><button type="button" class="rental-delete" onclick="deleteRentalRecord('${kind}', '${id}')">삭제</button></td>
    </tr>`;
  }).join('');
}

window.loadRentalAdminData = async function () {
  const token = getRentalToken();
  const requestGrid = document.getElementById('adminRentalReqGrid');
  const registerGrid = document.getElementById('adminRentalRegGrid');
  if (!requestGrid || !registerGrid) return;
  if (!token || !window.isAdminSessionActive?.()) {
    requestGrid.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">관리자 인증이 필요합니다.</td></tr>';
    registerGrid.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">관리자 인증이 필요합니다.</td></tr>';
    return;
  }
  try {
    const headers = { Authorization: `Bearer ${token}` };
    const [requestResponse, registerResponse] = await Promise.all([
      fetch('/api/rental/request', { headers }),
      fetch('/api/rental/register', { headers })
    ]);
    if (!requestResponse.ok || !registerResponse.ok) {
      const err = new Error('관리자 데이터 조회 권한이 없습니다.');
      err.status = (!requestResponse.ok ? requestResponse.status : registerResponse.status);
      throw err;
    }

    // 검색창 값으로 클라이언트측 필터링 (업체/성함, 기종, 지역)
    const filterList = (list, nameId, typeId, locId) => {
      const nameKey = (document.getElementById(nameId)?.value || '').trim().toLowerCase();
      const typeKey = (document.getElementById(typeId)?.value || '').trim();
      const locKey = (document.getElementById(locId)?.value || '').trim().toLowerCase();
      return (Array.isArray(list) ? list : []).filter(item => {
        const nameText = `${item.company || ''} ${item.name || ''}`.toLowerCase();
        const typeText = String(item.type || item.craneType || '');
        const locText = String(item.loc || item.memo || '').toLowerCase();
        return (!nameKey || nameText.includes(nameKey))
          && (!typeKey || typeText.includes(typeKey))
          && (!locKey || locText.includes(locKey));
      });
    };

    const requestList = filterList(await requestResponse.json(), 'rentalCompanySearch', 'rentalTypeSearch', 'rentalLocSearch');
    const registerList = filterList(await registerResponse.json(), 'rentalOwnerSearch', 'rentalOwnerType', 'rentalOwnerLoc');
    requestGrid.innerHTML = rentalRows(requestList, 'request');
    registerGrid.innerHTML = rentalRows(registerList, 'register');
  } catch (error) {
    if (window.handleAdminApiError?.(error, '관리자 인증이 만료되어 다시 로그인해 주세요.')) {
      return;
    }
    console.error('[Rental] admin load failed:', error);
    const message = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#ef4444;">렌탈 데이터를 불러오지 못했습니다.</td></tr>';
    requestGrid.innerHTML = message;
    registerGrid.innerHTML = message;
  }
};

window.deleteRentalRecord = async function (kind, encodedId) {
  if (!confirm('해당 접수 내역을 삭제하시겠습니까?')) return;
  const token = getRentalToken();
  try {
    const response = await fetch(`/api/admin/rental/${kind}/${decodeURIComponent(encodedId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      const err = new Error('삭제에 실패했습니다.');
      err.status = response.status;
      throw err;
    }
    safeToast('삭제했습니다.', 'success');
    await window.loadRentalAdminData();
  } catch (error) {
    if (window.handleAdminApiError?.(error, '관리자 인증이 만료되어 다시 로그인해 주세요.')) {
      return;
    }
    safeToast(error.message || '삭제에 실패했습니다.', 'error');
  }
};

// 🎧 12. DOM 준비 시 자동 초기화
document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.loadRentalAdminData === 'function') {
    window.loadRentalAdminData();
  }
});

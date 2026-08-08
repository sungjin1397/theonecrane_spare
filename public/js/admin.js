/* ==========================================================
   THE ONE CRANE SPARE - admin.js (20항목 완전 보완 및 최종 안정화 버전)
   ========================================================== */

// 🔑 스토리지 키 중앙 관리
const ADMIN_STORAGE_KEYS = {
  PRODUCTS: 'crane_products',
  DRIVERS: 'crane_registered_drivers'
};

window.USER_STORAGE_KEYS = window.USER_STORAGE_KEYS || {
  USERS: 'crane_users'
};

// 🔒 1. XSS 방지 소독 함수 (중복 선언 방지)
if (typeof window.escapeHtml !== 'function') {
  window.escapeHtml = function(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };
}

// 🔒 2. Safe URL 검증 함수 (javascript: 프로토콜 공격 차단)
if (typeof window.sanitizeUrl !== 'function') {
  window.sanitizeUrl = function(url) {
    if (!url) return '';
    const trimmed = String(url).trim();
    if (/^(javascript|data|vbscript):/i.test(trimmed)) {
      return '#';
    }
    return window.escapeHtml(trimmed);
  };
}

// 🔒 3. Safe Toast 알림 래퍼
if (typeof window.safeToast !== 'function') {
  window.safeToast = function(msg, type = 'info') {
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
  };
}

// 🔒 4. 전화번호 숫자 정제 유틸리티
if (typeof window.sanitizeTel !== 'function') {
  window.sanitizeTel = function(tel) {
    if (!tel) return '';
    return String(tel).replace(/[^0-9]/g, '');
  };
}

window.formatDisplayDateTime = function (value, fallback = '-') {
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
    const hour = String(parsed.getHours()).padStart(2, '0');
    const minute = String(parsed.getMinutes()).padStart(2, '0');
    return `${year}.${month}.${day} ${hour}:${minute}`;
  }

  return raw;
};

// 🔒 5. Safe LocalStorage 읽기/쓰기
function getSafeStorage(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error(`[Admin] Storage 읽기 오류 [${key}]:`, err);
    return [];
  }
}

function setSafeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error(`[Admin] Storage 저장 오류 [${key}]:`, err);
    window.safeToast("저장 공간이 부족하거나 오류가 발생했습니다.", "error");
    return false;
  }
}

async function getAdminUsersSnapshot() {
  const localFallback = () => {
    let users = getSafeStorage(window.USER_STORAGE_KEYS.USERS);
    if (!Array.isArray(users) || users.length === 0) users = getSafeStorage('crane_users');
    if (!Array.isArray(users) || users.length === 0) users = getSafeStorage('appUsers');
    return Array.isArray(users) ? users : [];
  };

  if (window.__adminUsersApiUnavailable) {
    return localFallback();
  }

  const token = window.getAdminToken ? window.getAdminToken() : '';
  if (!token || !window.isAdminSessionActive?.()) {
    return localFallback();
  }

  try {
    const response = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }

    const payload = await response.json().catch(() => ({}));
    const users = Array.isArray(payload) ? payload : (Array.isArray(payload?.users) ? payload.users : []);
    if (!Array.isArray(users)) return localFallback();

    setSafeStorage(window.USER_STORAGE_KEYS.USERS, users);
    setSafeStorage('crane_users', users);
    setSafeStorage('appUsers', users);
    return users;
  } catch (err) {
    if (err?.status === 404) {
      window.__adminUsersApiUnavailable = true;
      if (!window.__adminUsersApi404Notified) {
        console.warn('[Admin] /api/admin/users 라우트가 없어 로컬 저장소 기반으로 동작합니다. 서버 재시작 후 다시 확인해 주세요.');
        window.__adminUsersApi404Notified = true;
      }
      return localFallback();
    }

    if (window.handleAdminApiError?.(err, '관리자 인증이 만료되어 다시 로그인해 주세요.')) {
      return [];
    }
    console.warn('[Admin] 회원 목록 조회 실패, 로컬 저장소로 대체합니다.', err);
    return localFallback();
  }
}

window.renderNewUserCount = async function (providedUsers) {
  const countEl = document.getElementById('txtNewUserCount');
  if (!countEl) return;

  const users = Array.isArray(providedUsers) ? providedUsers : await getAdminUsersSnapshot();
  countEl.textContent = `${users.length}명`;
};

// 📊 6. 관제센터 - 배치 요청 목록 로드
window.loadControlCenterRequests = async function() {
  const reqBody = document.getElementById('requestTableBody');
  if (!reqBody) return;

  try {
    const token = window.getAdminToken ? window.getAdminToken() : '';
    if (!token || !window.isAdminSessionActive?.()) return;
    const res = await fetch('/api/inbox/request', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.list || data.data || []);

    if (list.length === 0) {
      reqBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">접수된 기사 요청이 없습니다.</td></tr>';
      return;
    }

    reqBody.innerHTML = list.map((item, idx) => {
      const safeTime = window.escapeHtml(window.formatDisplayDateTime(item.time || item.date || '-', '-'));
      const safeCompany = window.escapeHtml(item.company || '-');
      const safeName = window.escapeHtml(item.name || '-');
      const safeTel = window.escapeHtml(item.tel || '-');
      const cleanTel = window.sanitizeTel(item.tel);
      const safeType = window.escapeHtml(item.craneType || item.type || item.possibleType || '-');
      const safeMemo = window.escapeHtml(item.memo || '-');

      return `
        <tr>
          <td>${list.length - idx}</td>
          <td>${safeTime}</td>
          <td><b>${safeCompany}</b></td>
          <td>${safeName}</td>
          <td><a href="tel:${cleanTel}" style="color:#2563eb; text-decoration:underline;">${safeTel}</a></td>
          <td><span class="badge badge-blue">${safeType}</span></td>
          <td>${safeMemo}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    if (window.handleAdminApiError?.(err, '관리자 인증이 만료되어 다시 로그인해 주세요.')) {
      return;
    }
    console.error('[Admin] 배치 요청 로드 실패:', err);
    reqBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#ef4444; padding:20px;">데이터를 불러오는 중 오류가 발생했습니다.</td></tr>';
  }
};

// 📊 7. 관제센터 - 스페어 기사 신청 목록 로드
window.loadControlCenterDrivers = async function() {
  const drvBody = document.getElementById('driverTableBody');
  if (!drvBody) return;

  try {
    const token = window.getAdminToken ? window.getAdminToken() : '';
    if (!token || !window.isAdminSessionActive?.()) return;
    const res = await fetch('/api/inbox/driver', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.list || data.data || []);

    if (list.length === 0) {
      drvBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">접수된 기사 신청이 없습니다.</td></tr>';
      return;
    }

    drvBody.innerHTML = list.map((item, idx) => {
      const safeTime = window.escapeHtml(window.formatDisplayDateTime(item.time || item.date || '-', '-'));
      const safeName = window.escapeHtml(item.name || '-');
      const safeTel = window.escapeHtml(item.tel || '-');
      const cleanTel = window.sanitizeTel(item.tel);
      const safeType = window.escapeHtml(item.type || item.craneType || item.possibleType || '-');
      const safeCert = window.escapeHtml(item.cert || '-');
      const safeMemo = window.escapeHtml(item.memo || '-');

      return `
        <tr>
          <td>${list.length - idx}</td>
          <td>${safeTime}</td>
          <td><b>${safeName}</b></td>
          <td><a href="tel:${cleanTel}" style="color:#2563eb; text-decoration:underline;">${safeTel}</a></td>
          <td><span class="badge badge-green">${safeType}</span></td>
          <td>${safeCert}</td>
          <td>${safeMemo}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    if (window.handleAdminApiError?.(err, '관리자 인증이 만료되어 다시 로그인해 주세요.')) {
      return;
    }
    console.error('[Admin] 기사 신청 로드 실패:', err);
    drvBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#ef4444; padding:20px;">데이터를 불러오는 중 오류가 발생했습니다.</td></tr>';
  }
};

// 📊 8. 데이터 통합 로더 (단일 통합 정의)
window.renderControlCenterData = function() {
  if (typeof window.loadControlCenterRequests === 'function') window.loadControlCenterRequests();
  if (typeof window.loadControlCenterDrivers === 'function') window.loadControlCenterDrivers();
};

// 🛡️ 9. 통합 관제센터 탭 전환
window.switchAdminTab = function (tabName) {
  if (!window.isAdminSessionActive?.()) {
    window.checkAdminSession?.();
    return;
  }

  const safeTabName = String(tabName || 'inbox').trim();
  const subBtns = document.querySelectorAll('.sub-tab-btn');
  subBtns.forEach(btn => btn.classList.remove('active'));

  const clickedBtn = document.querySelector(`.sub-tab-btn[data-tab="${safeTabName}"]`) ||
                     Array.from(subBtns).find(btn => btn.getAttribute('onclick')?.includes(safeTabName));
  if (clickedBtn) clickedBtn.classList.add('active');

  const panes = document.querySelectorAll('.admin-pane');
  panes.forEach(pane => pane.style.display = 'none');

  const targetPane = document.getElementById(`admin-tab-${safeTabName}`);
  if (targetPane) targetPane.style.display = 'block';

  const renderers = {
    inbox: () => {
      if (typeof window.loadAdminControlData === 'function') {
        window.loadAdminControlData();
      } else {
        window.renderControlCenterData();
      }
    },
    rental: () => {
      if (typeof window.loadRentalAdminData === 'function') window.loadRentalAdminData();
    },
    drivers: async () => {
      if (typeof window.renderDriversPool !== 'function') return;
      if (window.__driversPoolRenderLocked) return;
      window.__driversPoolRenderLocked = true;
      try {
        await window.renderDriversPool();
      } finally {
        window.__driversPoolRenderLocked = false;
      }
    },
    erp: () => {
      if (typeof window.renderERPGrid === 'function') window.renderERPGrid();
    },
    parts: () => {
      if (typeof window.renderAdminProducts === 'function') window.renderAdminProducts();
    },
    users: () => {
      if (typeof window.renderAdminUsers === 'function') window.renderAdminUsers();
      if (typeof window.updateActiveUserStatus === 'function') window.updateActiveUserStatus();
    }
  };

  const renderer = renderers[safeTabName];
  if (renderer) {
    try {
      const result = renderer();
      if (result && typeof result.then === 'function') {
        result.catch((err) => console.error('[Admin] tab renderer failed:', err));
      }
    } catch (err) {
      console.error('[Admin] tab renderer failed:', err);
    }
  }
};

window.loadAdminControlData = async function () {
  if (typeof window.renderInboxRequests === 'function') window.renderInboxRequests();
  if (typeof window.renderInboxDrivers === 'function') window.renderInboxDrivers();
  window.renderControlCenterData();

  const users = await getAdminUsersSnapshot();
  if (typeof window.renderNewUserCount === 'function') window.renderNewUserCount(users);
  if (typeof window.renderAdminUsers === 'function') window.renderAdminUsers(users);
};

window.renderAdminUsers = async function (providedUsers) {
  const tbody = document.getElementById('adminUserList');
  if (!tbody) return;
  if (!window.isAdminSessionActive?.()) return;

  const users = Array.isArray(providedUsers) ? providedUsers : await getAdminUsersSnapshot();

  if (!Array.isArray(users) || users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">등록된 회원이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map((u, idx) => {
    const safeName = escapeHtml(u.name || '-');
    const safePhone = escapeHtml(u.phone || '-');
    const roleBadge = u.role === 'DRIVER' ? '<span class="badge badge-green">기사</span>' : '<span class="badge badge-blue">일반</span>';
    const safeEdit = u.editable ? '허용' : '거부';
    const safeDate = escapeHtml(u.regDate || '-');
    const safeId = escapeHtml(String(u.id || u.phone || ''));

    return `
      <tr>
        <td>${users.length - idx}</td>
        <td><b>${safeName}</b> ${roleBadge}</td>
        <td>${safePhone}</td>
        <td>${escapeHtml(u.role || '-')}</td>
        <td>${safeEdit}</td>
        <td>${safeDate}</td>
        <td>
          <div style="display:flex; justify-content:center; align-items:center; gap:10px; flex-wrap:nowrap; white-space:nowrap;">
            <button onclick="window.toggleUserEditPermission('${safeId}')" style="background:#2563eb; color:#fff; border:none; padding:6px 10px; border-radius:6px; cursor:pointer;">권한 ${u.editable ? '취소' : '부여'}</button>
            <button onclick="window.openVisitorMemoModal('${safeId}')" style="background:#0f766e; color:#fff; border:none; padding:6px 10px; border-radius:6px; cursor:pointer;">메모</button>
            <button onclick="window.deleteAdminUser('${safeId}')" style="background:#dc2626; color:#fff; border:none; padding:6px 10px; border-radius:6px; cursor:pointer;">탈퇴 삭제</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
};

window.toggleUserEditPermission = async function (id) {
  const token = window.getAdminToken ? window.getAdminToken() : '';
  if (!token) {
    safeToast('관리자 인증이 필요합니다.', 'warning');
    return;
  }

  let users = getSafeStorage(window.USER_STORAGE_KEYS.USERS);
  if (!Array.isArray(users) || users.length === 0) {
    users = getSafeStorage('crane_users');
  }
  if (!Array.isArray(users) || users.length === 0) {
    users = getSafeStorage('appUsers');
  }
  const index = users.findIndex(u => String(u.id) === String(id) || String(u.phone) === String(id));
  if (index === -1) {
    safeToast('대상 회원을 찾을 수 없습니다.', 'warning');
    return;
  }

  const nextEditable = !Boolean(users[index].editable);

  try {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}/editable`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ editable: nextEditable })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      safeToast(result.error || '권한 변경에 실패했습니다.', 'warning');
      return;
    }

    if (Array.isArray(result.users)) {
      users = result.users;
      setSafeStorage(window.USER_STORAGE_KEYS.USERS, users);
      setSafeStorage('crane_users', users);
      setSafeStorage('appUsers', users);
    } else {
      users[index].editable = nextEditable;
      setSafeStorage(window.USER_STORAGE_KEYS.USERS, users);
      setSafeStorage('crane_users', users);
      setSafeStorage('appUsers', users);
    }

    const updatedUser = result.user || users[index];
    if (updatedUser && window.getCurrentUser && String(window.getCurrentUser()?.id) === String(id)) {
      const currentUser = window.getCurrentUser();
      sessionStorage.setItem('currentUser', JSON.stringify({ ...currentUser, editable: Boolean(updatedUser.editable) }));
      sessionStorage.setItem('appUsers', JSON.stringify(users));
    }

    safeToast(`회원 ${updatedUser?.name || users[index].name}의 정보 수정 권한을 ${nextEditable ? '부여' : '취소'}했습니다.`, 'success');
    window.renderAdminUsers();
  } catch (err) {
    console.error('권한 변경 오류:', err);
    safeToast('권한 변경 중 오류가 발생했습니다.', 'error');
  }
};

window.openVisitorMemoModal = function (id) {
  const token = window.getAdminToken ? window.getAdminToken() : '';
  if (!token) {
    safeToast('관리자 인증이 필요합니다.', 'warning');
    return;
  }

  const users = getSafeStorage(window.USER_STORAGE_KEYS.USERS);
  const target = users.find(u => String(u.id) === String(id) || String(u.phone) === String(id));
  const name = target?.name || '회원';
  const currentMemo = target?.adminMemo || target?.memo || '';

  const existingModal = document.getElementById('visitorMemoModalOverlay');
  if (existingModal) existingModal.remove();

  const overlay = document.createElement('div');
  overlay.id = 'visitorMemoModalOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(15, 23, 42, 0.65)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '99999';
  overlay.style.padding = '20px';

  overlay.innerHTML = `
    <div style="width:min(560px, 100%); background:#fff; border-radius:16px; box-shadow:0 20px 50px rgba(0,0,0,0.2); padding:24px; box-sizing:border-box;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:14px;">
        <div>
          <div style="font-size:18px; font-weight:700; color:#0f172a;">관리자 메모</div>
          <div style="font-size:13px; color:#64748b; margin-top:4px;">${escapeHtml(name)} 회원의 메모를 입력해 주세요.</div>
        </div>
        <button type="button" data-action="close" style="border:none; background:#f1f5f9; color:#0f172a; width:36px; height:36px; border-radius:999px; cursor:pointer; font-size:18px;">×</button>
      </div>
      <label style="display:block; font-size:13px; color:#334155; margin-bottom:6px; font-weight:600;">메모 내용</label>
      <textarea data-role="memo-input" rows="8" style="width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:10px; padding:12px; resize:vertical; font-size:14px; line-height:1.5;">${escapeHtml(currentMemo)}</textarea>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
        <button type="button" data-action="cancel" style="border:none; background:#e2e8f0; color:#0f172a; padding:10px 14px; border-radius:8px; cursor:pointer; font-weight:600;">취소</button>
        <button type="button" data-action="save" style="border:none; background:#2563eb; color:#fff; padding:10px 14px; border-radius:8px; cursor:pointer; font-weight:600;">저장</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const textarea = overlay.querySelector('[data-role="memo-input"]');
  textarea?.focus();
  textarea?.setSelectionRange(textarea.value.length, textarea.value.length);

  overlay.querySelector('[data-action="close"]').addEventListener('click', () => overlay.remove());
  overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });

  overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
    const nextMemo = (textarea?.value || '').trim();
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}/memo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ memo: nextMemo })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || '메모 저장에 실패했습니다.');
      }
      const nextUsers = Array.isArray(result.users) ? result.users : users;
      setSafeStorage(window.USER_STORAGE_KEYS.USERS, nextUsers);
      safeToast('메모를 저장했습니다.', 'success');
      if (typeof window.renderAdminUsers === 'function') window.renderAdminUsers();
      if (typeof window.updateActiveUserStatus === 'function') window.updateActiveUserStatus();
      overlay.remove();
    } catch (err) {
      console.error('[Admin] memo update failed:', err);
      safeToast(err.message || '메모 저장 중 오류가 발생했습니다.', 'error');
    }
  });
};

/* --- [부품몰 어드민 관리] ---
   상품 등록/목록/삭제는 서버 연동 버전(parts.js)이 담당한다.
   (이전의 localStorage 버전은 관리자 브라우저에만 저장되어 다른 방문자에게
    안 보이는 문제가 있어 제거) --- */

/* --- [기사 인력풀 관리: 서버 /api/drivers-pool 연동] --- */

function resolveDriverTypeValue(driver) {
  const candidates = [];
  if (!driver || typeof driver !== 'object') return '';

  const collect = (value) => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (value && typeof value === 'object') {
      Object.values(value).forEach(collect);
      return;
    }
    if (value !== undefined && value !== null) {
      const text = String(value).trim();
      if (text) {
        const normalized = text.replace(/\s+/g, ' ').trim();
        const parts = normalized.split(/[\/|,]/).map(part => part.trim()).filter(Boolean);
        parts.forEach(part => candidates.push(part));
      }
    }
  };

  collect(driver.type);
  collect(driver.craneType);
  collect(driver.possibleType);
  collect(driver.possibility);
  collect(driver.equipment);
  collect(driver.spec);
  collect(driver.regType);
  collect(driver.driverType);
  collect(driver.user?.craneType);
  collect(driver.user?.type);
  collect(driver.possibleCraneType);
  collect(driver.vehicleType);
  collect(driver.licenseType);
  collect(driver.availableType);
  collect(driver.workType);
  collect(driver.crane_type);
  collect(driver.possible_type);
  collect(driver.craneTypeName);
  collect(driver.machineType);
  collect(driver.operableType);
  collect(driver.regCraneType);
  collect(driver.availableTypes);
  collect(driver.capacity);
  collect(driver.tonnage);
  collect(driver.ton);
  collect(driver.tonnageValue);
  collect(driver.availableCapacity);
  collect(driver.operableCapacity);
  collect(driver.supportedType);
  collect(driver.supportedCapacity);
  collect(driver.craneCapacity);

  const unique = [...new Set(candidates.filter(Boolean))];
  return unique.length ? unique[0] : '';
}

function resolveDriverCapacityValue(driver) {
  if (!driver || typeof driver !== 'object') return '';

  const candidates = [
    driver.capacity,
    driver.tonnage,
    driver.ton,
    driver.tonNum,
    driver.tonnageValue,
    driver.availableCapacity,
    driver.operableCapacity,
    driver.supportedCapacity,
    driver.craneCapacity,
    driver.maxCapacity,
    driver.maxTonnage,
    driver.type,
    driver.craneType,
    driver.possibleType,
    driver.possibility,
    driver.equipment,
    driver.spec,
    driver.regType,
    driver.driverType,
    driver.user?.craneType,
    driver.user?.type,
    driver.possibleCraneType,
    driver.vehicleType,
    driver.licenseType,
    driver.availableType,
    driver.workType,
    driver.crane_type,
    driver.possible_type,
    driver.craneTypeName,
    driver.machineType,
    driver.operableType,
    driver.regCraneType,
    driver.availableTypes
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const text = String(candidate).trim();
    if (!text) continue;

    const match = text.match(/(\d+(?:\.\d+)?)\s*(톤|ton|tons|t)/i);
    if (match) {
      return `${match[1]}톤`;
    }

    const explicitMatch = text.match(/(\d+(?:\.\d+)?)/);
    if (explicitMatch && /(톤|ton|tons|t|카고|이하|이상)/i.test(text)) {
      return `${explicitMatch[1]}톤`;
    }
  }

  return '';
}

function normalizeTypeFilterValue(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

async function updateActiveUserStatus() {
  const el = document.getElementById('activeUserStatus');
  if (!el) return;

  const token = window.getAdminToken ? window.getAdminToken() : '';
  if (!token || !window.isAdminSessionActive?.()) {
    el.innerHTML = '관리자 인증이 필요합니다.';
    return;
  }

  try {
    const response = await fetch('/api/admin/visitors', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const visitors = await response.json();
    const list = Array.isArray(visitors) ? visitors : [];

    if (!list.length) {
      el.innerHTML = '<div style="color:#64748b;">현재 접속 중인 사용자가 없습니다.</div>';
      return;
    }

    const uniqueEntries = [];
    const seenKeys = new Set();
    list.forEach((entry) => {
      const key = String(entry?.userId || entry?.id || entry?.phone || entry?.sessionKey || '').trim();
      const fallbackKey = `${entry?.name || ''}:${entry?.phone || ''}:${entry?.role || ''}`;
      const dedupeKey = key || fallbackKey;
      if (!dedupeKey || seenKeys.has(dedupeKey)) return;
      seenKeys.add(dedupeKey);
      uniqueEntries.push(entry);
    });

    el.innerHTML = uniqueEntries.map((entry) => {
      const safeName = window.escapeHtml(entry.name || entry.userName || '미지정');
      const safePhone = window.escapeHtml(entry.phone || '-');
      const safeRole = window.escapeHtml(entry.role || '-');
      const safeId = encodeURIComponent(String(entry.id || entry.userId || entry.phone || entry.sessionKey || ''));
      const safeMemo = window.escapeHtml(entry.adminMemo || entry.memo || '-');
      const lastSeen = entry.lastSeenAt ? window.formatDisplayDateTime?.(entry.lastSeenAt, '-') : '-';
      return `
        <div style="margin-bottom:10px; padding:10px 12px; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc;">
          <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:nowrap; white-space:nowrap; overflow-x:auto;">
            <strong>${safeName}</strong>
            <span style="font-size:12px; color:#64748b;">${safeRole} / ${safePhone}</span>
          </div>
          <div style="margin-top:6px; font-size:13px; color:#334155;">마지막 접속: ${window.escapeHtml(lastSeen)}</div>
          <div style="margin-top:6px; font-size:13px; color:#334155;">메모: ${safeMemo}</div>
          <div style="margin-top:8px;">
            <button type="button" onclick="window.openVisitorMemoModal('${safeId}')" style="background:#2563eb; color:#fff; border:none; padding:6px 10px; border-radius:6px; cursor:pointer;">메모 보기/수정</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('[Admin] 방문자 상태 조회 실패:', err);
    el.innerHTML = '<div style="color:#ef4444;">접속자 상태를 불러오지 못했습니다.</div>';
  }
}

// 👷 정식 승인 기사 인력풀 렌더링 (검색 필터 포함)
window.renderDriversPool = async function () {
  const tbody = document.getElementById('driversPoolGrid');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748b;">인력풀 데이터를 불러오는 중...</td></tr>';

  const token = window.getAdminToken ? window.getAdminToken() : '';
  if (!token || !window.isAdminSessionActive?.()) return;

  try {
    const res = await fetch('/api/drivers-pool', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    let pool = await res.json();
    if (!Array.isArray(pool)) pool = [];

    const nameKey = (document.getElementById('searchName')?.value || '').trim().toLowerCase();
    const typeKey = document.getElementById('searchType')?.value || '';
    const memoKey = (document.getElementById('searchMemo')?.value || '').trim().toLowerCase();

    const filtered = pool.filter(d => {
      const resolvedType = resolveDriverTypeValue(d);
      const normalizedResolvedType = normalizeTypeFilterValue(resolvedType);
      const normalizedTypeKey = normalizeTypeFilterValue(typeKey);
      const matchName = !nameKey || String(d.name || '').toLowerCase().includes(nameKey);
      const matchType = !typeKey || normalizedResolvedType.includes(normalizedTypeKey) || normalizedTypeKey.includes(normalizedResolvedType);
      const matchMemo = !memoKey || String(d.memo || d.adminMemo || '').toLowerCase().includes(memoKey);
      return matchName && matchType && matchMemo;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">등록된 기사 인력이 없습니다.</td></tr>';
      return;
    }

    const rowsHtml = filtered.map(d => {
      const safeTime = window.escapeHtml(window.formatDisplayDateTime?.(d.approvedAt || d.time || d.regDate || d.createdAt || '-') || '-');
      const safeName = window.escapeHtml(d.name || '-');
      const safeTel = window.escapeHtml(d.tel || '-');
      const cleanTel = window.sanitizeTel(d.tel);
      const typeValue = resolveDriverTypeValue(d);
      const capacityValue = resolveDriverCapacityValue(d);
      const displayType = [typeValue, capacityValue].filter(Boolean).join(' · ');
      const safeType = window.escapeHtml(String(displayType || d.craneType || d.type || d.possibleType || '-'));
      const safeCapacity = window.escapeHtml(String(capacityValue || ''));
      const safeCert = window.escapeHtml(d.cert || '-');
      const safeMemo = window.escapeHtml(d.memo || d.adminMemo || d.career || d.intro || '-');
      const safeId = encodeURIComponent(String(d.id || ''));

      return `
        <tr>
          <td style="white-space:nowrap;">${safeTime}</td>
          <td><b>${safeName}</b></td>
          <td><a href="tel:${cleanTel}" style="color:#2563eb; text-decoration:underline;">${safeTel}</a></td>
          <td>
            <span class="badge badge-green">${safeType}</span>
            ${safeCapacity ? `<div style="font-size:12px; color:#64748b; margin-top:4px;">톤수: ${safeCapacity}</div>` : ''}
          </td>
          <td>${safeCert}</td>
          <td>${safeMemo}</td>
          <td><button onclick="window.removeDriverFromPool('${safeId}')" style="background:#dc2626; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">명단 삭제</button></td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rowsHtml || '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">표시할 인력풀이 없습니다.</td></tr>';
  } catch (err) {
    if (window.handleAdminApiError?.(err, '관리자 인증이 만료되어 다시 로그인해 주세요.')) {
      return;
    }
    console.error('[Admin] 인력풀 로드 실패:', err);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#ef4444; padding:20px;">인력풀 데이터를 불러오지 못했습니다.</td></tr>';
  }
};

// 👷 인력풀 명단 삭제
window.removeDriverFromPool = async function (encodedId) {
  if (!confirm('해당 기사님을 인력풀 명단에서 삭제하시겠습니까?')) return;
  const token = window.getAdminToken ? window.getAdminToken() : '';
  try {
    const res = await fetch(`/api/admin/pool/${encodedId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    window.safeToast('인력풀에서 삭제했습니다.', 'warning');
    window.renderDriversPool();
  } catch (err) {
    console.error('[Admin] 인력풀 삭제 실패:', err);
    window.safeToast('삭제에 실패했습니다.', 'error');
  }
};

// 🚀 13. 안전한 시스템 초기화
function initAdminModule() {
  updateActiveUserStatus();
  if (!window.isAdminSessionActive?.()) {
    return;
  }
  window.renderControlCenterData();
  if (typeof window.renderAdminProducts === 'function') {
    window.renderAdminProducts();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initAdminModule();
  });
} else {
  initAdminModule();
}

// =============================================================
// 🟢 온라인 멤버 실시간 관제 패널
// =============================================================

let _onlinePanelRefreshTimer = null;

window.toggleOnlinePanel = function () {
  const panel = document.getElementById('online-member-panel');
  if (!panel) return;
  const isOpen = panel.classList.toggle('is-open');
  if (isOpen) window.refreshOnlinePanel();
};

window.refreshOnlinePanel = async function () {
  const list  = document.getElementById('online-member-list');
  const badge = document.getElementById('online-count-badge');
  if (!list) return;

  const token = window.getAdminToken?.() || '';
  if (!token || !window.isAdminSessionActive?.()) return;

  try {
    const res = await fetch('/api/drivers-pool', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pool = await res.json();
    const drivers = Array.isArray(pool) ? pool : [];

    const onlineCount = drivers.filter(d => d.isOnline).length;
    if (badge) badge.textContent = onlineCount;

    if (drivers.length === 0) {
      list.innerHTML = '<p class="online-panel-placeholder">등록된 기사가 없습니다.</p>';
      return;
    }

    list.innerHTML = drivers.map(d => {
      const safeName  = window.escapeHtml(d.name || '-');
      const safeType  = window.escapeHtml(d.type || d.craneType || '-');
      const safeId    = encodeURIComponent(String(d.id || ''));
      const isOn      = !!d.isOnline;
      const indCls    = isOn ? 'online-indicator--on'           : 'online-indicator--off';
      const labelCls  = isOn ? 'online-driver-status-label--on' : 'online-driver-status-label--off';
      const labelText = isOn ? 'ON' : 'OFF';
      return `<div class="online-driver-item" onclick="window.toggleDriverOnline('${safeId}')" title="클릭하면 ON/OFF 전환">
        <span class="online-indicator ${indCls}"></span>
        <div class="online-driver-info">
          <div class="online-driver-name">${safeName}</div>
          <div class="online-driver-type">${safeType}</div>
        </div>
        <span class="online-driver-status-label ${labelCls}">${labelText}</span>
      </div>`;
    }).join('');
  } catch (err) {
    console.error('[OnlinePanel] 로드 실패:', err);
    list.innerHTML = '<p class="online-panel-placeholder" style="color:#ef4444;">불러오기 실패</p>';
  }
};

window.toggleDriverOnline = async function (encodedId) {
  const token = window.getAdminToken?.() || '';
  if (!token) return;
  try {
    const res = await fetch(`/api/admin/drivers-pool/${encodedId}/online`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await window.refreshOnlinePanel();
  } catch (err) {
    console.error('[OnlinePanel] 상태 변경 실패:', err);
    window.safeToast?.('온라인 상태 변경에 실패했습니다.', 'error');
  }
};

// 관리자 로그인 성공 후 패널 버튼 표시 + 30초 자동 갱신
window.startOnlinePanelPolling = function () {
  const toggle = document.getElementById('online-panel-toggle');
  if (toggle) toggle.style.display = 'flex';
  window.refreshOnlinePanel();
  if (_onlinePanelRefreshTimer) clearInterval(_onlinePanelRefreshTimer);
  _onlinePanelRefreshTimer = setInterval(window.refreshOnlinePanel, 30000);
};

window.stopOnlinePanelPolling = function () {
  if (_onlinePanelRefreshTimer) {
    clearInterval(_onlinePanelRefreshTimer);
    _onlinePanelRefreshTimer = null;
  }
  const toggle = document.getElementById('online-panel-toggle');
  if (toggle) toggle.style.display = 'none';
  const panel = document.getElementById('online-member-panel');
  if (panel) panel.classList.remove('is-open');
};

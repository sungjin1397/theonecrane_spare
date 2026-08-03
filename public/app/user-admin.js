/* ==========================================================
   THE ONE CRANE SPARE - user-admin.js (보안/인증 및 회원 관리 완비)
   ========================================================== */

// 🔑 스토리지 키 중앙 관리
const USER_STORAGE_KEYS = {
  USERS: 'appUsers',
  CURRENT_USER: 'currentUser'
};

// 🔒 1. XSS 방지 소독 함수 (전역 중복 방지)
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

// 🔒 2. 전화번호 숫자 정제 유틸리티
if (typeof window.sanitizeTel !== 'function') {
  window.sanitizeTel = function(tel) {
    if (!tel) return '';
    return String(tel).replace(/[^0-9]/g, '');
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

// 🔒 4. LocalStorage 안전 접근 래퍼
function getSafeStorage(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error(`[UserAdmin] Storage 읽기 오류 [${key}]:`, err);
    return [];
  }
}

function setSafeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error(`[UserAdmin] Storage 저장 오류 [${key}]:`, err);
    window.safeToast("저장 공간이 부족하거나 오류가 발생했습니다.", "error");
    return false;
  }
}

// 🔒 5. 현지 타임존(KST) 기준 날짜 추출 (YYYY-MM-DD)
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 👤 6. 현재 로그인된 사용자 정보 조회
window.getCurrentUser = function() {
  try {
    const data = sessionStorage.getItem(USER_STORAGE_KEYS.CURRENT_USER) || sessionStorage.getItem('currentUser');
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error('[UserAdmin] 현재 사용자 세션 읽기 오류:', err);
    return null;
  }
};

// 👤 7. 회원가입 처리
window.restoreUserSession = async function () {
  const token = sessionStorage.getItem('userToken');
  if (!token) return false;

  try {
    const response = await fetch('/api/user/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await response.json().catch(() => ({}));

    if (response.ok && result.success && result.user) {
      const syncedUser = result.user;
      sessionStorage.setItem(USER_STORAGE_KEYS.CURRENT_USER, JSON.stringify(syncedUser));
      sessionStorage.setItem('currentUser', JSON.stringify(syncedUser));

      const localUsers = getSafeStorage(USER_STORAGE_KEYS.USERS);
      if (Array.isArray(localUsers) && localUsers.length > 0) {
        const localMatch = localUsers.find(item => String(item.id) === String(syncedUser.id) || String(item.phone) === String(syncedUser.phone));
        if (localMatch) {
          const mergedUser = { ...localMatch, ...syncedUser };
          setSafeStorage(USER_STORAGE_KEYS.USERS, localUsers.map(item => String(item.id) === String(syncedUser.id) || String(item.phone) === String(syncedUser.phone) ? mergedUser : item));
        }
      }

      if (typeof window.updateNavState === 'function') {
        window.updateNavState();
      }
      if (typeof window.showMyPage === 'function') {
        window.showMyPage(syncedUser);
      }
      return true;
    }
  } catch (err) {
    console.warn('[UserAdmin] 세션 복구 실패:', err);
  }

  sessionStorage.removeItem('userToken');
  sessionStorage.removeItem(USER_STORAGE_KEYS.CURRENT_USER);
  sessionStorage.removeItem('currentUser');
  return false;
};

window.handleUserRegister = async function (e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  const form = e?.target || document.querySelector('#user-register-box form');
  const submitBtn = form?.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const name = (form?.querySelector('#userRegName')?.value || document.getElementById('userRegName')?.value || '').trim();
    const rawPhone = (form?.querySelector('#regPhone')?.value || document.getElementById('regPhone')?.value || '').trim();
    const pw = (form?.querySelector('#regPw')?.value || document.getElementById('regPw')?.value || '').trim();
    const role = form?.querySelector('#regUserType')?.value || document.getElementById('regUserType')?.value || 'USER';
    const craneType = (form?.querySelector('#userRegCraneType')?.value || document.getElementById('userRegCraneType')?.value || '').trim();
    const memo = (form?.querySelector('#userRegMemo')?.value || document.getElementById('userRegMemo')?.value || '').trim();

    const phone = window.sanitizeTel(rawPhone);

    if (!name || !phone || !pw) {
      window.safeToast('필수 정보(이름, 휴대폰 번호, 비밀번호)를 올바르게 입력해 주세요.', 'warning');
      return;
    }

    if (pw.length < 4) {
      window.safeToast('비밀번호는 최소 4자리 이상 입력해 주세요.', 'warning');
      return;
    }

    const response = await fetch('/api/user/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, password: pw, role, craneType, memo })
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {
      window.safeToast(result.error || '회원가입 처리 중 오류가 발생했습니다.', 'warning');
      return;
    }

    if (Array.isArray(result.users)) {
      setSafeStorage(USER_STORAGE_KEYS.USERS, result.users);
    }

    if (result.token) {
      sessionStorage.setItem('userToken', result.token);
    }

    window.safeToast('🎉 회원가입이 완료되었습니다! 로그인 해주세요.', 'success');

    if (e?.target && typeof e.target.reset === 'function') {
      e.target.reset();
    }

    if (typeof window.toggleDriverFields === 'function') {
      window.toggleDriverFields();
    }

    if (typeof window.showLoginForm === 'function') {
      window.showLoginForm();
    }

    const phoneInput = document.getElementById('userPhone');
    if (phoneInput) phoneInput.value = rawPhone;
  } catch (err) {
    console.error('[UserAdmin] 회원가입 처리 오류:', err);
    window.safeToast('회원가입 처리 중 오류가 발생했습니다.', 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
};

// 👤 8. 역할 선택(기사 vs 일반) 필드 토글
window.toggleDriverFields = function() {
  const roleSelect = document.getElementById('regUserType');
  const driverFieldsArea = document.getElementById('driverExtraFields');
  const craneInput = document.getElementById('userRegCraneType');

  if (!roleSelect) return;

  const isDriver = roleSelect.value === 'DRIVER';

  if (driverFieldsArea) {
    driverFieldsArea.style.display = isDriver ? 'block' : 'none';
  }

  if (craneInput) {
    if (isDriver) {
      craneInput.setAttribute('required', 'required');
    } else {
      craneInput.removeAttribute('required');
      craneInput.value = '';
    }
  }
};

// 🔑 9. 로그인 처리
window.handleUserLogin = async function (e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  const form = e?.target || document.querySelector('#user-login-box form');
  const submitBtn = form?.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const rawPhone = (form?.querySelector('#userPhone')?.value || document.getElementById('userPhone')?.value || '').trim();
    const pw = (form?.querySelector('#userPw')?.value || document.getElementById('userPw')?.value || '').trim();
    const phone = window.sanitizeTel(rawPhone);

    if (!phone || !pw) {
      window.safeToast('휴대폰 번호와 비밀번호를 모두 입력해 주세요.', 'warning');
      return;
    }

    const response = await fetch('/api/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password: pw })
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {
      window.safeToast(result.error || '로그인 처리 중 오류가 발생했습니다.', 'warning');
      return;
    }

    const safeUser = result.user;
    if (safeUser) {
      try {
        sessionStorage.setItem(USER_STORAGE_KEYS.CURRENT_USER, JSON.stringify(safeUser));
        sessionStorage.setItem('currentUser', JSON.stringify(safeUser));
        if (result.token) {
          sessionStorage.setItem('userToken', result.token);
        }
      } catch (err) {
        console.warn('[UserAdmin] SessionStorage 저장 실패:', err);
      }

      if (Array.isArray(result.users)) {
        setSafeStorage(USER_STORAGE_KEYS.USERS, result.users);
      }

      window.safeToast(`${window.escapeHtml(safeUser.name || '회원')}님 환영합니다!`, 'success');

      if (typeof window.showMyPage === 'function') {
        window.showMyPage(safeUser);
      }
      if (typeof window.updateNavState === 'function') {
        window.updateNavState();
      }
    }
  } catch (err) {
    console.error('[UserAdmin] 로그인 처리 오류:', err);
    window.safeToast('로그인 처리 중 오류가 발생했습니다.', 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
};

// 🚪 10. 로그아웃 처리
window.logoutUser = function() {
  try {
    sessionStorage.removeItem(USER_STORAGE_KEYS.CURRENT_USER);
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('userToken');
    window.safeToast('로그아웃 되었습니다.', 'info');

    if (typeof window.updateNavState === 'function') {
      window.updateNavState();
    }
    if (typeof window.showMainHome === 'function') {
      window.showMainHome();
    }
  } catch (err) {
    console.error('[UserAdmin] 로그아웃 오류:', err);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.restoreUserSession === 'function') {
    window.restoreUserSession();
  }

  const loginForm = document.querySelector('#user-login-box form');
  if (loginForm && !loginForm.dataset.bound) {
    loginForm.dataset.bound = 'true';
    loginForm.addEventListener('submit', function (event) {
      window.handleUserLogin(event);
    });
  }

  const registerForm = document.querySelector('#user-register-box form');
  if (registerForm && !registerForm.dataset.bound) {
    registerForm.dataset.bound = 'true';
    registerForm.addEventListener('submit', function (event) {
      window.handleUserRegister(event);
    });
  }
});

// 👑 11. 관리자용 회원 삭제(탈퇴)
window.deleteAdminUser = function(id) {
  if (confirm('해당 회원을 정말 강제 탈퇴시키겠습니까?')) {
    let users = getSafeStorage(USER_STORAGE_KEYS.USERS);
    users = users.filter(u => String(u.id) !== String(id));

    if (setSafeStorage(USER_STORAGE_KEYS.USERS, users)) {
      window.safeToast('회원이 삭제되었습니다.', 'warning');
      window.renderAdminUsers();
    }
  }
};
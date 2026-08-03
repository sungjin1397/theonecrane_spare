/* ==========================================
   THE ONE CRANE SPARE - auth.js (수정완료)
   ========================================== */

// 🔒 Safe Toast 알림 래퍼
function safeToast(msg, type = 'info') {
  if (typeof window.showToast === 'function') {
    window.showToast(msg, type);
  } else if (typeof showToast === 'function') {
    showToast(msg, type);
  } else {
    alert(msg);
  }
}

window.getAdminToken = function () {
  return sessionStorage.getItem('theone_secure_token') || '';
};

window.isAdminSessionActive = function () {
  return sessionStorage.getItem('is_admin_logged_in') === 'true' && Boolean(window.getAdminToken());
};

window.clearAdminSession = function (reason = '관리자 인증이 만료되어 다시 로그인해 주세요.') {
  sessionStorage.removeItem('is_admin_logged_in');
  sessionStorage.removeItem('theone_secure_token');
  try {
    window.checkAdminSession?.();
  } catch (err) {
    // no-op
  }
  if (typeof window.safeToast === 'function') {
    window.safeToast(reason, 'warning');
  }
};

window.handleAdminApiError = function (error, fallbackMessage = '관리자 인증이 필요합니다.') {
  const status = Number(error?.status || error?.response?.status || 0);
  if (status === 401 || status === 403 || String(error?.message || '').includes('HTTP 401') || String(error?.message || '').includes('HTTP 403')) {
    if (window.isAdminSessionActive?.()) {
      window.clearAdminSession?.(fallbackMessage);
    }
    return true;
  }
  return false;
};

// 1. 관리자 비밀번호 인증 처리
window.processAdminAuth = async function () {
  const passInput = document.getElementById('adminPasswordInput') || document.getElementById('adminPassInput');
  if (!passInput) {
    safeToast("암호 입력창을 찾을 수 없습니다.", "error");
    return;
  }

  const inputPass = String(passInput.value || '').trim();
  if (!inputPass) {
    safeToast("보안 마스터 코드를 입력해 주세요.", "warning");
    return;
  }

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: inputPass })
    });

    let result = {};
    try {
      result = await response.json();
    } catch (err) {
      result = {};
    }

    if (!response.ok || !result.token) {
      const message = result.error || '인증에 실패했습니다.';
      safeToast(message, 'error');
      return;
    }

    sessionStorage.setItem('is_admin_logged_in', 'true');
    sessionStorage.setItem('theone_secure_token', result.token);
    passInput.value = '';

    safeToast("🔑 관리자 인증 성공! 관제 시스템이 개설되었습니다.", "success");
    if (typeof window.handleLoginSuccess === 'function') {
      window.handleLoginSuccess();
    } else {
      window.checkAdminSession();
    }
  } catch (error) {
    console.error('[Auth] login failed', error);
    safeToast('인증 서버에 연결할 수 없습니다.', 'error');
  }
};

// 2. 로그인 성공 시 UI 전환
window.handleLoginSuccess = function () {
  const lockBox = document.querySelector('.lock-container');
  const adminSubHeader = document.querySelector('.admin-sub-header');
  const adminSection = document.getElementById('sec-admin');

  if (lockBox) lockBox.style.display = 'none';
  if (adminSubHeader) adminSubHeader.style.display = 'block';
  if (adminSection) {
    adminSection.classList.add('active');
    adminSection.style.display = 'block';
  }

  if (typeof window.switchAdminTab === 'function') {
    window.switchAdminTab('inbox');
  }

  if (typeof window.updateActiveUserStatus === 'function') {
    window.updateActiveUserStatus();
  }
  if (typeof window.renderAdminUsers === 'function') {
    window.renderAdminUsers();
  }

  if (typeof window.showTab === 'function') {
    window.showTab('admin');
  }
};

// 3. 로그아웃 처리
window.processAdminLogout = function () {
  if (confirm("관리자 계정에서 로그아웃하시겠습니까?")) {
    sessionStorage.removeItem('is_admin_logged_in');
    sessionStorage.removeItem('theone_secure_token');
    localStorage.removeItem('adminToken');

    safeToast("🔓 성공적으로 로그아웃되었습니다.", "info");

    // 페이지를 새로고침하여 초기 상태로 원복
    window.location.reload();
  }
};

// 4. 통합 세션 체킹 (페이지 로드 / 새로고침 시)
window.checkAdminSession = function () {
  const token = window.getAdminToken?.();
  if (token && !sessionStorage.getItem('is_admin_logged_in')) {
    sessionStorage.setItem('is_admin_logged_in', 'true');
  }
  const isAdmin = sessionStorage.getItem('is_admin_logged_in') === 'true' && Boolean(window.getAdminToken());
  const lockBox = document.querySelector('.lock-container');
  const adminSubHeader = document.querySelector('.admin-sub-header');
  const adminSection = document.getElementById('sec-admin');

  if (isAdmin) {
    if (lockBox) lockBox.style.display = 'none';
    if (adminSubHeader) adminSubHeader.style.display = 'block';
    if (adminSection) {
      adminSection.classList.add('active');
      adminSection.style.display = 'block';
    }
    if (typeof window.switchAdminTab === 'function') {
      window.switchAdminTab('inbox');
    }
    if (typeof window.updateActiveUserStatus === 'function') {
      window.updateActiveUserStatus();
    }
    if (typeof window.renderAdminUsers === 'function') {
      window.renderAdminUsers();
    }
  } else {
    if (lockBox) lockBox.style.display = 'block';
    if (adminSubHeader) adminSubHeader.style.display = 'none';
    adminPanes.forEach((pane) => {
      pane.style.display = 'none';
    });
  }
};

// DOM 로드 완료 후 자동 검사
document.addEventListener('DOMContentLoaded', () => {
  window.checkAdminSession();
});

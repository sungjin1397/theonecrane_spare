/* ==========================================
   THE ONE CRANE SPARE - user-login.js (안전/보안 강화 버전)
   ========================================== */

// 🔒 1. XSS 방지 소독 함수
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 🔒 2. Safe JSON Parse (세션 데이터 손상 시 UI 마비 방지)
function getSafeCurrentUser() {
    try {
        const raw = sessionStorage.getItem('currentUser');
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        console.error("세션 유저 정보 파싱 오류:", e);
        try {
            sessionStorage.removeItem('currentUser');
        } catch (err) {}
        return null;
    }
}

// 🔒 3. Safe Toast/Alert 래퍼
function safeAlert(msg) {
    if (typeof showToast === 'function') {
        showToast(msg, 'info');
    } else {
        alert(msg);
    }
}

// 🌐 네비게이션 (메뉴 탭) 제어 함수
// 공통 구현을 사용하되, 관리자/로그인 관련 보조 동작만 추가한다.
window.showTab = function (tabId) {
    if (typeof window.__commonShowTab === 'function') {
        window.__commonShowTab(tabId);
    } else if (typeof window.showTab === 'function') {
        // fallback: 기존 common.js 구현을 호출한다.
        window.showTab(tabId);
    }

    const currentUser = getSafeCurrentUser();

    if (tabId === 'login' || tabId === 'mypage') {
        const secLogin = document.getElementById('sec-login');
        const secMyPage = document.getElementById('sec-mypage');

        if (secLogin) {
            secLogin.classList.toggle('active', tabId === 'login');
            secLogin.style.display = tabId === 'login' ? 'block' : 'none';
        }
        if (secMyPage) {
            secMyPage.classList.toggle('active', tabId === 'mypage');
            secMyPage.style.display = tabId === 'mypage' ? 'block' : 'none';
        }

        const navLogin = document.getElementById('nav-login');
        if (navLogin) navLogin.classList.add('active');

        if (tabId === 'mypage') {
            if (currentUser) {
                if (typeof showMyPage === 'function') showMyPage(currentUser);
            } else {
                safeAlert('로그인이 필요한 서비스입니다.');
                if (typeof showLoginForm === 'function') showLoginForm();
            }
        } else if (currentUser) {
            if (typeof showMyPage === 'function') showMyPage(currentUser);
        } else if (typeof showLoginForm === 'function') {
            showLoginForm();
        }
    } else if (tabId === 'admin' || tabId === 'admin-hub') {
        if (typeof window.checkAdminSession === 'function') {
            window.checkAdminSession();
        }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.toggleRegisterForm = function() {
    const loginBox = document.getElementById('user-login-box');
    const registerBox = document.getElementById('user-register-box');
    const mypageBox = document.getElementById('user-mypage-box');

    if (loginBox && registerBox) {
        if (registerBox.style.display === 'none' || registerBox.style.display === '') {
            loginBox.style.display = 'none';
            registerBox.style.display = 'block';
        } else {
            loginBox.style.display = 'block';
            registerBox.style.display = 'none';
        }
    }
    if (mypageBox) mypageBox.style.display = 'none';
};

window.showLoginForm = function() {
    const loginBox = document.getElementById('user-login-box');
    const registerBox = document.getElementById('user-register-box');
    const mypageBox = document.getElementById('user-mypage-box');
    if (loginBox) loginBox.style.display = 'block';
    if (registerBox) registerBox.style.display = 'none';
    if (mypageBox) mypageBox.style.display = 'none';
};

// 5. 로그아웃 처리
window.handleUserLogout = function () {
    try {
        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('userToken');
    } catch (e) {
        console.error("세션 삭제 실패:", e);
    }

    safeAlert('로그아웃 되었습니다.');
   
    if (typeof showLoginForm === 'function') {
        showLoginForm();
    }
    if (typeof showTab === 'function') {
        showTab('login');
    }

    // 로그인 화면으로 되돌리고, 마이페이지 콘텐츠를 숨겨서 UI 초기화
    const mypageBox = document.getElementById('user-mypage-box');
    if (mypageBox) {
        mypageBox.style.display = 'none';
    }
    const loginBox = document.getElementById('user-login-box');
    if (loginBox) {
        loginBox.style.display = 'block';
    }
    const registerBox = document.getElementById('user-register-box');
    if (registerBox) {
        registerBox.style.display = 'none';
    }

    const navLogin = document.getElementById('nav-login');
    if (navLogin) {
        navLogin.innerHTML = '🔑 로그인';
        navLogin.onclick = function (e) {
            if (e) e.preventDefault();
            showTab('login');
        };
    }
   
    updateNavState();
};

window.logoutUser = window.handleUserLogout;

// 6. 로그인 상태에 따른 네비게이션 텍스트 변경
window.updateNavState = function () {
    const navLogin = document.getElementById('nav-login');
    const currentUser = getSafeCurrentUser();

    if (navLogin) {
        if (currentUser && currentUser.name) {
            navLogin.innerHTML = `👤 ${escapeHtml(currentUser.name)}님`;
            navLogin.onclick = function (e) {
                if (e) e.preventDefault();
                if (typeof showTab === 'function') {
                    showTab('mypage');
                }
            };
        } else {
            navLogin.innerHTML = `🔑 로그인`;
            navLogin.onclick = function (e) {
                if (e) e.preventDefault();
                showTab('login');
            };
        }
    }
};

// 페이지 로드시 로그인 상태 확인
document.addEventListener('DOMContentLoaded', () => {
    updateNavState();
});
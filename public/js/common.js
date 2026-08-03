/* ==========================================
   THE ONE CRANE SPARE - common.js (보안 및 웹 모범사례 적용)
   ========================================== */

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

// 🔒 2. Safe URL 검증 함수 (javascript: 프로토콜 공격 차단)
function sanitizeUrl(url) {
  if (!url) return '';
  const trimmed = url.trim();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return '#';
  }
  return escapeHtml(trimmed);
}

// 토스트 알림 메시지 (객체 변환 안전성 추가)
window.showToast = function (message, type = 'info') {
  const toast = document.getElementById('theone-toast');
  if (!toast) {
    alert(message);
    return;
  }
 
  toast.innerText = String(message ?? '');
  toast.style.background = type === 'warning' ? '#dc2626' : (type === 'success' ? '#059669' : '#1e3a8a');
  toast.style.display = 'block';
  toast.style.opacity = '1';

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 300);
  }, 3000);
};

// 메인 탭 전환 함수 (매핑 구조로 리팩토링)
window.showTab = function (tabId) {
  window.__commonShowTab(tabId);
};

window.__commonShowTab = function (tabId) {
  const sections = document.querySelectorAll('.content-section');
  sections.forEach(sec => sec.classList.remove('active'));

  const adminSection = document.getElementById('sec-admin');
  if (tabId === 'admin' && adminSection) {
    adminSection.classList.add('active');
    adminSection.style.display = 'block';
    if (window.location.hash !== '#admin') {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}#admin`);
    }
  }

  const navLinks = document.querySelectorAll('.theone-nav a');
  navLinks.forEach(link => link.classList.remove('active'));

  const activeNav = document.getElementById(`nav-${tabId}`);
  if (activeNav) activeNav.classList.add('active');

  let targetSection = document.getElementById(`sec-${tabId}`);
  if (!targetSection && tabId === 'admin') {
    targetSection = document.getElementById('sec-admin');
  }
  if (targetSection) {
    targetSection.classList.add('active');
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }

  if (tabId === 'admin' && typeof window.checkAdminSession === 'function') {
    window.checkAdminSession();
  }

  if (tabId !== 'admin') {
    const adminSubHeader = document.querySelector('.admin-sub-header');
    if (adminSubHeader) adminSubHeader.style.display = 'none';
    const adminPanes = document.querySelectorAll('.admin-pane');
    adminPanes.forEach((pane) => {
      pane.style.display = 'none';
    });
  } else {
    const adminSubHeader = document.querySelector('.admin-sub-header');
    if (adminSubHeader) adminSubHeader.style.display = 'block';
    const adminPanes = document.querySelectorAll('.admin-pane');
    adminPanes.forEach((pane) => {
      pane.style.display = 'block';
    });
  }

  // 탭 변경 시 데이터 렌더링 트리거 매핑
  // (미정의 함수를 직접 참조하면 ReferenceError가 나므로 window에서 이름으로 찾는다)
  const tabActions = {
    board: 'renderBoardPosts',
    parts: 'renderUserProducts',
    'rental-admin': 'loadRentalAdminData'
  };

  const action = window[tabActions[tabId]];
  if (typeof action === 'function') {
    action();
  }
};

function initHashNavigation() {
  const syncFromHash = (forceHome = false) => {
    const hash = String(window.location.hash || '').replace('#', '').trim();
    const shouldForceHome = forceHome || (!hash && !window.isAdminSessionActive?.()) || (hash === 'board' && !window.isAdminSessionActive?.());

    if (shouldForceHome) {
      if (window.location.hash !== '#common') {
        history.replaceState(null, '', `${window.location.pathname}${window.location.search}#common`);
      }
      window.showTab('common');
      return;
    }

    const supportedTabs = ['common', 'request', 'driver', 'rental', 'parts', 'board', 'login', 'admin'];
    const targetTab = supportedTabs.includes(hash) ? hash : 'common';
    window.showTab(targetTab);
  };

  window.addEventListener('hashchange', () => syncFromHash(false));
  window.addEventListener('load', () => syncFromHash(true));
  syncFromHash(true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHashNavigation);
} else {
  initHashNavigation();
}

// 부품 쇼핑몰 렌더링
window.renderProductMall = function () {
  const container = document.getElementById('productMallList') || document.getElementById('productGridOutput');
  if (!container) return;

  let list = [];
  try {
    const data = JSON.parse(localStorage.getItem('crane_products'));
    list = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("부품 몰 데이터 파싱 에러:", err);
    list = [];
  }

  container.innerHTML = '';
 
  if (list.length === 0) {
    container.innerHTML = '<p style="text-align:center; padding:30px; color:#64748b;">현재 등록된 부품 상품이 없습니다.</p>';
    return;
  }

  list.forEach(p => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.style.cssText = 'border:1px solid #e2e8f0; border-radius:8px; padding:16px; margin-bottom:12px; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.05);';

    const safeName = escapeHtml(p.name);
    const safeDesc = p.desc ? escapeHtml(p.desc) : '';
    const safeImg = sanitizeUrl(p.img) || 'https://via.placeholder.com/80';
    const safeLink = sanitizeUrl(p.link);
    const safePrice = Number(p.price || 0).toLocaleString();
    const typeLabel = p.type === 'NEW' ? '새상품' : '중고';
    const typeColor = p.type === 'NEW' ? '#059669' : '#d97706';

    const linkHtml = (safeLink && safeLink !== '#')
      ? `<a href="${safeLink}" target="_blank" rel="noopener noreferrer" style="padding:8px 14px; background:#1e3a8a; color:#fff; border-radius:6px; text-decoration:none; font-size:13px; font-weight:bold;">구매/문의</a>`
      : '';

    card.innerHTML = `
      <div style="display:flex; gap:16px; align-items:center;">
        <img src="${safeImg}" alt="${safeName}" style="width:80px; height:80px; object-fit:cover; border-radius:6px;" onerror="this.src='https://via.placeholder.com/80';">
        <div style="flex:1;">
          <span style="font-size:12px; font-weight:bold; color:${typeColor};">[${typeLabel}]</span>
          <h4 style="margin:4px 0 6px 0; font-size:16px; color:#0f172a;">${safeName}</h4>
          <p style="margin:0; font-weight:bold; font-size:15px; color:#1e3a8a;">${safePrice}원</p>
          ${safeDesc ? `<p style="margin:4px 0 0 0; font-size:13px; color:#64748b;">${safeDesc}</p>` : ''}
        </div>
        ${linkHtml}
      </div>
    `;
    container.appendChild(card);
  });
};

// 모달 유틸리티
window.openPrivacyModal = (e) => { if (e) e.preventDefault(); const m = document.getElementById('privacyModal'); if (m) m.style.display = 'flex'; };
window.closePrivacyModal = () => { const m = document.getElementById('privacyModal'); if (m) m.style.display = 'none'; };

window.openPriceModal = (e) => { if (e) e.preventDefault(); const m = document.getElementById('priceModal'); if (m) m.style.display = 'flex'; };
window.closePriceModal = () => { const m = document.getElementById('priceModal'); if (m) m.style.display = 'none'; };

window.openDisclaimerModal = (e) => { if (e) e.preventDefault(); const m = document.getElementById('disclaimerModal'); if (m) m.style.display = 'flex'; };
window.closeDisclaimerModal = () => { const m = document.getElementById('disclaimerModal'); if (m) m.style.display = 'none'; };

window.showSalesStep2 = function () {
  const agree = document.getElementById('salesPrivacyAgree');
  if (!agree || !agree.checked) {
    showToast("개인정보 처리방침 약관에 동의해 주세요.", "warning");
    return;
  }
  const step1 = document.getElementById('step-privacy');
  const step2 = document.getElementById('step-mall');
  if (step1) step1.style.display = 'none';
  if (step2) step2.style.display = 'block';
  renderProductMall();
};

// window 전역 객체에 고유 함수명으로 명시적 등록
window.openFooterDisclaimerModal = function(e) {
    if (e && e.preventDefault) e.preventDefault();
    const modal = document.getElementById('footerDisclaimerModal');
    if (modal) {
        modal.style.display = 'flex';
    } else {
        console.error("footerDisclaimerModal 요소를 찾을 수 없습니다.");
    }
};

window.closeFooterDisclaimerModal = function() {
    const modal = document.getElementById('footerDisclaimerModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

window.openUsedTradeModal = () => { const m = document.getElementById('usedTradeModal'); if (m) m.style.display = 'flex'; };
window.closeUsedTradeModal = () => { const m = document.getElementById('usedTradeModal'); if (m) m.style.display = 'none'; };
window.openEditProfileModal = async function () {
    const currentUser = (typeof window.getCurrentUser === 'function' ? window.getCurrentUser() : (getSafeCurrentUser ? getSafeCurrentUser() : null));
    if (!currentUser) {
        showToast('로그인 후 내 정보 수정이 가능합니다.', 'warning');
        return;
    }

    if (!currentUser.editable) {
        showToast('관리자의 정보 수정 권한 부여가 필요합니다.', 'warning');
        return;
    }

    const newName = prompt('변경할 이름을 입력하세요.', currentUser.name || '');
    if (newName === null) return;
    const newPhone = prompt('변경할 연락처를 입력하세요.', currentUser.phone || '');
    if (newPhone === null) return;

    const nextCraneType = currentUser.role === 'DRIVER' ? prompt('운전 가능 기종을 입력하세요.', currentUser.craneType || '') : null;
    if (currentUser.role === 'DRIVER' && nextCraneType === null) return;
    const nextMemo = currentUser.role === 'DRIVER' ? prompt('경력 및 활동 지역을 입력하세요.', currentUser.memo || '') : null;
    if (currentUser.role === 'DRIVER' && nextMemo === null) return;

    const token = sessionStorage.getItem('userToken') || '';
    if (!token) {
        showToast('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/user/me', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                name: newName.trim() || currentUser.name,
                phone: newPhone.trim() || currentUser.phone,
                craneType: currentUser.role === 'DRIVER' ? (nextCraneType || '').trim() : '',
                memo: currentUser.role === 'DRIVER' ? (nextMemo || '').trim() : ''
            })
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.success) {
            showToast(result.error || '정보 수정에 실패했습니다.', 'warning');
            return;
        }

        const updatedUser = result.user || { ...currentUser, name: newName.trim() || currentUser.name, phone: newPhone.trim() || currentUser.phone };
        sessionStorage.setItem('currentUser', JSON.stringify(updatedUser));
        if (Array.isArray(result.users)) {
            localStorage.setItem('appUsers', JSON.stringify(result.users));
        }
        if (typeof showMyPage === 'function') showMyPage(updatedUser);
        if (typeof updateNavState === 'function') updateNavState();
        showToast('내 정보가 수정되었습니다.', 'success');
    } catch (e) {
        console.error('내 정보 수정 저장 실패:', e);
        showToast('정보 수정 중 오류가 발생했습니다.', 'error');
    }
};

document.addEventListener('DOMContentLoaded', () => {
  if (typeof renderMainNoticeList === 'function') {
    renderMainNoticeList();
  }
});

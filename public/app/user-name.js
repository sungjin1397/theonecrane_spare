/* ==========================================================
   THE ONE CRANE SPARE - user-name.js (마이페이지 및 내 이력 조회 완비)
   ========================================================== */

// 🔒 1. XSS 방지 소독 함수 (전역 중복 재선언 방지)
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

// 🔒 2. 전화번호 숫자 정제 유틸리티 (전역 중복 재선언 방지)
if (typeof window.sanitizeTel !== 'function') {
  window.sanitizeTel = function(tel) {
    if (!tel) return '';
    return String(tel).replace(/[^0-9]/g, '');
  };
}

// 🔒 3. Safe LocalStorage 읽기 (다중 스토리지 키 병합 탐색)
function getSafeOrders() {
  try {
    const erpOrders = JSON.parse(localStorage.getItem('erpOrders') || '[]');
    const craneOrders = JSON.parse(localStorage.getItem('crane_orders') || '[]');
    const serverOrders = JSON.parse(localStorage.getItem('server_orders') || '[]');

    const combined = [...erpOrders, ...craneOrders, ...serverOrders];
    const uniqueMap = new Map();

    combined.forEach(item => {
      if (item && (item.id || item.createdAt || item._id)) {
        const key = String(item.id || item._id || item.createdAt || '');
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, item);
        }
      }
    });

    return Array.from(uniqueMap.values());
  } catch (err) {
    console.error("[UserName] orders 읽기/파싱 오류:", err);
    return [];
  }
}

// 👤 4. 내 정보 (마이페이지) 출력
window.showMyPage = async function (user) {
  // 전달받은 user 정보가 없는 경우 세션에서 자동 복구
  let currentUser = user;
  if (!currentUser || typeof currentUser !== 'object') {
    if (typeof window.getSafeCurrentUser === 'function') {
      currentUser = window.getSafeCurrentUser();
    }
  }

  if (!currentUser) {
    console.warn("[UserName] 유효하지 않은 유저 정보입니다.");
    if (typeof window.showLoginForm === 'function') {
      window.showLoginForm();
    }
    return;
  }

  try {
    const token = sessionStorage.getItem('userToken');
    if (token) {
      const response = await fetch('/api/user/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.success && result.user) {
        currentUser = result.user;
        sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
        sessionStorage.setItem('appUsers', JSON.stringify([result.user]));
      }
    }
  } catch (err) {
    console.warn('[UserName] 서버 세션 동기화 실패:', err);
  }

  const loginBox = document.getElementById('user-login-box');
  const registerBox = document.getElementById('user-register-box');
  const mypageBox = document.getElementById('user-mypage-box');

  if (loginBox) loginBox.style.display = 'none';
  if (registerBox) registerBox.style.display = 'none';
  if (mypageBox) mypageBox.style.display = 'block';

  const elName = document.getElementById('myPageName');
  const elPhone = document.getElementById('myPagePhone');
  const elRole = document.getElementById('myPageRole');

  if (elName) elName.innerText = currentUser.name || '-';
  if (elPhone) elPhone.innerText = currentUser.phone || '-';

  let roleLabel = '일반/고객';
  if (currentUser.role === 'DRIVER') roleLabel = '스페어 기사';
  if (currentUser.role === 'OWNER') roleLabel = '장비 차주';

  if (elRole) elRole.innerText = roleLabel;

  const editPermissionLabel = document.getElementById('myPageEditPermission');
  if (editPermissionLabel) {
    editPermissionLabel.innerText = currentUser.editable ? '허용' : '관리자 승인 필요';
  }

  const extraRow = document.getElementById('myPageExtraRow');
  const extraContent = document.getElementById('myPageExtra');
  const actionWrap = document.getElementById('mypageActionButtons');

  if (!actionWrap) {
    const actions = document.createElement('div');
    actions.id = 'mypageActionButtons';
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.style.flexWrap = 'wrap';
    actions.style.marginTop = '12px';

    const editBtn = document.createElement('button');
    editBtn.id = 'myPageEditBtn';
    editBtn.type = 'button';
    editBtn.className = 'btn-secondary auth-button auth-button-secondary';
    editBtn.textContent = '내 정보 수정';

    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'myPageLogoutBtn';
    logoutBtn.type = 'button';
    logoutBtn.className = 'btn-submit auth-button auth-button-logout';
    logoutBtn.textContent = '로그아웃';

    actions.appendChild(editBtn);
    actions.appendChild(logoutBtn);
    const targetBox = document.getElementById('user-mypage-box');
    if (targetBox) {
      targetBox.appendChild(actions);
    }
  }

  if (currentUser.role === 'DRIVER') {
    if (extraRow) extraRow.style.display = 'block';
    if (extraContent) {
      const safeCrane = currentUser.craneType ? window.escapeHtml(currentUser.craneType) : '기종미지정';
      const safeMemo = currentUser.memo ? window.escapeHtml(currentUser.memo) : '경력미입력';
      extraContent.innerText = `${safeCrane} / ${safeMemo}`;
    }
  } else {
    if (extraRow) extraRow.style.display = 'none';
  }

  const editBtn = document.getElementById('myPageEditBtn');
  if (editBtn) {
    editBtn.style.display = currentUser.editable ? 'inline-block' : 'none';
  }

  const logoutBtn = document.getElementById('myPageLogoutBtn');
  if (logoutBtn && logoutBtn.getAttribute('data-logout-bound') !== 'true') {
    logoutBtn.setAttribute('data-logout-bound', 'true');
    logoutBtn.addEventListener('click', function () {
      if (typeof window.handleUserLogout === 'function') {
        window.handleUserLogout();
      }
    });
  }

  const editTrigger = document.getElementById('myPageEditBtn');
  if (editTrigger && editTrigger.getAttribute('data-edit-bound') !== 'true') {
    editTrigger.setAttribute('data-edit-bound', 'true');
    editTrigger.addEventListener('click', function () {
      if (typeof window.openEditProfileModal === 'function') {
        window.openEditProfileModal();
      }
    });
  }

  // 내 배차/신청 이력 조회
  if (currentUser.phone) {
    window.loadMyHistory(currentUser.phone);
  }
};

// 📋 5. 내 배차/신청 이력 조회 (하이픈 정제 및 최신순 정렬)
window.loadMyHistory = function (userPhone) {
  const historyBox = document.getElementById('myHistoryList');
  if (!historyBox) return;

  const cleanUserPhone = window.sanitizeTel(userPhone);

  if (!cleanUserPhone) {
    historyBox.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8; font-size:13px;">전화번호 정보가 없어 이력을 조회할 수 없습니다.</div>';
    return;
  }

  const allOrders = getSafeOrders();
  const currentUser = (() => {
    try {
      const raw = sessionStorage.getItem('currentUser');
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  })();

  // 전화번호 숫자만 추출하여 정교한 매칭 (하이픈 유무 상관없이 일치)
  const myOrders = allOrders.filter(o => {
    const clientTel = window.sanitizeTel(o.clientTel || o.phone || o.companyPhone || o.tel || '');
    const driverTel = window.sanitizeTel(o.driverTel || o.driverPhone || o.driverTel || '');
    const sourceTel = window.sanitizeTel(o.sourceTel || o.contactTel || '');
    return (clientTel && clientTel === cleanUserPhone) || (driverTel && driverTel === cleanUserPhone) || (sourceTel && sourceTel === cleanUserPhone);
  });

  const adminMemo = currentUser?.adminMemo || '';
  const canLeaveAdminMemo = Boolean(window.getAdminToken?.() || sessionStorage.getItem('theone_secure_token'));

  if (myOrders.length === 0) {
    historyBox.innerHTML = `
      <div style="text-align:center; padding:20px; color:#94a3b8; font-size:13px;">등록되거나 접수된 신청 내역이 없습니다.</div>
      ${adminMemo ? `<div style="margin-top:10px; padding:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; color:#475569; font-size:13px;">📝 관리자 메모<br>${window.escapeHtml(adminMemo)}</div>` : ''}
      ${canLeaveAdminMemo ? `
        <div style="margin-top:10px; padding:12px; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
          <div style="font-size:12px; color:#475569; font-weight:bold; margin-bottom:6px;">관리자 메모 남기기</div>
          <textarea id="adminMemoInput" rows="3" style="width:100%; border:1px solid #cbd5e1; border-radius:6px; padding:8px; resize:vertical; box-sizing:border-box;">${window.escapeHtml(adminMemo)}</textarea>
          <button id="saveAdminMemoBtn" type="button" style="margin-top:8px; background:#2563eb; color:#fff; border:none; padding:8px 12px; border-radius:6px; cursor:pointer;">메모 저장</button>
        </div>
      ` : ''}
    `;

    const memoBtn = document.getElementById('saveAdminMemoBtn');
    memoBtn?.addEventListener('click', async () => {
      const memoValue = document.getElementById('adminMemoInput')?.value || '';
      const targetUserId = currentUser?.id || currentUser?.phone || cleanUserPhone;
      const token = window.getAdminToken?.() || sessionStorage.getItem('theone_secure_token') || '';
      if (!targetUserId) {
        window.safeToast('메모 대상 사용자를 찾을 수 없습니다.', 'warning');
        return;
      }
      if (!token) {
        window.safeToast('관리자 로그인 후 메모를 남길 수 있습니다.', 'warning');
        return;
      }
      try {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(targetUserId)}/memo`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ memo: memoValue })
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok || !result.success) throw new Error(result.error || '메모 저장 실패');
        if (result.user) {
          const mergedUser = { ...(currentUser || {}), ...result.user, adminMemo: result.user.adminMemo || memoValue };
          sessionStorage.setItem('currentUser', JSON.stringify(mergedUser));
          sessionStorage.setItem('appUsers', JSON.stringify([mergedUser]));
        }
        window.safeToast('관리자 메모가 저장되었습니다.', 'success');
        window.loadMyHistory(userPhone);
      } catch (err) {
        console.error('[UserName] 관리자 메모 저장 실패:', err);
        window.safeToast('메모 저장에 실패했습니다.', 'error');
      }
    });

    return;
  }

  // 최신순 정렬 (createdAt 또는 date 기준)
  myOrders.sort((a, b) => {
    const dateA = a.createdAt || a.date || '';
    const dateB = b.createdAt || b.date || '';
    return dateB.localeCompare(dateA);
  });

  historyBox.innerHTML = myOrders.map(o => {
    const safeDate = window.escapeHtml(o.date || o.workDate || '-');
    const safeCraneType = window.escapeHtml(o.craneType || o.crane || '-');
    const safeLocation = window.escapeHtml(o.locationName || o.location || '-');
    const safeStatus = window.escapeHtml(o.dispatchStatus || o.status || '접수 완료');

    // 상태에 따른 배지 스타일
    let statusBg = '#f1f5f9';
    let statusColor = '#475569';
    if (safeStatus.includes('완료') || safeStatus.includes('배차')) {
      statusBg = '#dcfce7';
      statusColor = '#15803d';
    } else if (safeStatus.includes('대기') || safeStatus.includes('접수')) {
      statusBg = '#dbeafe';
      statusColor = '#1d4ed8';
    } else if (safeStatus.includes('취소')) {
      statusBg = '#fee2e2';
      statusColor = '#b91c1c';
    }

    return `
      <div style="padding: 12px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); font-size: 13px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
          <span style="font-weight:bold; color:#1e293b;">📅 ${safeDate}</span>
          <span style="background:${statusBg}; color:${statusColor}; font-size:11px; font-weight:bold; padding:2px 8px; border-radius:12px;">${safeStatus}</span>
        </div>
        <div style="color:#475569; line-height:1.5;">
          <div><b>🏗️ 기종:</b> ${safeCraneType}</div>
          <div><b>📍 현장:</b> ${safeLocation}</div>
        </div>
      </div>
    `;
  }).join('');
};
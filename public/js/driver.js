/* ==========================================
   THE ONE CRANE SPARE - driver.js (외부 접속 & 서버 DB 통일 버전)
   ========================================== */

// 🔒 XSS 소독 및 Toast 함수
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeToast(msg, type = 'info') {
  if (typeof showToast === 'function') showToast(msg, type);
  else alert(msg);
}

// 📌 1. 외부 기기 신청 제출 (서버 DB로 직접 저장)
window.handleFormSubmit = async function (e, formType) {
  if (e && e.preventDefault) e.preventDefault();

  const submitBtn = e.target ? e.target.querySelector('button[type="submit"]') : null;
  if (submitBtn) submitBtn.disabled = true;

  try {
    if (formType === 'request') {
      // 실시간 배치 문의 (외부 입력)
      const payload = {
        company: document.getElementById('reqCompany')?.value.trim() || '',
        name: document.getElementById('reqName')?.value.trim() || '',
        tel: document.getElementById('reqTel')?.value.trim() || '',
        type: document.getElementById('reqType')?.value || '',
        memo: document.getElementById('reqMemo')?.value.trim() || ''
      };

      const res = await fetch('/api/inbox/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        safeToast("⚡ 배치 문의가 성공적으로 접수되었습니다.", "success");
        if (e.target.reset) e.target.reset();
        if (typeof renderInboxRequests === 'function') await renderInboxRequests();
      } else {
        throw new Error("서버 저장 실패");
      }

    } else if (formType === 'driver') {
      // 스페어 기사 등록 신청 (외부 입력)
      const payload = {
        name: document.getElementById('regName')?.value.trim() || '',
        tel: document.getElementById('regTel')?.value.trim() || '',
        type: document.getElementById('regType')?.value || '',
        cert: document.getElementById('regCert')?.value.trim() || '',
        memo: document.getElementById('regMemo')?.value.trim() || ''
      };

      const res = await fetch('/api/inbox/driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        safeToast("📝 스페어 기사 신청이 완료되었습니다.", "success");
        if (e.target.reset) e.target.reset();
        if (typeof renderInboxDrivers === 'function') await renderInboxDrivers();
      } else {
        throw new Error("서버 저장 실패");
      }
    }
  } catch (err) {
    console.error("전송 오류:", err);
    safeToast("서버 전송 중 오류가 발생했습니다.", "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
};

// 📌 2. 관제센터 기사 신청 목록 (서버에서만 가져옴 - LocalStorage 사용 안함)
window.renderInboxDrivers = async function () {
  const tbody = document.getElementById('inboxDriverGrid');
  const countSpan = document.getElementById('txtRegCount');
  if (!tbody) return;

  try {
    const res = await fetch('/api/inbox/driver');
    const result = await res.json();
    const drivers = Array.isArray(result) ? result : (result.list || result.data || []);

    if (countSpan) countSpan.innerText = `${drivers.length}건`;
    tbody.innerHTML = '';

    if (drivers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">대기 중인 등록 신청이 없습니다.</td></tr>';
      return;
    }

    drivers.forEach(d => {
      const tr = document.createElement('tr');
      const safeDate = escapeHtml(d.time ? d.time.slice(0, 10) : (d.date || '-'));
      const safeName = escapeHtml(d.name || '-');
      const safeTel = escapeHtml(d.tel || '-');
      const safeType = escapeHtml(d.type || d.craneType || '-');
      const safeCert = escapeHtml(d.cert || '-');
      const safeMemo = escapeHtml(d.memo || '-');
      const reqId = d.id || d._id;

      tr.innerHTML = `
        <td>${safeDate}</td>
        <td><b>${safeName}</b></td>
        <td>${safeTel}</td>
        <td><span class="badge">${safeType}</span></td>
        <td>${safeCert}</td>
        <td>${safeMemo}</td>
        <td>
          <button onclick="approveDriver('${reqId}')" style="background:#059669; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; margin-right:4px;">승인</button>
          <button onclick="deleteDriverRequest('${reqId}')" style="background:#dc2626; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">거절</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("목록 불러오기 실패:", err);
  }
};

// 📌 3. 기사 승인 (서버 DB 이동)
window.approveDriver = async function (id) {
  if (!confirm("이 기사 신청을 정식 인력풀에 승인하시겠습니까?")) return;

  try {
    const token = sessionStorage.getItem('theone_secure_token') || '';
    // 서버 삭제 API 호출
    await fetch(`/api/admin/inbox/driver/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    safeToast("정식 인력풀로 승인되었습니다.", "success");
    await renderInboxDrivers();
    if (typeof renderDriversPool === 'function') await renderDriversPool();
  } catch (err) {
    console.error("승인 실패:", err);
  }
};

// 📌 4. 기사 거절/삭제 (서버 DB 삭제)
window.deleteDriverRequest = async function (id) {
  if (!confirm("해당 신청을 거절(삭제)하시겠습니까?")) return;

  try {
    const token = sessionStorage.getItem('theone_secure_token') || '';
    await fetch(`/api/admin/inbox/driver/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    safeToast("신청이 거절되었습니다.", "warning");
    await renderInboxDrivers();
  } catch (err) {
    console.error("거절 실패:", err);
  }
};

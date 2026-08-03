/* ==========================================
   THE ONE CRANE SPARE - notice.js (안정성 강화 버전)
   ========================================== */

// 🔒 1. 현지 기준 (YYYY-MM-DD) 날짜 추출 함수 (KST 시차 문제 해결)
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 🔒 2. Safe LocalStorage Get (시크릿 모드/쿠키 제한 예외 방지)
// ※ 다른 모듈의 전역 getSafeStorage(JSON 파싱 버전)와 이름이 겹치지 않도록 notice 전용 이름 사용
function noticeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn("Storage 접근 차단됨:", e);
    return null;
  }
}

// 🔒 3. Safe LocalStorage Set
function noticeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn("Storage 저장 실패:", e);
  }
}

// 공지사항 모달 노출 체크
window.checkNoticeModal = function () {
  const hideUntil = noticeGetItem('hideNoticeModalDate');
  const today = getTodayDateString();

  // 오늘 하루 보지 않기가 설정되어 있지 않은 경우에만 노출
  if (hideUntil !== today) {
    const modal = document.getElementById('noticeModal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }
};

// 공지사항 모달 닫기
window.closeNoticeModal = function () {
  const noShowCheck = document.getElementById('noShowToday');
 
  if (noShowCheck && noShowCheck.checked) {
    const today = getTodayDateString();
    noticeSetItem('hideNoticeModalDate', today);
  }

  const modal = document.getElementById('noticeModal');
  if (modal) {
    modal.style.display = 'none';
  }
};

// 안내 내용은 공지·소식 화면에서 필요할 때 확인합니다.
// 첫 방문 즉시 모달을 띄우면 상담 동선과 서비스 안내를 가리므로 자동 노출하지 않습니다.

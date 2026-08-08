/* ==========================================
   THE ONE CRANE SPARE - board.js (반응형 모달 & 공지고정/필터 완성본)
   ========================================== */

let currentViewingPostId = null;
const BOARD_MAX_IMAGES = 3;

function normalizePostImages(images) {
  if (!Array.isArray(images)) return [];

  return images
    .slice(0, BOARD_MAX_IMAGES)
    .map((image, index) => {
      if (!image || typeof image !== 'object') return null;
      const data = typeof image.data === 'string' ? image.data.trim() : '';
      if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(data)) return null;
      const type = typeof image.type === 'string' && image.type.startsWith('image/')
        ? image.type
        : 'image/jpeg';
      const name = typeof image.name === 'string' && image.name.trim()
        ? image.name.trim().slice(0, 120)
        : `image-${index + 1}.jpg`;
      return { name, type, data };
    })
    .filter(Boolean);
}

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

function formatBoardDate(rawDate) {
  try {
    if (!rawDate) {
      return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    }
    const date = new Date(rawDate);
    if (isNaN(date)) {
      return String(rawDate);
    }
    return date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  } catch (err) {
    return String(rawDate || '');
  }
}

function normalizeNoticeText(value) {
  return String(value || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\[(.*?)\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatBoardDate(rawDate) {
  try {
    if (!rawDate) {
      return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    }
    const date = new Date(rawDate);
    if (isNaN(date)) {
      return String(rawDate);
    }
    return date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  } catch (err) {
    return String(rawDate || '');
  }
}

// 🔒 2. Safe Toast 알림 래퍼
function safeToast(msg, type = 'info') {
  if (typeof window.showToast === 'function') {
    window.showToast(msg, type);
  } else if (typeof showToast === 'function') {
    showToast(msg, type);
  } else {
    alert(msg);
  }
}

// 안전한 게시글 목록 조회
window.__boardPostsCache = null;

window.getLocalBoardPosts = function () {
  try {
    const data = localStorage.getItem('crane_board_posts');
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("게시글 데이터 파싱 오류:", err);
    return [];
  }
};

window.fetchBoardPostsFromApi = async function () {
  try {
    const response = await fetch('/api/board');
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data)) return null;

    return data.map(post => ({
      id: post.id,
      category: (post.category || 'GENERAL'),
      title: post.title || '',
      author: post.writer || post.author || '관리자',
      date: formatBoardDate(post.createdAt || post.date),
      views: Number(post.views || 0),
      content: post.content || '',
      isPinned: Boolean(post.isPinned),
      images: normalizePostImages(post.images)
    }));
  } catch (err) {
    console.warn('게시판 API 불러오기 실패:', err);
    return null;
  }
};

window.getBoardCurrentUser = function () {
  try {
    return JSON.parse(sessionStorage.getItem('currentUser') || 'null');
  } catch (err) {
    console.warn('게시판 작성자 정보 파싱 실패:', err);
    return null;
  }
};

window.mergeBoardPostsWithStoredData = function (apiPosts, storedPosts = window.getLocalBoardPosts()) {
  if (!Array.isArray(apiPosts)) {
    return Array.isArray(storedPosts) ? storedPosts : [];
  }

  const storedMap = new Map((Array.isArray(storedPosts) ? storedPosts : []).map(post => [String(post.id), post]));

  const merged = apiPosts.map(post => {
    const storedPost = storedMap.get(String(post.id));
    return {
      ...post,
      id: post.id,
      category: post.category || storedPost?.category || 'GENERAL',
      title: post.title || storedPost?.title || '',
      author: post.author || post.writer || storedPost?.author || '관리자',
      date: post.date || post.createdAt || storedPost?.date || '',
      views: Number(storedPost?.views ?? post.views ?? 0),
      content: post.content || storedPost?.content || '',
      isPinned: Boolean(post.isPinned ?? storedPost?.isPinned ?? false),
      images: normalizePostImages(post.images || storedPost?.images)
    };
  });

  // 서버 목록을 단일 진실원으로 사용해, 다른 브라우저의 오래된 로컬 게시글이 다시 섞여 들어오지 않게 한다.
  return merged;
};

window.loadBoardPosts = async function () {
  const storedPosts = window.getLocalBoardPosts();
  const apiPosts = await window.fetchBoardPostsFromApi();

  if (Array.isArray(apiPosts)) {
    const syncedPosts = window.mergeBoardPostsWithStoredData(apiPosts, storedPosts);
    window.__boardPostsCache = syncedPosts;
    localStorage.setItem('crane_board_posts', JSON.stringify(syncedPosts));
  } else {
    window.__boardPostsCache = storedPosts;
  }

  window.renderBoardPosts();
  window.renderMainNoticeList();
};

window.getBoardPosts = function () {
  if (Array.isArray(window.__boardPostsCache)) {
    return window.__boardPostsCache;
  }
  return window.getLocalBoardPosts();
};

// 기본 샘플 공지사항
function getDefaultPosts() {
  return [
    {
      id: 1,
      category: "NOTICE",
      title: "더원크레인스페어 시스템 V5.3 통합 관제 센터 정식 오픈 안내",
      author: "대표 조성진",
      date: "2026-07-20",
      views: 128,
      content: "안녕하십니까. 더원크레인스페어 V5.3 시스템이 정식 운영을 시작합니다.",
      isPinned: true
    }
  ];
}

// 게시판 목록 렌더링 (키워드 및 카테고리 전체보기/필터 지원)
window.renderBoardPosts = function (filterKeyword = '', filterCategory = 'ALL') {
  const list = getBoardPosts();
  const tbody = document.getElementById('boardTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  const keyword = filterKeyword.toLowerCase().trim();
 
  // 1. 키워드 및 카테고리 필터링
  let filtered = list.filter(p => {
    const matchKeyword = (p.title || '').toLowerCase().includes(keyword) ||
                         (p.content || '').toLowerCase().includes(keyword) ||
                         (p.author || '').toLowerCase().includes(keyword);

    if (filterCategory === 'NOTICE') {
      return matchKeyword && (p.category === 'NOTICE' || p.isPinned);
    } else if (filterCategory === 'GENERAL') {
      return matchKeyword && p.category !== 'NOTICE' && !p.isPinned;
    }
    return matchKeyword; // 'ALL' (전체보기)
  });

  // 2. 공지고정 항목 우선 정렬
  filtered.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

  if (filtered.length === 0) {
    const row = document.createElement('tr');
    row.className = 'board-empty-row';
    const cell = document.createElement('td');
    cell.setAttribute('colspan', '5');
    cell.textContent = '등록된 게시글이 없습니다.';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  filtered.forEach((post, index) => {
    const tr = document.createElement('tr');
    tr.className = 'board-table-row';
    tr.onclick = () => openBoardViewModal(post.id);

    const safeTitle = escapeHtml(post.title);
    const safeAuthor = escapeHtml(post.author);
    const isNotice = post.category === 'NOTICE' || post.isPinned;
    const safeCategory = isNotice ? '<span class="board-pin-badge">[공지]</span> ' : '';

    tr.innerHTML = `
      <td class="board-table-col-center">${post.isPinned ? '📌' : (filtered.length - index)}</td>
      <td>
        ${safeCategory}
        <b>${safeTitle}</b>
      </td>
      <td class="board-table-col-center">${safeAuthor}</td>
      <td class="board-table-col-center">${escapeHtml(post.date)}</td>
      <td class="board-table-col-center">${Number(post.views || 0)}</td>
    `;
    tbody.appendChild(tr);
  });
};

// 메인 화면 공지사항 위젯 렌더링
window.renderMainNoticeList = function () {
  const list = getBoardPosts().filter(p => p.category === 'NOTICE' || p.isPinned);
  const ul = document.getElementById('mainNoticeList');
  if (!ul) return;

  ul.innerHTML = '';
  const visibleItems = list.slice(0, 4);

  visibleItems.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'main-notice-item';
    if (index === 0) li.classList.add('is-active');
    li.onclick = () => {
      if (typeof window.showTab === 'function') {
        window.showTab('board');
      } else if (typeof showTab === 'function') {
        showTab('board');
      }
      openBoardViewModal(item.id);
    };

    const safeTitle = escapeHtml(normalizeNoticeText(item.title));
    const safeAuthor = escapeHtml(item.author || '관리자');
    const safeDate = escapeHtml(item.date);

    li.innerHTML = `<span class="main-notice-badge">📢</span><div class="main-notice-copy"><strong>${safeTitle}</strong><span class="main-notice-meta"><span class="main-notice-author">${safeAuthor}</span><span class="main-notice-date">${safeDate}</span></span></div>`;
    ul.appendChild(li);
  });

  if (window.__mainNoticeSliderTimer) {
    clearInterval(window.__mainNoticeSliderTimer);
  }

  if (visibleItems.length > 1) {
    window.__mainNoticeSliderIndex = 0;
    window.__mainNoticeSliderTimer = setInterval(() => {
      const items = Array.from(ul.querySelectorAll('.main-notice-item'));
      if (!items.length) return;
      const current = window.__mainNoticeSliderIndex || 0;
      items[current]?.classList.remove('is-active');
      window.__mainNoticeSliderIndex = (current + 1) % items.length;
      items[window.__mainNoticeSliderIndex]?.classList.add('is-active');
    }, 4500);
  }
};

// 검색 및 전체보기/카테고리 변경 처리
window.searchBoardPosts = function () {
  const input = document.getElementById('boardSearchInput');
  const catSelect = document.getElementById('boardFilterCategory');
 
  const val = input ? input.value : '';
  const cat = catSelect ? catSelect.value : 'ALL';
 
  renderBoardPosts(val, cat);
};

// 글쓰기 모달 열기 (관리자 공지/상단고정 옵션 제어)
window.checkAndShowBoardWriteModal = function () {
  const isAdmin = sessionStorage.getItem('is_admin_logged_in') === 'true';
  const authorInput = document.getElementById('boardAuthorDisplay');
  const categorySelect = document.getElementById('boardCategory');
  const pinnedCheckbox = document.getElementById('boardIsPinned');
  const currentUser = window.getBoardCurrentUser();

  if (authorInput) {
    authorInput.value = isAdmin
      ? "관리자 (대표 조성진)"
      : (currentUser?.name ? `${currentUser.name}` : "외부 현장 회원");
  }

  // 관리자가 아닐 경우 공지사항 선택 및 상단 고정 체크박스 비활성화
  if (categorySelect) {
    const noticeOption = categorySelect.querySelector('option[value="NOTICE"]');
    if (!isAdmin) {
      if (noticeOption) noticeOption.disabled = true;
      categorySelect.value = 'GENERAL';
    } else {
      if (noticeOption) noticeOption.disabled = false;
    }
  }

  if (pinnedCheckbox) {
    pinnedCheckbox.checked = false;
    pinnedCheckbox.disabled = !isAdmin;
    const pinnedWrap = pinnedCheckbox.closest('.pinned-wrap') || pinnedCheckbox.parentElement;
    if (pinnedWrap) {
      pinnedWrap.style.display = isAdmin ? 'flex' : 'none';
    }
  }

  const modal = document.getElementById('boardWriteModal');
  if (modal) modal.style.display = 'flex';
};

// 글쓰기 모달 닫기
window.closeBoardWriteModal = function () {
  const modal = document.getElementById('boardWriteModal');
  if (modal) modal.style.display = 'none';

  const titleElem = document.getElementById('boardTitle');
  const contentElem = document.getElementById('boardContent');
  const pinnedCheckbox = document.getElementById('boardIsPinned');

  if (titleElem) titleElem.value = '';
  if (contentElem) contentElem.value = '';
  if (pinnedCheckbox) pinnedCheckbox.checked = false;

  selectedImages = [];
  renderImagePreview();
};

// 게시글 작성 제출 처리 (공지고정 및 작성자 검증)
window.handleBoardSubmit = async function (e) {
  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault();
  }

  const isAdmin = sessionStorage.getItem('is_admin_logged_in') === 'true';
  const currentUser = window.getBoardCurrentUser();

  const categoryElem = document.getElementById('boardCategory');
  const titleElem = document.getElementById('boardTitle');
  const contentElem = document.getElementById('boardContent');
  const pinnedElem = document.getElementById('boardIsPinned');

  let category = categoryElem ? categoryElem.value : 'GENERAL';
  const title = titleElem ? titleElem.value.trim() : '';
  const content = contentElem ? contentElem.value.trim() : '';
  const isPinnedChecked = pinnedElem ? pinnedElem.checked : false;
  const author = isAdmin
    ? "관리자 (대표 조성진)"
    : (currentUser?.name || "외부 현장 회원");

  if (!isAdmin && category === 'NOTICE') {
    safeToast("공지사항은 관리자만 작성할 수 있습니다.", "warning");
    return;
  }

  if (!title || !content) {
    safeToast("제목과 내용을 모두 입력해 주세요.", "warning");
    return;
  }

  const attachedImages = normalizePostImages(selectedImages);

  try {
    const now = new Date();
    const dateString = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const newPost = {
      id: Date.now(),
      category: isAdmin ? category : 'GENERAL',
      title,
      author,
      date: dateString,
      views: 0,
      content,
      isPinned: isAdmin && (category === 'NOTICE' || isPinnedChecked),
      images: attachedImages
    };

    let currentPosts = getBoardPosts();
    if (!Array.isArray(currentPosts)) {
      currentPosts = getDefaultPosts();
    }

    currentPosts.unshift(newPost);
    localStorage.setItem('crane_board_posts', JSON.stringify(currentPosts));
    window.__boardPostsCache = currentPosts;

    if (isAdmin) {
      const token = sessionStorage.getItem('theone_secure_token');
      if (token) {
        try {
          const response = await fetch('/api/board', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              title,
              content,
              writer: author,
              category,
              isPinned: newPost.isPinned,
              images: attachedImages
            })
          });
          if (response.ok) {
            const result = await response.json();
            if (result?.success && result.data) {
              const savedPost = {
                id: result.data.id,
                category: result.data.category || category,
                title: result.data.title,
                author: result.data.writer,
                date: formatBoardDate(result.data.createdAt || dateString),
                views: 0,
                content: result.data.content,
                isPinned: Boolean(result.data.isPinned || newPost.isPinned),
                images: normalizePostImages(result.data.images || attachedImages)
              };
              currentPosts[0] = savedPost;
              localStorage.setItem('crane_board_posts', JSON.stringify(currentPosts));
              window.__boardPostsCache = currentPosts;
            }
          }
        } catch (apiErr) {
          console.warn('게시판 서버 저장 실패:', apiErr);
        }
      }
    }

    safeToast("게시글이 성공적으로 등록되었습니다.", "success");
    closeBoardWriteModal();

    searchBoardPosts();
    renderMainNoticeList();

  } catch (err) {
    console.error("게시글 저장 중 오류:", err);
    safeToast("게시글 저장에 실패했습니다.", "error");
  }
};

// 게시글 상세 모달 보기
window.openBoardViewModal = async function (id) {
  const posts = getBoardPosts();
  const post = posts.find(p => String(p.id) === String(id));
  if (!post) return;

  currentViewingPostId = id;
  post.views = (post.views || 0) + 1;
  window.__boardPostsCache = posts;
 
  try {
    localStorage.setItem('crane_board_posts', JSON.stringify(posts));
  } catch (e) {
    console.error("조회수 업데이트 실패:", e);
  }

  try {
    const response = await fetch(`/api/board/${encodeURIComponent(id)}/views`, { method: 'PUT' });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result?.success && typeof result.data?.views === 'number') {
      post.views = result.data.views;
      window.__boardPostsCache = posts;
      localStorage.setItem('crane_board_posts', JSON.stringify(posts));
    }
  } catch (e) {
    console.warn('조회수 서버 반영 실패:', e);
  }

  const badgeElem = document.getElementById('viewModalBadge');
  const titleElem = document.getElementById('viewModalTitle');
  const authorElem = document.getElementById('viewModalAuthor');
  const dateElem = document.getElementById('viewModalDate');
  const contentElem = document.getElementById('viewModalContent');
  const postImages = normalizePostImages(post.images);

  if (badgeElem) badgeElem.innerText = (post.category === 'NOTICE' || post.isPinned) ? '📢 공지사항' : '💬 일반글';
  if (titleElem) titleElem.innerText = post.title;
  if (authorElem) authorElem.innerText = `작성자: ${post.author}`;
  if (dateElem) dateElem.innerText = `등록일: ${post.date}`;
  if (contentElem) {
    const safeContent = escapeHtml(post.content || '').replace(/\n/g, '<br>');
    const imageGridClass = `post-images count-${Math.min(postImages.length, BOARD_MAX_IMAGES)}`;
    const imagesHtml = postImages.length
      ? `
        <div class="${imageGridClass}">
          ${postImages.map((image, index) => `
            <button type="button" class="post-image-trigger" data-image-index="${index}" aria-label="첨부 이미지 ${index + 1} 열기">
              <img src="${image.data}" alt="첨부 이미지 ${index + 1}" class="post-image">
            </button>
          `).join('')}
        </div>
      `
      : '';

    contentElem.innerHTML = `
      <div class="board-view-text">${safeContent}</div>
      ${imagesHtml}
    `;

    const imageButtons = contentElem.querySelectorAll('.post-image-trigger');
    imageButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.getAttribute('data-image-index') || '0');
        window.openBoardImageModal(postImages, index);
      });
    });
  }

  const isAdmin = sessionStorage.getItem('is_admin_logged_in') === 'true';
  const adminActions = document.getElementById('viewModalAdminActions');
  if (adminActions) adminActions.style.display = isAdmin ? 'flex' : 'none';

  const viewModal = document.getElementById('boardViewModal');
  if (viewModal) viewModal.style.display = 'flex';

  searchBoardPosts();
};

// 상세 모달 닫기
window.closeBoardViewModal = function () {
  const modal = document.getElementById('boardViewModal');
  if (modal) modal.style.display = 'none';
};

// 게시글 삭제
window.deleteCurrentPost = async function () {
  if (!currentViewingPostId) return;

  if (!confirm("게시글을 영구 삭제하시겠습니까?")) return;

  const token = (typeof window.getAdminToken === 'function' ? window.getAdminToken() : '') || sessionStorage.getItem('theone_secure_token') || '';

  try {
    if (token) {
      const response = await fetch(`/api/board/${encodeURIComponent(currentViewingPostId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || '삭제에 실패했습니다.');
      }
    }

    let posts = getBoardPosts();
    posts = posts.filter(p => String(p.id) !== String(currentViewingPostId));
    window.__boardPostsCache = posts;
    localStorage.setItem('crane_board_posts', JSON.stringify(posts));

    currentViewingPostId = null;
    safeToast("게시글이 삭제되었습니다.", "warning");
    closeBoardViewModal();

    const refreshed = await window.fetchBoardPostsFromApi();
    if (Array.isArray(refreshed)) {
      const merged = window.mergeBoardPostsWithStoredData(refreshed, posts);
      window.__boardPostsCache = merged;
      localStorage.setItem('crane_board_posts', JSON.stringify(merged));
    }

    window.renderBoardPosts();
    window.renderMainNoticeList();
  } catch (err) {
    console.error("게시글 삭제 실패:", err);
    safeToast(err.message || "삭제 중 오류가 발생했습니다.", "error");
  }
};

// 📌 현재 열람 중인 게시글의 상단 고정 토글 (관리자 전용 버튼)
window.toggleCurrentPostPinned = function () {
  if (!currentViewingPostId) return;
  try {
    const posts = getBoardPosts();
    const post = posts.find(p => String(p.id) === String(currentViewingPostId));
    if (!post) return;
    post.isPinned = !post.isPinned;
    window.__boardPostsCache = posts;
    localStorage.setItem('crane_board_posts', JSON.stringify(posts));
    safeToast(post.isPinned ? '게시글이 상단에 고정되었습니다.' : '상단 고정이 해제되었습니다.', 'success');
    searchBoardPosts();
    renderMainNoticeList();
  } catch (err) {
    console.error("공지 고정 토글 실패:", err);
  }
};

// 🚀 DOM 로드 완료 후 자동 초기화
document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.loadBoardPosts === 'function') {
    window.loadBoardPosts();
  } else {
    if (typeof searchBoardPosts === 'function') searchBoardPosts();
    if (typeof renderMainNoticeList === 'function') renderMainNoticeList();
  }

  // 상세 모달의 '공지 고정' 버튼 배선 (기존에는 핸들러가 없어 클릭해도 무동작)
  const pinBtn = document.getElementById('btnToggleNotice');
  if (pinBtn) pinBtn.addEventListener('click', window.toggleCurrentPostPinned);

  const imageModalContent = document.querySelector('#boardImageModal .board-image-modal-content');
  if (imageModalContent) {
    imageModalContent.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  const prevBtn = document.getElementById('boardImagePrev');
  const nextBtn = document.getElementById('boardImageNext');
  if (prevBtn) prevBtn.addEventListener('click', () => window.moveBoardImageModal(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => window.moveBoardImageModal(1));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      window.closeBoardImageModal();
      return;
    }
    const modal = document.getElementById('boardImageModal');
    if (!modal || modal.style.display !== 'flex') return;
    if (event.key === 'ArrowLeft') window.moveBoardImageModal(-1);
    if (event.key === 'ArrowRight') window.moveBoardImageModal(1);
  });
});

// ========================================
// 게시글 사진 첨부 / 미리보기
// ========================================

let selectedImages = [];
let boardImageModalState = { images: [], index: 0 };

const imageUpload = document.getElementById("imageUpload");
const imagePreview = document.getElementById("imagePreview");

if (imageUpload) {
    imageUpload.addEventListener("change", function (event) {

        const files = Array.from(event.target.files || []);
        const remainingSlots = BOARD_MAX_IMAGES - selectedImages.length;

        if (remainingSlots <= 0) {
            safeToast(`사진은 최대 ${BOARD_MAX_IMAGES}장까지 첨부할 수 있습니다.`, "warning");
            imageUpload.value = "";
            return;
        }

        if (files.length > remainingSlots) {
            safeToast(`사진은 최대 ${BOARD_MAX_IMAGES}장까지 첨부할 수 있습니다.`, "warning");
        }

        const targetFiles = files.slice(0, remainingSlots);

        targetFiles.forEach(file => {

            if (!file.type.startsWith("image/")) {
                return;
            }

            const reader = new FileReader();

            reader.onload = function (e) {

                const imageData = {
                    name: file.name,
                    type: file.type,
                    data: e.target.result
                };

                selectedImages.push(imageData);

                renderImagePreview();
            };

            reader.readAsDataURL(file);
        });

        // 같은 파일 다시 선택 가능하도록 초기화
        imageUpload.value = "";
    });
}


// ========================================
// 사진 미리보기 출력
// ========================================

function renderImagePreview() {

    if (!imagePreview) return;

    imagePreview.innerHTML = "";
  imagePreview.classList.remove('count-1', 'count-2', 'count-3');

  const count = Math.min(selectedImages.length, BOARD_MAX_IMAGES);
  if (count > 0) {
    imagePreview.classList.add(`count-${count}`);
  }

    selectedImages.forEach((image, index) => {

        const wrapper = document.createElement("div");

        wrapper.className = "image-preview-item";

        wrapper.innerHTML = `
          <img src="${image.data}" alt="첨부사진 ${index + 1}" class="image-preview-thumb">

            <button
                type="button"
                class="image-remove-btn"
                onclick="removeSelectedImage(${index})"
            >
                ×
            </button>
        `;

        const previewImage = wrapper.querySelector('.image-preview-thumb');
        if (previewImage) {
          previewImage.addEventListener('click', () => {
            window.openBoardImageModal(selectedImages, index);
          });
        }

        imagePreview.appendChild(wrapper);
    });
}


// ========================================
// 선택한 사진 삭제
// ========================================

function removeSelectedImage(index) {

    selectedImages.splice(index, 1);

    renderImagePreview();
}

window.openBoardImageModal = function (images, index = 0) {
  const modal = document.getElementById('boardImageModal');
  const imageElem = document.getElementById('boardImageModalImage');
  const counterElem = document.getElementById('boardImageModalCounter');

  const normalized = normalizePostImages(images);
  if (!modal || !imageElem || !counterElem || !normalized.length) return;

  const safeIndex = Math.max(0, Math.min(Number(index) || 0, normalized.length - 1));
  boardImageModalState = { images: normalized, index: safeIndex };

  const current = normalized[safeIndex];
  imageElem.src = current.data;
  imageElem.alt = `첨부 이미지 ${safeIndex + 1}`;
  counterElem.textContent = `${safeIndex + 1} / ${normalized.length}`;

  const navVisible = normalized.length > 1;
  const prevBtn = document.getElementById('boardImagePrev');
  const nextBtn = document.getElementById('boardImageNext');
  if (prevBtn) prevBtn.style.display = navVisible ? 'inline-flex' : 'none';
  if (nextBtn) nextBtn.style.display = navVisible ? 'inline-flex' : 'none';

  modal.style.display = 'flex';
};

window.moveBoardImageModal = function (delta) {
  const modal = document.getElementById('boardImageModal');
  if (!modal || modal.style.display !== 'flex') return;

  const images = boardImageModalState.images || [];
  if (!images.length) return;

  const currentIndex = Number(boardImageModalState.index || 0);
  const nextIndex = (currentIndex + Number(delta) + images.length) % images.length;
  window.openBoardImageModal(images, nextIndex);
};

window.closeBoardImageModal = function () {
  const modal = document.getElementById('boardImageModal');
  const imageElem = document.getElementById('boardImageModalImage');
  const counterElem = document.getElementById('boardImageModalCounter');

  if (modal) modal.style.display = 'none';
  if (imageElem) {
    imageElem.src = '';
    imageElem.alt = '첨부 이미지 미리보기';
  }
  if (counterElem) counterElem.textContent = '';

  boardImageModalState = { images: [], index: 0 };
};
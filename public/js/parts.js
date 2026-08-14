// =========================================================
// 🛒 부품 상품 DB 및 렌더링 로직 (보안 및 안전 강화 버전)
// =========================================================

window.spareProducts = [];

// 🔒 1. XSS 소독 함수 (HTML 태그 차단)
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 🔒 2. Safe URL 검증 함수 (javascript: 프로토콜 XSS 공격 차단)
function sanitizeUrl(url) {
    if (!url) return '';
    const trimmed = String(url).trim();
    if (/^(javascript|data|vbscript):/i.test(trimmed)) {
        return '#';
    }
    return escapeHtml(trimmed);
}

// 🔒 3. Toast 알림 예외 처리 래퍼
function safeToast(msg, type = 'info') {
    if (typeof showToast === 'function') {
        showToast(msg, type);
    } else {
        alert(msg);
    }
}

// 1. 서버 부품 목록 불러오기 (같은 서버가 정적 페이지를 서빙하므로 상대경로 호출)
window.loadProducts = async function() {
    try {
        const response = await fetch('/api/products');
        const data = response.ok ? await response.json() : [];
        window.spareProducts = Array.isArray(data) ? data : [];
    } catch (err) {
        console.warn("부품 목록 서버 연결 실패:", err);
        window.spareProducts = [];
    }

    if (typeof renderUserProducts === 'function') renderUserProducts();
    if (typeof renderAdminProducts === 'function') renderAdminProducts();
};

// 2. 사용자 상품 목록 렌더링 (XSS 방지 + URL 소독 + Fallback 이미지)
window.renderUserProducts = function(filterType = 'ALL') {
    const container = document.getElementById('productGridOutput');
    if (!container) return;

    const filtered = window.spareProducts.filter(p => filterType === 'ALL' || p.type === filterType);

    if (filtered.length === 0) {
        container.innerHTML = '<div style="width:100%; text-align:center; padding: 40px; color:#999; font-size:13px;">등록된 부품 상품이 없습니다.</div>';
        return;
    }

    const fallbackImg = 'https://images.unsplash.com/photo-1537462715879-360eeb61a0bc?auto=format&fit=crop&w=400&q=80';

    container.innerHTML = filtered.map(p => {
        const badgeClass = p.type === 'NEW' ? 'new' : 'used';
        const badgeText = p.type === 'NEW' ? '새상품' : '중고';
       
        const titleEscaped = escapeHtml(p.title);
        const descEscaped = escapeHtml(p.desc);
        const priceEscaped = escapeHtml(p.price);
        const imgSanitized = sanitizeUrl(p.image) || fallbackImg;
        const linkSanitized = sanitizeUrl(p.link);

        return `
            <div class="product-card">
                <div class="card-img-wrap">
                    <span class="badge ${badgeClass}">${badgeText}</span>
                    <img src="${imgSanitized}" alt="${titleEscaped}" onerror="this.src='${fallbackImg}';">
                </div>
                <div class="card-body">
                    <div class="card-title" title="${titleEscaped}">${titleEscaped}</div>
                    <div class="card-price">${priceEscaped} 원</div>
                    <div class="card-desc">${descEscaped}</div>
                    ${linkSanitized === 'https://used-modal' || linkSanitized === ''
                        ? `
                        <button class="buy-btn used-btn" style="cursor:pointer !important;" onclick="showUsedTradeModal()">
                            직거래 문의
                        </button>
                        `
                        : `
                        <a href="${linkSanitized}" target="_blank" rel="noopener noreferrer" class="buy-btn">
                            도매 바로가기 (구매)
                        </a>
                        `
                    }
                </div>
            </div>
        `;
    }).join('');
};

// 부품/제품 카테고리 필터링
window.filterProducts = function(category) {
    const items = document.querySelectorAll('.product-item');
    const buttons = document.querySelectorAll('.category-btn');

    buttons.forEach(btn => btn.classList.remove('active'));
    if (window.event && window.event.currentTarget) {
        window.event.currentTarget.classList.add('active');
    }

    items.forEach(item => {
        const itemCategory = item.getAttribute('data-category');
        if (category === 'all' || itemCategory === category) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
};

// 3. 관리자 상품 목록 렌더링
window.renderAdminProducts = function() {
    const tbody = document.getElementById('adminProductList');
    if (!tbody) return;

    if (!window.spareProducts || window.spareProducts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">등록된 부품이 없습니다.</td></tr>';
        return;
    }

    const fallbackImg = 'https://via.placeholder.com/40';

    tbody.innerHTML = window.spareProducts.map(p => {
        const typeText = p.type === 'NEW'
            ? '<span style="color:#10b981;font-weight:bold;">새상품</span>'
            : '<span style="color:#f59e0b;font-weight:bold;">중고</span>';

        const safeId = escapeHtml(String(p.id));
        const titleEscaped = escapeHtml(p.title);
        const priceEscaped = escapeHtml(p.price);
        const linkSanitized = sanitizeUrl(p.link);
        const imgSanitized = sanitizeUrl(p.image) || fallbackImg;

        return `
            <tr>
                <td>${typeText}</td>
                <td><img src="${imgSanitized}" style="width:40px; height:40px; object-fit:cover;" onerror="this.src='${fallbackImg}';"></td>
                <td style="font-weight:bold;">${titleEscaped}</td>
                <td style="color:#dc2626; font-weight:bold;">${priceEscaped} 원</td>
                <td><a href="${linkSanitized}" target="_blank" rel="noopener noreferrer" style="color:#1e3a8a; word-break:break-all;">${linkSanitized}</a></td>
                <td><button class="btn-del" style="padding:5px; font-size:11px; cursor:pointer;" onclick="deleteProduct('${safeId}')">삭제</button></td>
            </tr>
        `;
    }).join('');
};

// 4. 필터링 버튼 동작
window.filterProducts = function(type, btnElement) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    renderUserProducts(type);
};

// 5. 상품 등록 핸들러
window.toggleProductTypeSelection = function(changedCheckbox) {
    if (!changedCheckbox || !changedCheckbox.checked) return;

    const otherId = changedCheckbox.id === 'pTypeNew' ? 'pTypeUsed' : 'pTypeNew';
    const otherCheckbox = document.getElementById(otherId);
    if (otherCheckbox) {
        otherCheckbox.checked = false;
    }
};

window.handleProductSubmit = async function(e) {
    e.preventDefault();

    const isNewChecked = document.getElementById('pTypeNew')?.checked;
    const isUsedChecked = document.getElementById('pTypeUsed')?.checked;
    let type = 'NEW';

    if (isUsedChecked && !isNewChecked) {
        type = 'USED';
    } else if (isNewChecked && !isUsedChecked) {
        type = 'NEW';
    }

    const title = document.getElementById('pName')?.value || '';
    const price = document.getElementById('pPrice')?.value || '0';
    let image = document.getElementById('pImg')?.value.trim() || '';
    const link = document.getElementById('pLink')?.value || '';
    const desc = document.getElementById('pDesc')?.value || '';

    if (!image) {
        image = 'https://images.unsplash.com/photo-1537462715879-360eeb61a0bc?auto=format&fit=crop&w=400&q=80';
    }

    const newProd = { type, title, price, image, link, desc };
    const token = sessionStorage.getItem("theone_secure_token") || "";

    try {
        const response = await fetch('/api/products', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(newProd)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            safeToast("신규 부품 등록 완료", "success");
            e.target.reset();
            await loadProducts();
        } else {
            safeToast("등록 실패: " + (result.error || ""), "error");
        }
    } catch (err) {
        console.error("상품 등록 실패:", err);
        safeToast("서버 연결 실패", "error");
    }
};

// 6. 상품 삭제 핸들러
window.deleteProduct = async function(id) {
    if (!confirm('이 부품을 삭제하시겠습니까?')) return;

    const token = sessionStorage.getItem("theone_secure_token") || "";

    try {
        const response = await fetch(`/api/products/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (response.ok && result.success) {
            safeToast("상품 삭제 완료", "success");
            await loadProducts();
        } else {
            safeToast("삭제 실패", "error");
        }
    } catch (err) {
        console.error("상품 삭제 오류:", err);
        safeToast("서버 연결 실패", "error");
    }
};

// 7. 약관 동의 후 2단계 전환
window.showSalesStep2 = function() {
    const agreeCheck = document.getElementById('salesPrivacyAgree');
    if (!agreeCheck || !agreeCheck.checked) {
        alert('아웃바운드 링크 연결을 위한 약관에 동의하셔야 합니다.');
        return;
    }
   
    const stepPrivacy = document.getElementById('step-privacy');
    const stepMall = document.getElementById('step-mall');
    if (stepPrivacy) stepPrivacy.style.display = 'none';
    if (stepMall) stepMall.style.display = 'block';

    if (window.spareProducts.length === 0) {
        loadProducts();
    } else {
        renderUserProducts('ALL');
    }
};

// 8. 모달 제어
window.showUsedTradeModal = function() {
    const modal = document.getElementById('usedTradeModal');
    if (modal) modal.style.display = 'flex';
};

window.closeUsedTradeModal = function() {
    const modal = document.getElementById('usedTradeModal');
    if (modal) modal.style.display = 'none';
};

// ---------------------------------------------------------
// 인테리어 시공 상담 / 시공 사진 갤러리 기능
// ---------------------------------------------------------
window.interiorGalleryPhotos = [];
const INTERIOR_GALLERY_STORAGE_KEY = 'theone_interior_gallery_items';

window.loadInteriorGallery = async function() {
    try {
        const response = await fetch('/api/interior-gallery');
        if (response.ok) {
            const result = await response.json();
            const items = Array.isArray(result?.items) ? result.items : [];
            window.interiorGalleryPhotos = items;
            if (typeof window.renderInteriorGallery === 'function') {
                window.renderInteriorGallery();
            }
            return;
        }
    } catch (error) {
        console.warn('[InteriorGallery] 서버 로드 실패. 마지막 안전장치로 로컬 저장소를 확인합니다.', error);
    }

    try {
        const raw = localStorage.getItem(INTERIOR_GALLERY_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        const localItems = Array.isArray(parsed) ? parsed : [];
        window.interiorGalleryPhotos = localItems.slice(0, 5);
    } catch (error) {
        console.error('[InteriorGallery] 저장된 데이터 읽기 실패:', error);
        window.interiorGalleryPhotos = [];
    }

    if (typeof window.renderInteriorGallery === 'function') {
        window.renderInteriorGallery();
    }
};

window.saveInteriorGallery = async function() {
    try {
        localStorage.setItem(INTERIOR_GALLERY_STORAGE_KEY, JSON.stringify(window.interiorGalleryPhotos));
    } catch (error) {
        console.error('[InteriorGallery] 로컬 저장 실패:', error);
    }

    if (!window.canManageInteriorGallery()) return;

    try {
        const response = await fetch('/api/interior-gallery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('theone_secure_token') || ''}` },
            body: JSON.stringify(window.interiorGalleryPhotos)
        });

        if (!response.ok) {
            console.warn('[InteriorGallery] 서버 저장 실패');
        }
    } catch (error) {
        console.warn('[InteriorGallery] 서버 저장 중 네트워크 오류:', error);
    }
};

window.resizeImageForGallery = function(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function() {
            const img = new Image();
            img.onload = function() {
                const maxSize = 1600;
                const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(img.width * scale));
                canvas.height = Math.max(1, Math.round(img.height * scale));
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.72));
            };
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

window.canManageInteriorGallery = function() {
    const adminFlag = sessionStorage.getItem('is_admin_logged_in') === 'true';
    const token = sessionStorage.getItem('theone_secure_token') || '';
    return Boolean(window.isAdminSessionActive?.() || (adminFlag && token));
};

window.parseInteriorContact = function() {
    const fallbackLegacy = document.getElementById('interiorName')?.value.trim() || '';
    const company = document.getElementById('interiorCompany')?.value.trim() || '';
    const manager = document.getElementById('interiorManager')?.value.trim() || '';

    if (company || manager) {
        return {
            company: company || '미입력',
            name: manager || '미입력'
        };
    }

    if (!fallbackLegacy) {
        return { company: '', name: '' };
    }

    const split = fallbackLegacy.split('/');
    const first = split[0]?.trim() || '';
    const second = split[1]?.trim() || '';

    return {
        company: first || fallbackLegacy,
        name: second || fallbackLegacy
    };
};

window.activateInteriorPanel = function(target) {
    const mainTabs = document.querySelectorAll('.parts-main-tab');
    const panels = document.querySelectorAll('.parts-main-panel');

    mainTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.partsTab === target);
    });
    panels.forEach(panel => {
        panel.classList.toggle('active', panel.id === (target === 'parts' ? 'parts-main-panel' : 'interior-main-panel'));
    });
};

window.activateInteriorSubTab = function(target) {
    const tabs = document.querySelectorAll('.interior-tab');
    const panels = document.querySelectorAll('.interior-panel');

    tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.interiorTab === target);
    });
    panels.forEach(panel => {
        panel.classList.toggle('active', panel.id === (target === 'consult' ? 'interior-consult-panel' : 'interior-gallery-panel'));
    });
};

window.handleInteriorConsultSubmit = async function(event) {
    event.preventDefault();

    const contact = window.parseInteriorContact();
    const tel = document.getElementById('interiorTel')?.value.trim();
    const type = document.getElementById('interiorType')?.value || '인테리어 시공';
    const memo = document.getElementById('interiorMemo')?.value.trim() || '';
    const consent = document.getElementById('interiorPrivacyCheck')?.checked;

    if (!contact.company || !contact.name || !tel) {
        safeToast('상호, 담당자명, 연락처를 모두 입력해 주세요.', 'warning');
        return;
    }

    if (!consent) {
        safeToast('개인정보 수집 동의가 필요합니다.', 'warning');
        return;
    }

    const payload = {
        id: Date.now(),
        type: 'interior',
        category: '인테리어 시공 상담',
        company: contact.company,
        tel: window.sanitizeTel ? window.sanitizeTel(tel) : tel,
        item: type,
        memo,
        date: new Date().toISOString()
    };

    try {
        const response = await fetch('/api/inbox/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...payload,
                company: contact.company,
                name: contact.name,
                craneType: type,
                type,
                possibleType: type,
                memo
            })
        });

        if (!response.ok) {
            throw new Error('상담 신청 저장 실패');
        }

        safeToast('인테리어 시공 상담 신청이 접수되었습니다.', 'success');
        event.target.reset();
    } catch (error) {
        console.error(error);
        safeToast('상담 신청 접수 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.', 'error');
    }
};

window.renderInteriorGallery = function() {
    const grid = document.getElementById('interiorGalleryGrid');
    const selectedInfo = document.getElementById('interiorGallerySelectedInfo');
    const uploader = document.getElementById('interiorGalleryUploader');
    const canManage = window.canManageInteriorGallery();

    const uploadInput = document.getElementById('interiorPhotoUpload');
    const clearButton = document.querySelector('.gallery-clear-btn');
    if (uploader) uploader.style.display = canManage ? 'grid' : 'none';
    if (uploadInput) uploadInput.disabled = !canManage;
    if (clearButton) clearButton.style.display = canManage ? 'inline-flex' : 'none';

    if (selectedInfo) {
        const fileName = uploadInput && uploadInput.files && uploadInput.files[0] ? uploadInput.files[0].name : '선택된 사진이 없습니다.';
        selectedInfo.textContent = canManage ? `선택된 사진: ${fileName}` : '관리자만 사진을 등록할 수 있습니다.';
    }

    if (!grid) return;

    if (window.interiorGalleryPhotos.length === 0) {
        grid.innerHTML = '<div style="padding:24px; border:1px dashed #dbe7f1; border-radius:14px; color:#64748b; text-align:center;">등록된 시공 사진이 없습니다.</div>';
        return;
    }

    grid.innerHTML = window.interiorGalleryPhotos.map((photo, index) => `
        <div class="interior-photo-card">
            ${canManage ? `<button type="button" class="remove-photo" data-index="${index}" aria-label="사진 삭제">×</button>` : ''}
            <img src="${photo.image || photo.src || photo}" alt="${escapeHtml(photo.title || '시공 사진 ' + (index + 1))}" data-index="${index}" class="interior-gallery-image">
            <div class="photo-meta">
                <strong>${escapeHtml(photo.title || `시공 사진 ${index + 1}`)}</strong>
                <p>${escapeHtml(photo.description || '시공 사진입니다.')}</p>
            </div>
        </div>
    `).join('');

    grid.querySelectorAll('.interior-gallery-image').forEach((img) => {
        img.addEventListener('click', () => {
            const index = Number(img.dataset.index);
            const item = window.interiorGalleryPhotos[index];
            if (!item) return;
            const modal = document.getElementById('interiorImageModal');
            if (!modal) return;
            const imgEl = document.getElementById('interiorImageModalImage');
            const titleEl = document.getElementById('interiorImageModalTitle');
            const descEl = document.getElementById('interiorImageModalDesc');
            if (imgEl) imgEl.src = item.image || item.src || item;
            if (titleEl) titleEl.textContent = item.title || `시공 사진 ${index + 1}`;
            if (descEl) descEl.textContent = item.description || '시공 사진입니다.';
            modal.classList.add('active');
        });
    });

    if (canManage) {
        grid.querySelectorAll('.remove-photo').forEach(button => {
            button.addEventListener('click', async (event) => {
                const idx = Number(event.currentTarget.dataset.index);
                const target = window.interiorGalleryPhotos[idx];
                if (!target) return;

                window.interiorGalleryPhotos.splice(idx, 1);
                if (target.id) {
                    try {
                        await fetch(`/api/interior-gallery/${encodeURIComponent(target.id)}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('theone_secure_token') || ''}` }
                        });
                    } catch (error) {
                        console.warn('[InteriorGallery] 서버 삭제 실패:', error);
                    }
                }
                await window.saveInteriorGallery();
                window.renderInteriorGallery();
            });
        });
    }
};

window.clearInteriorGallery = async function() {
    if (!window.canManageInteriorGallery()) {
        safeToast('관리자만 시공 사진을 초기화할 수 있습니다.', 'warning');
        return;
    }

    window.interiorGalleryPhotos = [];
    try {
        await fetch('/api/interior-gallery', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('theone_secure_token') || ''}` }
        });
    } catch (error) {
        console.warn('[InteriorGallery] 서버 초기화 실패:', error);
    }
    await window.saveInteriorGallery();
    window.renderInteriorGallery();
};

window.submitInteriorGalleryPhoto = async function() {
    if (!window.canManageInteriorGallery()) {
        safeToast('관리자 권한이 있어야 시공 사진을 올릴 수 있습니다.', 'warning');
        return;
    }

    const uploadInput = document.getElementById('interiorPhotoUpload');
    const files = uploadInput && uploadInput.files ? Array.from(uploadInput.files) : [];
    if (files.length === 0) {
        safeToast('업로드할 사진을 선택해 주세요.', 'warning');
        return;
    }

    const validFiles = files.filter((file) => file.type.startsWith('image/'));
    if (validFiles.length === 0) {
        safeToast('이미지 파일만 업로드할 수 있습니다.', 'warning');
        return;
    }

    const currentCount = window.interiorGalleryPhotos.length;
    const remainingSlots = Math.max(0, 5 - currentCount);
    if (remainingSlots <= 0) {
        safeToast('갤러리는 최대 5장까지 저장됩니다. 기존 사진을 삭제한 뒤 다시 업로드해 주세요.', 'warning');
        return;
    }

    const selectedFiles = validFiles.slice(0, remainingSlots);
    if (selectedFiles.length < validFiles.length) {
        safeToast(`최대 ${remainingSlots}장까지만 등록할 수 있습니다. 나머지 이미지는 자동으로 제외되었습니다.`, 'warning');
    }

    const title = (document.getElementById('interiorGalleryTitle')?.value || '').trim() || '시공 사진';
    const description = (document.getElementById('interiorGalleryDesc')?.value || '').trim() || '시공 사진입니다.';

    try {
        const converted = [];
        for (const file of selectedFiles) {
            const dataUrl = await window.resizeImageForGallery(file);
            converted.push({
                id: Date.now() + Math.random(),
                image: dataUrl,
                title,
                description
            });
        }

        window.interiorGalleryPhotos = [...converted, ...window.interiorGalleryPhotos].slice(0, 5);
        await window.saveInteriorGallery();
        window.renderInteriorGallery();

        if (document.getElementById('interiorGalleryTitle')) document.getElementById('interiorGalleryTitle').value = '';
        if (document.getElementById('interiorGalleryDesc')) document.getElementById('interiorGalleryDesc').value = '';
        if (uploadInput) uploadInput.value = '';
        const info = document.getElementById('interiorGallerySelectedInfo');
        if (info) info.textContent = '선택된 사진이 없습니다. (최대 5장)';

        safeToast(`${converted.length}장의 시공 사진이 등록되었습니다.`, 'success');
    } catch (error) {
        console.error('[InteriorGallery] 이미지 저장 실패:', error);
        safeToast('사진 변환 중 오류가 발생했습니다. 이미지를 다시 선택해 주세요.', 'error');
    }
};

window.handleInteriorPhotoUpload = function(event) {
    const files = event.target.files ? Array.from(event.target.files) : [];
    const validCount = files.filter((file) => file.type.startsWith('image/')).length;
    const info = document.getElementById('interiorGallerySelectedInfo');
    if (info) {
        info.textContent = validCount > 0 ? `선택된 사진: ${Math.min(validCount, 5 - window.interiorGalleryPhotos.length)}장 (최대 5장)` : '선택된 사진이 없습니다. (최대 5장)';
    }
};

// 페이지 로드시 자동 데이터 준비
document.addEventListener('DOMContentLoaded', () => {
    loadProducts();

    const mainTabs = document.querySelectorAll('.parts-main-tab');
    mainTabs.forEach(tab => {
        tab.addEventListener('click', () => activateInteriorPanel(tab.dataset.partsTab));
    });

    const subTabs = document.querySelectorAll('.interior-tab');
    subTabs.forEach(tab => {
        tab.addEventListener('click', () => activateInteriorSubTab(tab.dataset.interiorTab));
    });

    const uploadInput = document.getElementById('interiorPhotoUpload');
    if (uploadInput) {
        uploadInput.addEventListener('change', handleInteriorPhotoUpload);
    }

    const modal = document.getElementById('interiorImageModal');
    if (!modal) {
        const modalHtml = `
            <div id="interiorImageModal" class="interior-image-modal" aria-modal="true" role="dialog">
                <div class="interior-image-modal-content">
                    <button type="button" class="interior-image-modal-close" onclick="document.getElementById('interiorImageModal').classList.remove('active')">✕</button>
                    <img id="interiorImageModalImage" src="" alt="확대 시공 사진">
                    <div class="interior-image-modal-meta">
                        <strong id="interiorImageModalTitle">시공 사진</strong>
                        <p id="interiorImageModalDesc">시공 사진입니다.</p>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    loadInteriorGallery().finally(() => {
        renderInteriorGallery();
    });
});
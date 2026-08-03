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

// 페이지 로드시 자동 데이터 준비
document.addEventListener('DOMContentLoaded', () => {
    loadProducts();
});
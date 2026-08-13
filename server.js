const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios'); // 알림용 추가
const { calcOrderMoney, createOrderFromInquiry, findMissingOrderFields } = require('./shared/settlement');
const { listVisitorSessions: listVisitorSessionsFromStore } = require('./shared/visitorSessions');
const { getAdminTokenTtl } = require('./shared/authConfig');

const dotenvCandidates = [
    path.join(__dirname, '.env'),
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '..', '.env')
];
let loadedDotenvPath = '';
for (const candidate of dotenvCandidates) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    dotenv.config({ path: candidate, override: false });
    loadedDotenvPath = candidate;
    break;
}
if (loadedDotenvPath) {
    console.log(`[Config] .env loaded from: ${loadedDotenvPath}`);
} else {
    console.warn('[Config] .env file not found. Using process environment variables only.');
}

const app = express();
const PORT = Number(process.env.PORT || 3001);
const JWT_SECRET = process.env.JWT_SECRET || 'theonecrane-local-jwt-secret-20260801-please-change';
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || 'theonecrane-admin-20260801';
const FALLBACK_ADMIN_PASSWORDS = [
    'theonecrane-admin-20260801',
    'THEONE_MASTER_CODE_2026',
    MASTER_PASSWORD
].filter(Boolean);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://theonecrane.kr,https://www.theonecrane.kr,http://localhost:3001,http://127.0.0.1:3001';
const BOARD_MAX_IMAGES = 3;
const BOARD_MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const BOARD_ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const TELEGRAM_CONFIG_PATH = path.join(DATA_DIR, 'telegram.config.json');
let telegramLastStatus = {
    ok: null,
    error: '',
    context: '',
    sentAt: '',
    source: 'MISSING'
};

function getAllowedOrigins() {
    return (CORS_ORIGIN || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
}

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
}
if (!process.env.MASTER_PASSWORD || process.env.MASTER_PASSWORD.length < 12) {
    console.warn('[Auth] MASTER_PASSWORD is not configured. Falling back to local default password.');
}

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use((req, res, next) => {
    const host = String(req.headers.host || '').split(':')[0].toLowerCase();
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
    const isHttps = req.secure || forwardedProto === 'https' || forwardedProto === 'wss';

    if ((host === 'theonecrane.kr' || host === 'www.theonecrane.kr') && !isHttps) {
        return res.redirect(301, `https://${host}${req.originalUrl}`);
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', req.path.startsWith('/api/') ? 'no-store' : 'no-cache, max-age=0, must-revalidate');
    next();
});
app.use(cors({
    origin(origin, callback) {
        const allowedOrigins = getAllowedOrigins();
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        // 동일 출처 요청도 브라우저는 Origin 헤더를 보내므로, 미허용 출처는 에러 대신
        // CORS 헤더만 생략한다(같은 출처 요청은 CORS 검사 자체가 없어 정상 동작).
        return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
}));
app.use(express.json({ limit: '25mb', strict: true }));
app.use(express.text({ type: ['text/plain'], limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '25mb' }));
// Always revalidate static assets so urgent customer-facing fixes are not hidden by a stale browser cache.
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', maxAge: 0, etag: true }));
app.get('/favicon.ico', (req, res) => res.status(204).end());

const attempts = new Map();
// 만료된 카운터를 주기적으로 비워 장기 가동 시 메모리 누적을 막는다.
setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of attempts) {
        if (now - entry.startedAt >= 60 * 60 * 1000) attempts.delete(id);
    }
}, 30 * 60 * 1000).unref();
function rateLimit({ windowMs, max, key = (req) => req.ip }) {
    return (req, res, next) => {
        const now = Date.now();
        const id = key(req);
        const entry = attempts.get(id);
        if (!entry || now - entry.startedAt >= windowMs) {
            attempts.set(id, { startedAt: now, count: 1 });
            return next();
        }
        entry.count += 1;
        if (entry.count > max) return res.status(429).json({ success: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
        next();
    };
}

function cleanText(value, maxLength = 500) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanPhone(value) {
    return cleanText(value, 30).replace(/[^0-9+\-() ]/g, '');
}

function normalizePhone(value) {
    return String(value || '').replace(/[^0-9]/g, '').trim();
}

function extractDriverPhones(driver) {
    const set = new Set();

    const collect = (value) => {
        if (!value) return;
        if (Array.isArray(value)) {
            value.forEach(collect);
            return;
        }
        if (typeof value === 'object') {
            Object.values(value).forEach(collect);
            return;
        }
        const phone = normalizePhone(value);
        if (phone.length >= 9) set.add(phone);
    };

    if (driver && typeof driver === 'object') {
        collect(driver.tel);
        collect(driver.phone);
        collect(driver.mobile);
        collect(driver.contactTel);
        collect(driver.contactPhone);
        collect(driver.driverTel);
        collect(driver.driverPhone);
        collect(driver.user?.phone);
    }

    return Array.from(set);
}

function getRecentOnlinePhones() {
    const cutoff = Date.now() - 15 * 60 * 1000;
    const onlinePhones = new Set();

    for (const session of visitorSessions.values()) {
        const lastSeen = new Date(session?.lastSeenAt || 0).getTime();
        const phone = normalizePhone(session?.phone);
        if (!phone || !Number.isFinite(lastSeen) || lastSeen < cutoff) continue;
        onlinePhones.add(phone);
    }

    return onlinePhones;
}

function readTelegramConfig() {
    try {
        if (!fs.existsSync(TELEGRAM_CONFIG_PATH)) return null;
        const raw = fs.readFileSync(TELEGRAM_CONFIG_PATH, 'utf8').trim();
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (err) {
        console.warn('[Telegram] telegram.config.json 파싱 실패:', err.message);
        return null;
    }
}

function parseTelegramToken(rawToken) {
    const value = String(rawToken || '').trim();
    if (!value) return '';

    // 운영 환경에서 전체 URL이나 bot prefix가 같이 들어오더라도 토큰 본문만 추출한다.
    const urlMatch = value.match(/\/bot([^/]+)\/(sendMessage|sendPhoto|sendDocument)/i);
    if (urlMatch && urlMatch[1]) return String(urlMatch[1]).trim();

    return value.replace(/^bot/i, '').trim();
}

function parseTelegramChatIds(rawChatId) {
    if (Array.isArray(rawChatId)) {
        return rawChatId
            .map(item => String(item || '').trim())
            .filter(Boolean);
    }

    return String(rawChatId || '')
        .split(/[\n,;\s]+/)
        .map(item => item.trim())
        .filter(Boolean);
}

function getTelegramCredentials() {
    const fileConfig = readTelegramConfig() || {};
    const token = parseTelegramToken(
        process.env.TELEGRAM_BOT_TOKEN
        || process.env.TELEGRAM_TOKEN
        || process.env.TG_BOT_TOKEN
        || process.env.TELEGRAM_TOKEN_VALUE
        || fileConfig.botToken
        || fileConfig.token
        || fileConfig.telegramBotToken
        || fileConfig.telegram_token
        || ''
    );

    const chatIds = parseTelegramChatIds(
        process.env.TELEGRAM_CHAT_ID
        || process.env.TELEGRAM_CHAT_IDS
        || process.env.TELEGRAM_TARGET_CHAT_ID
        || process.env.TG_CHAT_ID
        || process.env.TELEGRAM_CHATID
        || process.env.TELEGRAM_TARGET_CHAT
        || fileConfig.chatId
        || fileConfig.chatID
        || fileConfig.chat_id
        || fileConfig.telegramChatId
        || fileConfig.telegram_chat_id
        || fileConfig.targetChatId
        || fileConfig.chatIds
        || fileConfig.telegramChatIds
        || ''
    );

    const chatId = chatIds[0] || '';
    return { token, chatId, chatIds };
}

function getTelegramCredentialSource() {
    if (process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.TG_BOT_TOKEN) {
        return 'ENV';
    }
    if (process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_TARGET_CHAT_ID || process.env.TG_CHAT_ID || process.env.TELEGRAM_CHATID) {
        return 'ENV';
    }
    const fileConfig = readTelegramConfig() || {};
    if ((fileConfig.botToken || fileConfig.token) && (fileConfig.chatId || fileConfig.targetChatId)) {
        return 'DATA_FILE';
    }
    return 'MISSING';
}

function sanitizeBoardImages(images) {
    if (!Array.isArray(images)) return [];

    const sanitized = [];
    for (const raw of images) {
        if (sanitized.length >= BOARD_MAX_IMAGES) break;
        if (!raw || typeof raw !== 'object') continue;

        const rawData = typeof raw.data === 'string' ? raw.data.trim() : '';
        const match = rawData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
        if (!match) continue;

        const mimeType = String(match[1] || '').toLowerCase();
        if (!BOARD_ALLOWED_IMAGE_TYPES.has(mimeType)) continue;

        const base64Data = match[2] || '';
        const byteSize = Buffer.byteLength(base64Data, 'base64');
        if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > BOARD_MAX_IMAGE_BYTES) continue;

        sanitized.push({
            name: cleanText(raw.name || `image-${sanitized.length + 1}`, 120),
            type: mimeType,
            data: `data:${mimeType};base64,${base64Data}`
        });
    }

    return sanitized;
}

function buildUserPayload(user) {
    if (!user || typeof user !== 'object') return null;
    const { pw, ...safeUser } = user;
    return safeUser;
}

function buildUserToken(user) {
    if (!user || typeof user !== 'object') return '';
    return jwt.sign({ sub: String(user.id || user.phone || ''), phone: String(user.phone || ''), role: 'user' }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '12h', issuer: 'theonecrane', audience: 'user' });
}

const visitorSessions = new Map();

function getVisitorSessionKey(user, req, sessionHint = '') {
    const authHeader = String(req?.headers?.authorization || req?.headers?.['x-session-token'] || '');
    const normalizedToken = String(sessionHint || authHeader.replace(/^Bearer\s+/i, '').trim() || '').trim();
    const userKey = String(user?.id || user?.phone || req?.ip || 'unknown');
    const clientKey = String(req?.headers?.['x-forwarded-for'] || req?.ip || 'unknown');
    return `${clientKey}:${userKey}:${normalizedToken || 'anon'}`;
}

function registerVisitorSession(user, req, sessionHint = '') {
    if (!user || typeof user !== 'object') return null;
    const identifier = getVisitorSessionKey(user, req, sessionHint);
    const now = new Date().toISOString();
    const stableUserId = String(user.id || user.phone || identifier);
    const session = {
        id: stableUserId,
        sessionKey: identifier,
        userId: stableUserId,
        name: cleanText(user.name, 50) || '회원',
        phone: cleanText(user.phone, 30) || '',
        role: cleanText(user.role, 20) || 'USER',
        memo: cleanText(user.memo, 1000) || '',
        adminMemo: cleanText(user.adminMemo, 2000) || '',
        lastSeenAt: now,
        userAgent: cleanText(req.headers['user-agent'] || '', 500)
    };
    visitorSessions.set(identifier, session);
    return session;
}

function listVisitorSessions() {
    return listVisitorSessionsFromStore(visitorSessions, Date.now());
}

function touchVisitorSession(user, req, sessionHint = '') {
    if (!user || typeof user !== 'object') return null;
    const session = registerVisitorSession(user, req, sessionHint);
    if (session) {
        const key = getVisitorSessionKey(user, req, sessionHint);
        const existing = visitorSessions.get(key);
        if (existing) {
            existing.lastSeenAt = new Date().toISOString();
            existing.name = session.name;
            existing.phone = session.phone;
            existing.role = session.role;
            existing.memo = session.memo;
            existing.adminMemo = session.adminMemo;
            existing.userAgent = session.userAgent;
            existing.id = session.id;
            existing.sessionKey = session.sessionKey;
            existing.userId = session.userId;
        }
    }
    return session;
}

const authenticateUser = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
    if (!token) return res.status(401).json({ success: false, error: '인증 토큰이 필요합니다.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], issuer: 'theonecrane', audience: 'user' });
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, error: '세션이 만료되었습니다.' });
    }
};

function buildInquiry(body, fields) {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const record = {};
    for (const field of fields) record[field] = field === 'tel' ? cleanPhone(input[field]) : cleanText(input[field]);
    return record;
}

app.post('/api/inbox/request', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), (req, res) => {
    const inbox = readData('inbox_req');
    const inquiry = buildInquiry(req.body, ['company', 'name', 'tel', 'type', 'memo']);
    if (!inquiry.name || !inquiry.tel || !inquiry.type) return res.status(400).json({ success: false, error: '성함, 연락처, 기종은 필수입니다.' });

    const newReq = {
        id: crypto.randomUUID(),
        _id: crypto.randomUUID(),
        time: new Date().toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul"
        }),
        ...inquiry
    };

    inbox.push(newReq);
    if (!saveData('inbox_req', inbox)) return res.status(500).json({ success: false, error: '접수 저장에 실패했습니다.' });

    void sendTelegram(
    `🔔 [신규 배치 문의]

    회사 : ${newReq.company}
    성함 : ${newReq.name}
    연락처 : ${newReq.tel}
    차종 : ${newReq.type}
    내용 : ${newReq.memo}
    접수시간 : ${newReq.time}`,
    'INBOX_REQUEST'
    );

    res.json({ success: true });

});

app.post('/api/inbox/driver', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), (req, res) => {
    const inbox = readData('inbox_drv');
    const inquiry = buildInquiry(req.body, ['name', 'tel', 'type', 'cert', 'memo']);
    if (!inquiry.name || !inquiry.tel || !inquiry.type) return res.status(400).json({ success: false, error: '성함, 연락처, 기종은 필수입니다.' });

    const newDrv = {
        id: crypto.randomUUID(),
        _id: crypto.randomUUID(),
        time: new Date().toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul"
        }),
        ...inquiry
    };

    inbox.push(newDrv);
    if (!saveData('inbox_drv', inbox)) return res.status(500).json({ success: false, error: '접수 저장에 실패했습니다.' });

    void sendTelegram(
    `🚚 [신규 기사 신청]

    성함 : ${newDrv.name}
    연락처 : ${newDrv.tel}
    기종 : ${newDrv.type}
    자격증 : ${newDrv.cert}
    메모 : ${newDrv.memo}
    접수시간 : ${newDrv.time}`,
    'INBOX_DRIVER'
    );
    res.json({ success: true });
});

let telegramMissingConfigLogged = false;
let telegramSourceLogged = false;
const sendTelegram = async (msg, context = 'GENERAL') => {

    const { token, chatId, chatIds } = getTelegramCredentials();
    if (!telegramSourceLogged) {
        telegramSourceLogged = true;
        console.log(`[Telegram] credential source: ${getTelegramCredentialSource()}`);
    }

    telegramLastStatus.source = getTelegramCredentialSource();
    telegramLastStatus.context = context;
    telegramLastStatus.sentAt = new Date().toISOString();

    try {

        if (!token || (!chatId && !chatIds.length)) {
            if (!telegramMissingConfigLogged) {
                telegramMissingConfigLogged = true;
                console.error('[Telegram] 설정값이 없어 전송을 건너뜁니다. TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID 또는 data/telegram.config.json을 확인하세요.');
            }
            telegramLastStatus.ok = false;
            telegramLastStatus.error = 'TELEGRAM_ENV_MISSING';
            return { ok: false, error: 'TELEGRAM_ENV_MISSING' };
        }

        const targets = chatIds.length ? chatIds : [chatId];

        for (const targetChatId of targets) {
            for (let attempt = 1; attempt <= 2; attempt += 1) {
                try {
                    const response = await axios.post(
                        `https://api.telegram.org/bot${token}/sendMessage`,
                        {
                            chat_id: targetChatId,
                            text: String(msg || '').slice(0, 4000)
                        },
                        {
                            timeout: 10000
                        }
                    );

                    if (response?.data?.ok !== true) {
                        const apiError = response?.data?.description || 'TELEGRAM_API_NOT_OK';
                        console.error(`[Telegram] 실패 (${context})`, response?.data || 'Unknown API response');
                        telegramLastStatus.ok = false;
                        telegramLastStatus.error = String(apiError);
                        return { ok: false, error: apiError };
                    }

                    telegramLastStatus.ok = true;
                    telegramLastStatus.error = '';
                    break;
                } catch (err) {
                    const detail = err.response?.data?.description || err.response?.data || err.message || 'Unknown error';
                    if (attempt >= 2) {
                        console.error(`[Telegram] 실패 (${context})`, detail);
                        telegramLastStatus.ok = false;
                        telegramLastStatus.error = String(detail);
                        return { ok: false, error: String(detail) };
                    }
                }
            }
        }

        return { ok: true };

    } catch (err) {

        const detail = err.response?.data?.description || err.response?.data || err.message || 'Unknown error';
        console.error(`[Telegram] 실패 (${context})`, detail);
        telegramLastStatus.ok = false;
        telegramLastStatus.error = String(detail);
        return { ok: false, error: String(detail) };

    }
};

const FILES = {
    orders: path.join(DATA_DIR, 'orders.json'),
    inbox_req: path.join(DATA_DIR, 'inbox_req.json'),
    inbox_drv: path.join(DATA_DIR, 'inbox_drv.json'),
    drivers_pool: path.join(DATA_DIR, 'drivers_pool.json'),
    products: path.join(DATA_DIR, 'products.json'),
    board: path.join(DATA_DIR, 'board.json'),
    notice: path.join(DATA_DIR, 'notice.json'),
    users: path.join(DATA_DIR, 'users.json'),
    
    // [Phase 2] 렌탈 서비스 데이터 매핑 추가
    rental_req: path.join(DATA_DIR, 'rental_req.json'),
    rental_reg: path.join(DATA_DIR, 'rental_reg.json')
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
Object.values(FILES).forEach(fp => {
    if (!fs.existsSync(fp) || fs.readFileSync(fp, 'utf8').trim() === "") {
        fs.writeFileSync(fp, JSON.stringify([])); // 파일이 없으면 자동 생성됨!
    }
});

function readData(key) {
    if (!FILES[key] || !fs.existsSync(FILES[key]))
        return [];

    try {
        const data = fs.readFileSync(FILES[key], 'utf8');
        return JSON.parse(data || '[]');
    } catch (err) {
        console.error(`readData 오류 (${key})`, err.message);
        return [];
    }
}

function saveData(key, data) {
    try {
        if (!FILES[key])
            throw new Error(`정의되지 않은 키`);

        const tempPath = `${FILES[key]}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tempPath, FILES[key]);

        return true;
    } catch (err) {
        console.error(`saveData 오류 (${key})`, err.message);
        return false;
    }
}

const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
    if (!token) return res.status(401).json({ success: false, error: "인증 누락" });
    try {
        jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], issuer: 'theonecrane', audience: 'admin' });
        next();
    } catch (err) { return res.status(401).json({ success: false, error: "세션 만료" }); }
};

app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 8, key: (req) => `login:${req.ip}` }), (req, res) => {
    const password = cleanText(req.body?.password, 256);
    const supplied = Buffer.from(password);
    const expected = Buffer.from(MASTER_PASSWORD);
    const directMatch = password && FALLBACK_ADMIN_PASSWORDS.includes(password);
    const safeMatch = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
    if (directMatch || safeMatch) {
        return res.json({ success: true, token: jwt.sign({ role: "admin" }, JWT_SECRET, { algorithm: 'HS256', expiresIn: getAdminTokenTtl(), issuer: 'theonecrane', audience: 'admin' }) });
    }
    return res.status(401).json({ success: false, error: "인증 정보가 올바르지 않습니다." });
});

app.post('/api/admin/telegram/test', authenticateAdmin, async (req, res) => {
    const message = cleanText(req.body?.message, 500) || `🧪 [텔레그램 테스트]\n\n시간 : ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
    const result = await sendTelegram(message, 'ADMIN_TEST');

    if (!result.ok) {
        return res.status(500).json({ success: false, error: '텔레그램 전송 실패', detail: result.error });
    }

    return res.json({ success: true, message: '텔레그램 전송 성공' });
});

app.get('/api/admin/telegram/status', authenticateAdmin, (req, res) => {
    const { token, chatIds } = getTelegramCredentials();
    const source = getTelegramCredentialSource();

    return res.json({
        success: true,
        configured: Boolean(token && Array.isArray(chatIds) && chatIds.length > 0),
        tokenConfigured: Boolean(token),
        chatIdsConfigured: Array.isArray(chatIds) && chatIds.length > 0,
        chatIdCount: Array.isArray(chatIds) ? chatIds.length : 0,
        source,
        last: telegramLastStatus
    });
});

app.post('/api/user/register', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, key: (req) => `user-register:${req.ip}` }), (req, res) => {
    const name = cleanText(req.body?.name, 50);
    const rawPhone = cleanText(req.body?.phone, 30);
    const phone = rawPhone.replace(/[^0-9]/g, '');
    const password = cleanText(req.body?.password || req.body?.pw, 256);
    const role = cleanText(req.body?.role, 20) || 'USER';
    const craneType = cleanText(req.body?.craneType, 100);
    const memo = cleanText(req.body?.memo, 500);

    if (!name || !phone || !password) {
        return res.status(400).json({ success: false, error: '이름, 휴대폰, 비밀번호를 모두 입력해 주세요.' });
    }
    if (password.length < 4) {
        return res.status(400).json({ success: false, error: '비밀번호는 4자리 이상이어야 합니다.' });
    }

    const users = readData('users');
    if (users.some(user => String(user.phone) === phone)) {
        return res.status(409).json({ success: false, error: '이미 등록된 휴대폰 번호입니다.' });
    }

    const newUser = {
        id: crypto.randomUUID(),
        name,
        phone,
        pw: password,
        role,
        craneType: role === 'DRIVER' ? craneType : '',
        memo: role === 'DRIVER' ? memo : '',
        editable: false,
        regDate: new Date().toISOString().slice(0, 10)
    };

    users.push(newUser);
    if (!saveData('users', users)) {
        return res.status(500).json({ success: false, error: '회원 저장에 실패했습니다.' });
    }

    void sendTelegram(
`🆕 [신규 회원 등록]

이름 : ${newUser.name}
연락처 : ${newUser.phone}
구분 : ${newUser.role}
기종 : ${newUser.craneType || '-'}
메모 : ${newUser.memo || '-'}
등록일 : ${newUser.regDate}`,
'USER_REGISTER');

    return res.json({ success: true, token: buildUserToken(newUser), user: buildUserPayload(newUser), users });
});

app.get('/api/user/me', authenticateUser, (req, res) => {
    const users = readData('users');
    const user = users.find(item => String(item.id) === String(req.user.sub) || String(item.phone) === String(req.user.phone));
    if (!user) return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
    const authToken = typeof req.headers.authorization === 'string'
        ? req.headers.authorization.replace(/^Bearer\s+/i, '').trim()
        : '';
    touchVisitorSession(user, req, authToken);
    return res.json({ success: true, user: buildUserPayload(user) });
});

app.put('/api/user/me', authenticateUser, (req, res) => {
    const users = readData('users');
    const target = users.find(item => String(item.id) === String(req.user.sub) || String(item.phone) === String(req.user.phone));
    if (!target) return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
    if (!target.editable) return res.status(403).json({ success: false, error: '정보 수정 권한이 없습니다.' });

    const name = cleanText(req.body?.name, 50);
    const rawPhone = cleanText(req.body?.phone, 30);
    const phone = rawPhone.replace(/[^0-9]/g, '');
    const craneType = cleanText(req.body?.craneType, 100);
    const memo = cleanText(req.body?.memo, 500);

    if (!name || !phone) {
        return res.status(400).json({ success: false, error: '이름과 연락처는 필수입니다.' });
    }

    const duplicate = users.find(item => String(item.phone) === phone && String(item.id) !== String(target.id));
    if (duplicate) {
        return res.status(409).json({ success: false, error: '이미 등록된 휴대폰 번호입니다.' });
    }

    target.name = name;
    target.phone = phone;
    if (target.role === 'DRIVER') {
        target.craneType = craneType;
        target.memo = memo;
    } else {
        target.craneType = '';
        target.memo = '';
    }

    if (!saveData('users', users)) {
        return res.status(500).json({ success: false, error: '회원 정보 저장에 실패했습니다.' });
    }

    return res.json({ success: true, user: buildUserPayload(target), users });
});

app.put('/api/admin/users/:id/editable', authenticateAdmin, (req, res) => {
    const users = readData('users');
    const target = users.find(item => String(item.id) === String(req.params.id) || String(item.phone) === String(req.params.id));
    if (!target) return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });

    const editable = req.body?.editable === true || req.body?.editable === 'true';
    target.editable = Boolean(editable);

    if (!saveData('users', users)) {
        return res.status(500).json({ success: false, error: '권한 변경 저장에 실패했습니다.' });
    }

    if (target.editable) {
        void sendTelegram(
`🔐 [회원 정보 수정 권한 부여]

이름 : ${target.name || '-'}
연락처 : ${target.phone || '-'}
구분 : ${target.role || '-'}
권한 : 허용
처리일 : ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
'USER_EDITABLE_GRANTED');
    }

    return res.json({ success: true, user: buildUserPayload(target), users });
});

app.put('/api/admin/users/:id/memo', authenticateAdmin, (req, res) => {
    const users = readData('users');
    const target = users.find(item => String(item.id) === String(req.params.id) || String(item.phone) === String(req.params.id));
    if (!target) return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });

    const memo = cleanText(req.body?.memo || req.body?.adminMemo, 2000);
    target.adminMemo = memo;
    target.adminMemoAt = new Date().toISOString();

    if (!saveData('users', users)) {
        return res.status(500).json({ success: false, error: '메모 저장에 실패했습니다.' });
    }

    const sessionKey = String(target.id || target.phone || '');
    const visitor = visitorSessions.get(sessionKey);
    if (visitor) {
        visitor.adminMemo = memo;
        visitor.lastSeenAt = new Date().toISOString();
    }

    return res.json({ success: true, user: buildUserPayload(target), users });
});

app.delete('/api/admin/users/:id', authenticateAdmin, (req, res) => {
    const targetId = String(req.params.id || '').trim();
    const users = readData('users');
    const target = users.find(item => String(item.id) === targetId || String(item.phone) === targetId);
    if (!target) return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });

    const nextUsers = users.filter(item => String(item.id) !== targetId && String(item.phone) !== targetId);
    if (!saveData('users', nextUsers)) {
        return res.status(500).json({ success: false, error: '회원 삭제 저장에 실패했습니다.' });
    }

    for (const [sessionKey, session] of visitorSessions.entries()) {
        const sessionUserId = String(session?.userId || session?.id || '');
        const sessionPhone = String(session?.phone || '');
        const targetUserId = String(target.id || '');
        const targetPhone = String(target.phone || '');
        if (sessionUserId === targetUserId || sessionPhone === targetPhone) {
            visitorSessions.delete(sessionKey);
        }
    }

    return res.json({ success: true, users: nextUsers });
});

app.get('/api/admin/visitors', authenticateAdmin, (req, res) => {
    res.json(listVisitorSessions());
});

// 로그인한 사용자가 브라우저에 머무는 동안 세션을 갱신하는 heartbeat
app.post('/api/user/heartbeat', (req, res) => {
    const authHeader = String(req.headers['authorization'] || '');
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ success: false });
    try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], issuer: 'theonecrane', audience: 'user' });
        const users = readData('users');
        const user = users.find(u => String(u.id) === String(decoded.sub) || String(u.phone) === String(decoded.phone));
        if (user) touchVisitorSession(user, req, token);
        return res.json({ success: true });
    } catch {
        return res.status(401).json({ success: false });
    }
});

app.post('/api/user/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 30, key: (req) => `user-login:${req.ip}` }), (req, res) => {
    const rawPhone = cleanText(req.body?.phone, 30);
    const phone = rawPhone.replace(/[^0-9]/g, '');
    const password = cleanText(req.body?.password || req.body?.pw, 256);

    if (!phone || !password) {
        return res.status(400).json({ success: false, error: '휴대폰 번호와 비밀번호를 모두 입력해 주세요.' });
    }

    const users = readData('users');
    const user = users.find(item => String(item.phone) === phone && String(item.pw) === password);
    if (!user) {
        return res.status(401).json({ success: false, error: '휴대폰 번호 또는 비밀번호가 일치하지 않습니다.' });
    }

    const token = buildUserToken(user);
    const sessionHint = `${token}:${crypto.randomUUID()}`;
    touchVisitorSession(user, req, sessionHint);
    return res.json({ success: true, token, user: buildUserPayload(user), users });
});

app.get('/api/admin/orders', authenticateAdmin, (req, res) => res.json(readData('orders')));
app.get('/api/admin/users', authenticateAdmin, (req, res) => {
    res.json(readData('users'));
});
app.get('/api/products', (req, res) => {
    res.json(readData('products'));
});

app.get('/api/public/drivers-count', (req, res) => {
    const pool = readData('drivers_pool');
    const list = Array.isArray(pool) ? pool : [];
    const count = list.filter((driver) => driver && driver.approved !== false).length;
    res.json({ count });
});

app.get('/api/drivers-pool', authenticateAdmin, (req, res) => {
    const pool = readData('drivers_pool');
    const onlinePhones = getRecentOnlinePhones();

    const result = pool.map(d => {
        const driverPhones = extractDriverPhones(d);
        const isApproved = d.approved !== false;
        const hasActiveSession = isApproved && driverPhones.some(phone => onlinePhones.has(phone));
        const manualOnline = isApproved ? Boolean(d.manualOnline ?? d.isOnline ?? false) : false;
        const isOnline = hasActiveSession || manualOnline;
        const onlineSource = hasActiveSession ? 'AUTO' : (manualOnline ? 'MANUAL' : 'OFF');
        return {
            ...d,
            approved: isApproved,
            manualOnline,
            isOnline,
            onlineSource
        };
    });

    res.json(result);
});

app.post('/api/admin/orders', authenticateAdmin, (req, res) => {
    const orders = readData('orders');
    const uuid = crypto.randomUUID();
    const missingFields = findMissingOrderFields(req.body);
    if (missingFields.length) {
        return res.status(400).json({ success: false, error: `필수 입력값이 부족합니다: ${missingFields.join(', ')}` });
    }
    // 클라이언트 body가 서버 발급 id/_id/time을 덮어쓰지 못하도록 spread를 앞에 둔다.
    const newOrder = { ...req.body, id: uuid, _id: uuid, time: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) };
    orders.push(newOrder);
    saveData('orders', orders);
    res.status(201).json({ success: true, data: newOrder });
});

app.post('/api/products', authenticateAdmin, (req, res) => {
    let products = readData('products');
    const newProduct = {
        id: crypto.randomUUID(),
        ...req.body,
        createdAt: new Date().toLocaleString('sv', {
            timeZone: 'Asia/Seoul'
        })
    };
    products.push(newProduct);
    saveData('products', products);
    res.json({ success: true, data: newProduct });
});

app.delete('/api/products/:id', authenticateAdmin, (req, res) => {
    let products = readData('products');
    products = products.filter(p => String(p.id) !== String(req.params.id));
    saveData('products', products);
    res.json({ success: true });
});

app.put('/api/admin/orders/:id/:field', authenticateAdmin, (req, res) => {
    const { id, field } = req.params;
    const { value } = req.body;

    const allowedFields = [
        "dispatchStatus",
        "payStatus",
        "invoice"
    ];

    if (!allowedFields.includes(field)) {
        return res.status(400).json({
            success: false,
            error: "허용되지 않은 필드입니다."
        });
    }

    const orders = readData("orders");

    const targetOrder = orders.find(
        o => String(o.id) === String(id)
    );

    if (!targetOrder) {
        return res.status(404).json({
            success: false,
            error: "해당 오더를 찾을 수 없습니다."
        });
    }

    targetOrder[field] = value;

    if (!saveData("orders", orders)) {
        return res.status(500).json({
            success: false,
            error: "데이터 저장 실패"
        });
    }

    res.json({
        success: true,
        data: targetOrder
    });
});

app.put('/api/admin/rental/status/:type/:id', authenticateAdmin, (req,res)=>{
    const fileKey = req.params.type === "request" ? "rental_req" : (req.params.type === "register" ? "rental_reg" : null);
    if (!fileKey) return res.status(400).json({ success: false, error: '잘못된 렌탈 유형입니다.' });

    let list=readData(fileKey);

    const item=list.find(x=>String(x.id)===req.params.id);

    if(!item){
        return res.status(404).json({success:false});
    }

    if(fileKey==="rental_req"){
        item.status =
            item.status==="접수대기"
            ? "배차완료"
            : "접수대기";
    }else{

        item.status =
            item.status==="승인대기"
            ? "승인완료"
            : "승인대기";
    }

    saveData(fileKey,list);

    res.json({
        success:true,
        status:item.status
    });

});

app.delete('/api/admin/orders/:id', authenticateAdmin, (req, res) => {
    let orders = readData('orders').filter(o => String(o.id) !== String(req.params.id) && String(o._id) !== String(req.params.id));
    saveData('orders', orders);
    res.json({ success: true });
});

app.post('/api/admin/orders/cleanup-ghost', authenticateAdmin, (req, res) => {
    let { date, company, amt } = req.body;
    let orders = readData('orders').filter(o => !( (!o._id || o._id === '0') && o.date === date && o.company === company && Number(o.amt) === Number(amt) ));
    saveData('orders', orders);
    res.json({ success: true });
});

app.delete('/api/admin/inbox/request/:id', authenticateAdmin, (req, res) => {
    const inbox = readData('inbox_req');
    const item = inbox.find(entry => String(entry.id) === String(req.params.id) || String(entry._id) === String(req.params.id));
    if (!item) return res.status(404).json({ success: false, error: '요청을 찾을 수 없습니다.' });

    const nextInbox = inbox.filter(entry => String(entry.id) !== String(req.params.id) && String(entry._id) !== String(req.params.id));
    if (!saveData('inbox_req', nextInbox)) return res.status(500).json({ success: false, error: '문의 삭제에 실패했습니다.' });

    res.json({ success: true, data: item });
});

app.delete('/api/admin/inbox/:type/:id', authenticateAdmin, (req, res) => {
    const fileKey = (req.params.type === 'request') ? 'inbox_req' : 'inbox_drv';
    let data = readData(fileKey);
    data = data.filter(item => String(item.id) !== String(req.params.id));
    saveData(fileKey, data);
    res.json({ success: true });
});

app.post('/api/admin/approve-driver', authenticateAdmin, (req, res) => {
    const { id } = req.body;
    let inbox = readData('inbox_drv');
    let pool = readData('drivers_pool');
    const driver = inbox.find(d => String(d.id) === String(id) || String(d._id) === String(id));

    if(!driver){
        return res.status(404).json({ success:false });
    }

    const resolvedType = driver.type || driver.craneType || driver.possibleType || driver.equipment || driver.driverType || driver.spec || '';
    const normalizedTel = normalizePhone(driver.tel || driver.phone || driver.mobile || '');
    driver.approved = true;
    driver.approvedAt = new Date().toLocaleString('ko-KR', {timeZone:'Asia/Seoul'});
    driver.type = resolvedType;
    driver.craneType = resolvedType;
    driver.possibleType = resolvedType;
    if (normalizedTel) {
        driver.phone = normalizedTel;
        driver.tel = normalizedTel;
    }

    const existingIndex = pool.findIndex((item) => {
        if (String(item.id) === String(driver.id) || String(item._id) === String(driver._id)) return true;
        if (!normalizedTel) return false;
        return extractDriverPhones(item).includes(normalizedTel);
    });

    if (existingIndex >= 0) {
        pool[existingIndex] = { ...pool[existingIndex], ...driver, approved: true };
    } else {
        pool.push(driver);
    }
    inbox = inbox.filter(d => String(d.id) !== String(id) && String(d._id) !== String(id));
    
    saveData('inbox_drv', inbox);
    saveData('drivers_pool', pool);
    res.json({success:true, data: driver});
});

app.delete('/api/admin/pool/:id', authenticateAdmin, (req,res)=>{
    let pool = readData('drivers_pool');
    pool = pool.filter(d => String(d.id) !== String(req.params.id));
    saveData('drivers_pool', pool);
    res.json({ success:true });
});

app.put('/api/admin/drivers-pool/:id/online', authenticateAdmin, (req, res) => {
    let pool = readData('drivers_pool');
    const driver = pool.find(d => String(d.id) === String(req.params.id));
    if (!driver) return res.status(404).json({ success: false, error: '기사를 찾을 수 없습니다.' });

    const onlinePhones = getRecentOnlinePhones();
    const hasActiveSession = extractDriverPhones(driver).some(phone => onlinePhones.has(phone));
    if (hasActiveSession) {
        return res.status(409).json({
            success: false,
            error: '현재 기사님이 로그인 중이라 자동 ON 상태입니다. 기사 로그아웃 후 수동 변경해 주세요.'
        });
    }

    const currentManual = Boolean(driver.manualOnline ?? driver.isOnline ?? false);
    driver.manualOnline = !currentManual;
    // 이전 데이터/화면 호환을 위해 isOnline도 함께 맞춘다.
    driver.isOnline = driver.manualOnline;

    if (!saveData('drivers_pool', pool)) return res.status(500).json({ success: false });
    res.json({ success: true, isOnline: driver.isOnline, manualOnline: driver.manualOnline, onlineSource: 'MANUAL' });
});

// ==========================================
// 게시판 API
// ==========================================

// 게시글 목록
app.get('/api/board', (req, res) => {
    res.json(readData('board'));
});

// 게시글 등록
app.post('/api/board', authenticateAdmin, (req, res) => {
    const board = readData('board');

    const post = {
        id: crypto.randomUUID(),
        title: cleanText(req.body.title, 200),
        writer: cleanText(req.body.writer || '관리자', 50),
        content: cleanText(req.body.content, 5000),
        category: cleanText(req.body.category || 'GENERAL', 30),
        isPinned: Boolean(req.body.isPinned),
        images: sanitizeBoardImages(req.body.images),
        views: 0,
        createdAt: new Date().toLocaleString('ko-KR', {
            timeZone: 'Asia/Seoul'
        })
    };

    board.unshift(post);

    if (!saveData('board', board)) {
        return res.status(500).json({
            success: false,
            error: '게시글 저장 실패'
        });
    }

    res.json({
        success: true,
        data: post
    });
});

// 게시글 조회수 증가
app.put('/api/board/:id/views', (req, res) => {
    const board = readData('board');
    const post = board.find(item => String(item.id) === String(req.params.id));

    if (!post) {
        return res.status(404).json({ success: false, error: '게시글을 찾을 수 없습니다.' });
    }

    post.views = Number(post.views || 0) + 1;

    if (!saveData('board', board)) {
        return res.status(500).json({ success: false, error: '조회수 저장 실패' });
    }

    return res.json({ success: true, data: { views: post.views } });
});

// 게시글 삭제
app.delete('/api/board/:id', authenticateAdmin, (req, res) => {

    let board = readData('board');

    board = board.filter(item =>
        String(item.id) !== String(req.params.id)
    );

    saveData('board', board);

    res.json({
        success: true
    });
});


// ==========================================
// 공지사항 API
// ==========================================

// 공지 목록
app.get('/api/notice', (req, res) => {
    res.json(readData('notice'));
});

// 공지 등록
app.post('/api/notice', authenticateAdmin, (req, res) => {

    const notice = readData('notice');

    const item = {
        id: crypto.randomUUID(),
        title: cleanText(req.body.title, 200),
        content: cleanText(req.body.content, 5000),
        createdAt: new Date().toLocaleString('ko-KR', {
            timeZone: 'Asia/Seoul'
        })
    };

    notice.unshift(item);

    if (!saveData('notice', notice)) {
        return res.status(500).json({
            success: false,
            error: '공지 저장 실패'
        });
    }

    res.json({
        success: true,
        data: item
    });
});

// 공지 삭제
app.delete('/api/notice/:id', authenticateAdmin, (req, res) => {

    let notice = readData('notice');

    notice = notice.filter(item =>
        String(item.id) !== String(req.params.id)
    );

    saveData('notice', notice);

    res.json({
        success: true
    });
});

// [Phase 2] 대시보드 API 수정: 렌탈 데이터 추가 반환
app.get('/api/admin/dashboard', authenticateAdmin, (req, res) => {
    res.json({ 
        orders: readData('orders'), 
        inbox_req: readData('inbox_req'), 
        inbox_drv: readData('inbox_drv'), 
        drivers_pool: readData('drivers_pool'),
        users: readData('users'),
        products: readData('products'),
        rental_req: readData('rental_req'), // 렌탈 요청 추가
        rental_reg: readData('rental_reg') // 렌탈 등록 추가
    });
});

app.get('/api/rental/request', authenticateAdmin, (req,res)=>{
    res.json(readData('rental_req'));
});

app.get('/api/rental/register', authenticateAdmin, (req,res)=>{
    res.json(readData('rental_reg'));
});

app.get('/api/inbox/request', authenticateAdmin, (req, res) => {
    res.json(readData('inbox_req'));
});

app.get('/api/inbox/driver', authenticateAdmin, (req, res) => {
    res.json(readData('inbox_drv'));
});

// ==========================================
// [Phase 2] 렌탈 서비스 전용 라우터 시작
// ==========================================
app.post('/api/rental/request', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), (req, res) => {
    const rentalReqData = readData('rental_req');
    const rental = buildInquiry(req.body, ['company', 'name', 'tel', 'type', 'memo', 'loc']);
    if (!rental.name || !rental.tel || !rental.type) return res.status(400).json({ success: false, error: '성함, 연락처, 요청 장비는 필수입니다.' });
    const newReq = {
        id: crypto.randomUUID(),
        time: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
        status: "접수대기",
        assignedDriver: "",
        updatedAt: new Date().toISOString(),
        ...rental
    };
    
    rentalReqData.push(newReq);
    if (!saveData('rental_req', rentalReqData)) return res.status(500).json({ success: false, error: '접수 저장에 실패했습니다.' });
    
    void sendTelegram(
`🏗️ [크레인 렌탈 요청]

상호 : ${newReq.company}
담당자 : ${newReq.name}
연락처 : ${newReq.tel}
요청장비 : ${newReq.type}
상세내용 : ${newReq.memo}
접수시간 : ${newReq.time}`,
'RENTAL_REQUEST');
    res.json({ success: true, message: '렌탈 요청이 접수되었습니다.' });
});

app.post('/api/rental/register', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), (req, res) => {
    const rentalRegData = readData('rental_reg');
    const rental = buildInquiry(req.body, ['name', 'tel', 'type', 'loc', 'memo']);
    if (!rental.name || !rental.tel || !rental.type) return res.status(400).json({ success: false, error: '성함, 연락처, 보유 장비는 필수입니다.' });
    const newReg = {
        id: crypto.randomUUID(),
        time: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
        category: "렌탈",
        equipmentCategory: "rental",
        status: "승인대기",
        ...rental
    };
    
    rentalRegData.push(newReg);
    if (!saveData('rental_reg', rentalRegData)) return res.status(500).json({ success: false, error: '등록 저장에 실패했습니다.' });
    
    void sendTelegram(
`🚚 [렌탈 차주 등록]

차주 : ${newReg.name}
연락처 : ${newReg.tel}
보유장비 : ${newReg.type}
지역 : ${newReg.loc}
메모 : ${newReg.memo}
접수시간 : ${newReg.time}`,
'RENTAL_REGISTER'
);
    res.json({ success: true, message: '렌탈 차주 등록이 완료되었습니다.' });
});

app.delete('/api/admin/rental/:type/:id', authenticateAdmin, (req, res) => {
    const { type, id } = req.params;
    const fileKey = type === 'request' ? 'rental_req' : (type === 'register' ? 'rental_reg' : null);
    
    if (!fileKey) {
        return res.status(400).json({ success: false, message: '잘못된 삭제 요청 타입입니다.' });
    }

    let data = readData(fileKey);
    const initialLength = data.length;
    data = data.filter(item => String(item.id) !== String(id));

    if (data.length < initialLength) {
        saveData(fileKey, data);
        res.json({ success: true, message: '삭제 완료' });
    } else {
        res.status(404).json({ success: false, message: '해당 데이터를 찾을 수 없습니다.' });
    }
});
// ==========================================
// [Phase 2] 렌탈 서비스 라우터 끝
// ==========================================

app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ success: false, error: '요청 형식이 올바르지 않습니다.' });
    if (err.message === 'Origin not allowed') return res.status(403).json({ success: false, error: '허용되지 않은 출처입니다.' });
    console.error('Unhandled request error:', err.message);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`서버가 ${PORT}번 포트에서 가동 중입니다. (Phase 2 적용 완료)`);
});

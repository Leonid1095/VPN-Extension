import 'node:process';

function need(name, fallback = undefined) {
    const v = process.env[name] ?? fallback;
    if (v === undefined) {
        throw new Error(`env ${name} is required`);
    }
    return v;
}

export const config = {
    port: parseInt(process.env.PORT || '8080', 10),
    host: process.env.HOST || '0.0.0.0',
    publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 8080}`,

    jwtSecret: need('JWT_SECRET', 'dev-only-secret-replace-me'),

    donatepay: {
        userId: process.env.DONATEPAY_USER_ID || '',
        apiKey: process.env.DONATEPAY_API_KEY || '',
        webhookSecret: process.env.DONATEPAY_WEBHOOK_SECRET || '',
        webhookPath: process.env.DONATEPAY_WEBHOOK_PATH || '/api/donatepay/webhook',
        username: process.env.DONATEPAY_USERNAME || '',
        apiBaseUrl: process.env.DONATEPAY_API_BASE_URL || 'https://donatepay.ru/api/v1',
        paymentPageUrl: process.env.DONATEPAY_PAYMENT_PAGE_URL || '',
    },

    successUrl: process.env.SUCCESS_URL || 'https://example.com/thanks',
    proxyPoolFile: process.env.PROXY_POOL_FILE || './data/proxy-pool.json',

    /** срок жизни pending-заказа */
    orderTtlMs: 2 * 60 * 60 * 1000,
};

/** Тарифы. Цены в рублях. comment-префикс — PLGC. */
export const TIERS = {
    '30d':  { duration_days: 30,  amount_rub: 159, label: '30 дней' },
    '90d':  { duration_days: 90,  amount_rub: 299, label: '90 дней' },
    '365d': { duration_days: 365, amount_rub: 699, label: '365 дней' },
};

/**
 * Сколько живут текущие basic_auth-креды до ротации.
 * Короткий TTL делает шеринг кредов между несколькими людьми непрактичным:
 * после ротации старые перестают работать, тот с кем поделились должен
 * получить новые от владельца — что заведомо неудобно.
 */
export const CREDENTIALS_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Защита от шеринга через одновременное использование с нескольких устройств.
 * Если за это окно (мс) одни и те же creds приходят на прокси с разных IP
 * больше указанного порога — order помечается revoked.
 */
export const SHAREGUARD_WINDOW_MS = 60 * 1000;
export const SHAREGUARD_MAX_IPS = 2;

/**
 * Внутренний токен для агента-синхронизатора на прокси-серверах.
 * Если пустой — internal-эндпоинт отключён (для dev). В продакшене обязателен.
 */
export const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN || '';

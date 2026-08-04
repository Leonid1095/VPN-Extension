// Поллер DonatePay: основной способ подтверждения оплаты.
//
// DonatePay не шлёт надёжный подписанный вебхук — зато отдаёт ленту донатов
// через REST API. Раз в POLL_INTERVAL_MS тянем последние транзакции и для
// каждого успешного доната с комментарием PLGC-<orderId> подтверждаем заказ.
//
// confirmOrderPaid идемпотентна, поэтому повторная обработка одних и тех же
// транзакций между опросами безопасна.

import { config } from './config.js';
import { parseOrderIdFromComment } from './donatepay.js';
import { confirmOrderPaid } from './payments.js';

// Интервал опроса. 60с по умолчанию — компромисс между задержкой подтверждения
// оплаты и rate-limit'ом DonatePay (он отвечает 429 при слишком частых запросах).
const POLL_INTERVAL_MS = Math.max(
    15_000,
    parseInt(process.env.DONATEPAY_POLL_INTERVAL_MS || '60000', 10) || 60_000,
);

function txUrl() {
    const base = config.donatepay.apiBaseUrl.replace(/\/$/, '');
    return `${base}/transactions?access_token=${encodeURIComponent(config.donatepay.apiKey)}`;
}

// fetch() при сетевом сбое кидает `TypeError: fetch failed`, а настоящая
// причина (ECONNRESET / ETIMEDOUT / ENOTFOUND / UND_ERR_*) лежит в e.cause —
// undici её туда кладёт. String(e) её теряет, поэтому разворачиваем вручную.
function errInfo(e) {
    const info = { err: String(e) };
    const cause = e?.cause;
    if (cause) {
        info.cause = String(cause);
        if (cause.code) info.causeCode = cause.code;
    }
    return info;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch с ретраем ТОЛЬКО на сетевой сбой (fetch() throw). Покрывает ~4%
// transient-DNS (EAI_AGAIN) и редкие обрывы соединения. HTTP-статусы (429 и
// прочее) сюда не попадают и НЕ ретраятся — это забота вызывающего, чтобы не
// долбить DonatePay при rate-limit'е. 2 ретрая, короткий backoff.
async function fetchTxWithRetry(log) {
    const backoffMs = [500, 1500];
    let lastErr;
    for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
        try {
            return await fetch(txUrl(), { signal: AbortSignal.timeout(15000) });
        } catch (e) {
            lastErr = e;
            if (attempt < backoffMs.length) {
                log.debug({ ...errInfo(e), attempt: attempt + 1 }, 'donatepay poll: fetch retry');
                await sleep(backoffMs[attempt]);
            }
        }
    }
    throw lastErr;
}

async function pollOnce(log) {
    let res;
    try {
        res = await fetchTxWithRetry(log);
    } catch (e) {
        log.warn(errInfo(e), 'donatepay poll: fetch failed');
        return;
    }
    if (!res.ok) {
        log.warn({ status: res.status }, 'donatepay poll: bad status');
        return;
    }
    let body;
    try {
        body = await res.json();
    } catch {
        log.warn('donatepay poll: bad json');
        return;
    }

    const txs = Array.isArray(body?.data) ? body.data : [];
    for (const tx of txs) {
        if (tx?.type !== 'donation') continue;
        if (String(tx?.status).toLowerCase() !== 'success') continue;
        const orderId = parseOrderIdFromComment(tx?.comment ?? tx?.vars?.comment ?? '');
        if (!orderId) continue;
        const amountRub = Number(tx?.sum ?? 0);
        const r = confirmOrderPaid(orderId, amountRub, `dp_${tx.id}`);
        if (r.code === 'paid') {
            log.info({ orderId, txId: tx.id, amountRub }, 'donatepay poll: order paid');
        } else if (r.code === 'underpaid' || r.code === 'pool_empty') {
            log.warn({ orderId, txId: tx.id, code: r.code, reason: r.reason }, 'donatepay poll: not confirmed');
        }
        // not_found / idempotent / bad_status — штатно пропускаем молча
    }
}

export function startDonatepayPoller(fastify) {
    if (!config.donatepay.apiKey) {
        fastify.log.info('donatepay poller disabled (no API key)');
        return;
    }
    fastify.log.info({ intervalMs: POLL_INTERVAL_MS }, 'donatepay poller started');
    const tick = () =>
        pollOnce(fastify.log).catch((e) =>
            fastify.log.error(errInfo(e), 'donatepay poll: unexpected crash'),
        );
    tick();
    const handle = setInterval(tick, POLL_INTERVAL_MS);
    handle.unref?.();
}

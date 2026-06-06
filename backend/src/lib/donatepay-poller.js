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

async function pollOnce(log) {
    let res;
    try {
        res = await fetch(txUrl(), { signal: AbortSignal.timeout(15000) });
    } catch (e) {
        log.warn({ err: String(e) }, 'donatepay poll: fetch failed');
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
            fastify.log.error({ err: String(e) }, 'donatepay poll: unexpected crash'),
        );
    tick();
    const handle = setInterval(tick, POLL_INTERVAL_MS);
    handle.unref?.();
}

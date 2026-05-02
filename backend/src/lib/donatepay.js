// DonatePay интеграция:
//  • строим URL оплаты с автозаполненным comment (PLGC-<orderId>)
//  • валидируем входящий вебхук по подписи
//
// DonatePay API ссылки:
//   https://www.donationalerts.com/widgets и https://donatepay.ru/api
// (формат вебхука и подписи может отличаться — конкретные заголовки/поля
//  заменишь когда будешь интегрировать с реальным провайдером.)

import crypto from 'node:crypto';
import { config } from './config.js';

export const COMMENT_PREFIX = 'PLGC-';

/**
 * Билдер ссылки на оплату для DonatePay.
 *
 * Если в env задан DONATEPAY_PAYMENT_PAGE_URL — используем его как базу
 * (актуальный формат: https://new.donatepay.ru/@<username>).
 * Иначе fallback на старый qiwi-совместимый формат.
 *
 * Параметры sum/message прокидываются в query — DonatePay подхватывает их
 * при загрузке страницы оплаты и подставляет в форму.
 */
export function buildPaymentUrl(orderId, amountRub) {
    const message = `${COMMENT_PREFIX}${orderId}`;
    const params = new URLSearchParams({
        sum: String(amountRub),
        message,
    });
    const base = config.donatepay.paymentPageUrl;
    if (base) {
        const sep = base.includes('?') ? '&' : '?';
        return `${base}${sep}${params.toString()}`;
    }
    const username = encodeURIComponent(config.donatepay.username || 'unknown');
    return `https://donate.qiwi.com/payin/${username}?${params.toString()}`;
}

/** Извлекаем orderId из comment. */
export function parseOrderIdFromComment(comment) {
    if (!comment || typeof comment !== 'string') return null;
    const m = comment.match(/PLGC-([A-Za-z0-9]{4,32})/);
    return m ? m[1] : null;
}

/**
 * Проверка подписи вебхука. Реальную схему DonatePay нужно зашить тут
 * по их документации: они обычно дают `signature` в заголовке или body,
 * формируется как HMAC-SHA256 от полей оплаты с разделителями.
 *
 * Текущая реализация: принимает HMAC-SHA256 в заголовке X-Signature от raw body.
 * Если DONATEPAY_WEBHOOK_SECRET пустой — подпись не проверяется (только для dev).
 */
export function verifyWebhookSignature(rawBody, headerSig) {
    const secret = config.donatepay.webhookSecret;
    if (!secret) return true; // dev mode
    if (!headerSig) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
        return crypto.timingSafeEqual(
            Buffer.from(expected, 'hex'),
            Buffer.from(headerSig, 'hex'),
        );
    } catch {
        return false;
    }
}

/**
 * Нормализуем тело вебхука к {paymentId, comment, amountRub, raw}.
 * При смене провайдера/подмене на DonationAlerts — поменять только эту функцию.
 */
export function normalizePayload(body) {
    if (!body || typeof body !== 'object') return null;

    // DonatePay rest webhook (пример полей):
    //   { id, sum, comment, payment_id, status, ... }
    return {
        paymentId: String(body.id ?? body.payment_id ?? ''),
        comment: String(body.comment ?? body.message ?? ''),
        amountRub: Number(body.sum ?? body.amount ?? 0),
        status: String(body.status ?? 'completed'),
        raw: body,
    };
}

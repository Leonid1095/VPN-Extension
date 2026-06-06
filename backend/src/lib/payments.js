// Общая логика подтверждения оплаты заказа — используется и вебхуком, и поллером
// DonatePay. Идемпотентна: повторный вызов для уже оплаченного заказа безопасен.

import { db } from './db.js';
import { provision } from './proxy-pool.js';
import { generateToken } from './token.js';

/**
 * Помечает заказ оплаченным и выдаёт прокси-креды.
 *
 * @returns {{ ok: boolean, code: string, reason?: any, order?: any }}
 *   code: 'paid' | 'idempotent' | 'not_found' | 'bad_status' | 'underpaid' | 'pool_empty'
 */
export function confirmOrderPaid(orderId, amountRub, paymentId) {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) return { ok: false, code: 'not_found' };
    if (order.status === 'paid') return { ok: true, code: 'idempotent', order };
    if (order.status !== 'pending') {
        return { ok: false, code: 'bad_status', reason: order.status };
    }
    // недоплата (допускаем 1₽ погрешности на округление комиссий)
    if (amountRub > 0 && amountRub + 1 < order.amount_rub) {
        return {
            ok: false,
            code: 'underpaid',
            reason: { paid: amountRub, required: order.amount_rub },
        };
    }

    const prov = provision(orderId);
    if (!prov) return { ok: false, code: 'pool_empty' };

    const now = Date.now();
    const subscribedUntil = now + order.duration_days * 24 * 60 * 60 * 1000;
    const token = generateToken();

    db.prepare(
        `UPDATE orders
           SET status='paid', token=?,
               proxy_id=?, proxy_user=?, proxy_pass=?,
               creds_rotated_at=?, subscribed_until=?,
               payment_id=?, paid_at=?
         WHERE id=?`,
    ).run(
        token,
        prov.server.id,
        prov.username,
        prov.password,
        now,
        subscribedUntil,
        paymentId,
        now,
        orderId,
    );

    return { ok: true, code: 'paid', order: { ...order, status: 'paid' } };
}

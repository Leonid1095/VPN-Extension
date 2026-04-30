import { db } from '../lib/db.js';
import { config } from '../lib/config.js';
import { provision, getServerById } from '../lib/proxy-pool.js';
import { generateToken } from '../lib/token.js';
import {
    parseOrderIdFromComment,
    verifyWebhookSignature,
    normalizePayload,
} from '../lib/donatepay.js';

export default async function (fastify) {
    fastify.post(
        config.donatepay.webhookPath,
        {
            // получаем raw body для проверки подписи
            preParsing: async (req) => {
                req.rawBody = await new Promise((res, rej) => {
                    let buf = '';
                    req.raw.on('data', (c) => (buf += c));
                    req.raw.on('end', () => res(buf));
                    req.raw.on('error', rej);
                });
                try {
                    req.body = JSON.parse(req.rawBody || '{}');
                } catch {
                    req.body = {};
                }
            },
            config: { rawBody: true },
        },
        async (req, reply) => {
            const sigHeader =
                req.headers['x-signature'] ||
                req.headers['x-donatepay-signature'] ||
                '';

            if (!verifyWebhookSignature(req.rawBody || '', String(sigHeader))) {
                fastify.log.warn(
                    { sig: sigHeader, path: req.url },
                    'donatepay webhook bad signature',
                );
                return reply.code(401).send({ error: 'bad signature' });
            }

            const evt = normalizePayload(req.body);
            if (!evt) return reply.code(400).send({ error: 'invalid body' });

            // успешные статусы у разных провайдеров отличаются — допускаем несколько
            const successStatuses = new Set(['paid', 'success', 'completed', 'ok']);
            if (!successStatuses.has(evt.status.toLowerCase())) {
                // незначащее событие (например, pending от провайдера) — не падаем
                return { ok: true, ignored: true };
            }

            const orderId = parseOrderIdFromComment(evt.comment);
            if (!orderId) {
                fastify.log.warn({ evt }, 'donatepay webhook: no orderId in comment');
                return { ok: true, ignored: true, reason: 'no order id in comment' };
            }

            const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
            if (!order) {
                fastify.log.warn({ orderId, evt }, 'donatepay: order not found');
                return reply.code(404).send({ error: 'order not found' });
            }
            if (order.status === 'paid') {
                // идемпотентность: уже обработали
                return { ok: true, idempotent: true };
            }
            if (order.status !== 'pending') {
                return reply
                    .code(409)
                    .send({ error: `order is ${order.status}, cannot mark paid` });
            }

            // (опционально) валидация суммы — если оплачено меньше тарифа, отказ
            if (evt.amountRub > 0 && evt.amountRub + 1 < order.amount_rub) {
                fastify.log.warn(
                    { paid: evt.amountRub, required: order.amount_rub, orderId },
                    'amount mismatch',
                );
                return reply.code(402).send({ error: 'underpaid' });
            }

            const prov = provision(orderId);
            if (!prov) {
                fastify.log.error('proxy pool empty — cannot provision');
                return reply.code(503).send({ error: 'pool empty' });
            }

            const now = Date.now();
            const subscribedUntil = now + order.duration_days * 24 * 60 * 60 * 1000;
            const token = generateToken();

            db.prepare(
                `UPDATE orders
                   SET status='paid',
                       token=?,
                       proxy_id=?, proxy_user=?, proxy_pass=?,
                       creds_rotated_at=?,
                       subscribed_until=?,
                       payment_id=?,
                       paid_at=?
                 WHERE id=?`,
            ).run(
                token,
                prov.server.id,
                prov.username,
                prov.password,
                now,
                subscribedUntil,
                evt.paymentId,
                now,
                orderId,
            );

            // На pool-сервере должен крутиться агент, который раз в N секунд
            // подтянет нового пользователя и пропишет в Caddyfile basic_auth.
            // (см. ops/README.md в репозитории)

            fastify.log.info({ orderId, paymentId: evt.paymentId }, 'order paid');
            return { ok: true };
        },
    );
}

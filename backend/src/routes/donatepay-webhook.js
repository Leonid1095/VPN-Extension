import { Readable } from 'node:stream';
import { config } from '../lib/config.js';
import { confirmOrderPaid } from '../lib/payments.js';
import {
    parseOrderIdFromComment,
    verifyWebhookSignature,
    normalizePayload,
} from '../lib/donatepay.js';

export default async function (fastify) {
    fastify.post(
        config.donatepay.webhookPath,
        {
            // забираем raw body из payload-стрима до парсинга, чтобы
            // verifyWebhookSignature мог посчитать HMAC по точным байтам.
            // Возвращаем новый readable stream с теми же данными — иначе
            // fastify зависает, ожидая body, который мы уже прочитали.
            preParsing: async (req, _reply, payload) => {
                const chunks = [];
                for await (const chunk of payload) chunks.push(chunk);
                const buf = Buffer.concat(
                    chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c))),
                );
                req.rawBody = buf.toString('utf8');
                return Readable.from(buf);
            },
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

            // Общая логика подтверждения (та же, что у поллера DonatePay).
            const result = confirmOrderPaid(orderId, evt.amountRub, evt.paymentId);
            switch (result.code) {
                case 'not_found':
                    fastify.log.warn({ orderId, evt }, 'donatepay: order not found');
                    return reply.code(404).send({ error: 'order not found' });
                case 'bad_status':
                    return reply
                        .code(409)
                        .send({ error: `order is ${result.reason}, cannot mark paid` });
                case 'underpaid':
                    fastify.log.warn({ orderId, ...result.reason }, 'amount mismatch');
                    return reply.code(402).send({ error: 'underpaid' });
                case 'pool_empty':
                    fastify.log.error('proxy pool empty — cannot provision');
                    return reply.code(503).send({ error: 'pool empty' });
                case 'idempotent':
                    return { ok: true, idempotent: true };
                case 'paid':
                default:
                    // На pool-сервере агент раз в N секунд подтянет нового
                    // пользователя и пропишет basic_auth в Caddyfile.
                    fastify.log.info({ orderId, paymentId: evt.paymentId }, 'order paid');
                    return { ok: true };
            }
        },
    );
}

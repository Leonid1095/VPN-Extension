import { db, ensureClean } from '../lib/db.js';
import { config, TIERS } from '../lib/config.js';
import { generateOrderId } from '../lib/token.js';
import { buildPaymentUrl } from '../lib/donatepay.js';

function publicOrderView(o) {
    return {
        id: o.id,
        tier: o.tier,
        status: o.status,
        amountRub: o.amount_rub,
        durationDays: o.duration_days,
        createdAt: o.created_at,
        expiresAt: o.expires_at,
        // только когда оплачено — даём токен
        token: o.status === 'paid' ? o.token : undefined,
        subscribedUntil: o.status === 'paid' ? o.subscribed_until : undefined,
    };
}

export default async function (fastify) {
    // POST /api/orders — расширение создаёт pending-заказ
    fastify.post('/api/orders', async (req, reply) => {
        const { tier } = req.body || {};
        if (!tier || !TIERS[tier]) {
            return reply.code(400).send({ error: 'invalid tier' });
        }
        const t = TIERS[tier];
        const id = generateOrderId(8);
        const now = Date.now();
        const expires = now + config.orderTtlMs;

        db.prepare(
            `INSERT INTO orders
             (id, tier, amount_rub, duration_days, status, created_at, expires_at)
             VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
        ).run(id, tier, t.amount_rub, t.duration_days, now, expires);

        const paymentUrl = buildPaymentUrl(id, t.amount_rub);

        return {
            order: publicOrderView({
                id,
                tier,
                amount_rub: t.amount_rub,
                duration_days: t.duration_days,
                status: 'pending',
                created_at: now,
                expires_at: expires,
            }),
            paymentUrl,
            comment: `PLGC-${id}`,
            successUrl: `${config.successUrl}?order=${encodeURIComponent(id)}`,
            tierLabel: t.label,
        };
    });

    // GET /api/orders/:id — расширение опрашивает статус
    fastify.get('/api/orders/:id', async (req, reply) => {
        ensureClean();
        const o = db
            .prepare('SELECT * FROM orders WHERE id = ?')
            .get(String(req.params.id || ''));
        if (!o) return reply.code(404).send({ error: 'order not found' });
        return { order: publicOrderView(o) };
    });

    // GET /api/tiers — публичный список тарифов (для landing/popup)
    fastify.get('/api/tiers', async () => {
        return {
            tiers: Object.entries(TIERS).map(([key, t]) => ({
                key,
                label: t.label,
                amountRub: t.amount_rub,
                durationDays: t.duration_days,
            })),
        };
    });
}

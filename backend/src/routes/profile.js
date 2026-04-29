import { db } from '../lib/db.js';
import { getServerById } from '../lib/proxy-pool.js';

function authOrder(req) {
    const auth = req.headers.authorization || '';
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return null;
    const order = db.prepare('SELECT * FROM orders WHERE token = ?').get(m[1].trim());
    if (!order || order.status !== 'paid') return null;
    return order;
}

function publicAccount(order) {
    return {
        subscribedUntil: order.subscribed_until,
        durationDays: order.duration_days,
        tier: order.tier,
    };
}

function publicProfile(order) {
    const server = getServerById(order.proxy_id);
    if (!server) return null;
    return {
        scheme: server.scheme,
        host: server.host,
        port: server.port,
        username: order.proxy_user,
        password: order.proxy_pass,
        name: server.name || `PLGames Pro · ${server.id}`,
    };
}

export default async function (fastify) {
    // GET /api/account — статус подписки
    fastify.get('/api/account', async (req, reply) => {
        const order = authOrder(req);
        if (!order) return reply.code(401).send({ error: 'unauthorized' });
        return { account: publicAccount(order) };
    });

    // GET /api/profile — креды на прокси
    fastify.get('/api/profile', async (req, reply) => {
        const order = authOrder(req);
        if (!order) return reply.code(401).send({ error: 'unauthorized' });
        if (order.subscribed_until < Date.now()) {
            return reply.code(402).send({ error: 'subscription expired' });
        }
        const profile = publicProfile(order);
        if (!profile) return reply.code(503).send({ error: 'proxy not available' });
        return { profile };
    });

    // POST /api/auth/logout — на бэкенде ничего не отзываем (Bearer хранится только локально)
    fastify.post('/api/auth/logout', async () => ({ ok: true }));
}

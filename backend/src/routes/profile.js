import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import { getServerById } from '../lib/proxy-pool.js';
import { CREDENTIALS_TTL_MS } from '../lib/config.js';

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
        credsRotatedAt: order.creds_rotated_at,
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

/**
 * Перегенерация basic_auth кредов для активной подписки.
 * Вызывается:
 *   - расширением раз в 12 часов (фоновая ротация),
 *   - или вручную через админ-эндпоинт (TODO).
 *
 * Старые креды перестают работать после того как агент на прокси-сервере
 * подтянет новый Caddyfile (≤30 секунд при штатной работе агента).
 */
function rotateCreds(order) {
    const username = `u_${order.id}_${crypto.randomBytes(2).toString('hex')}`;
    const password = crypto.randomBytes(18).toString('base64url');
    const now = Date.now();
    db.prepare(
        `UPDATE orders SET proxy_user = ?, proxy_pass = ?, creds_rotated_at = ? WHERE id = ?`,
    ).run(username, password, now, order.id);
    return { ...order, proxy_user: username, proxy_pass: password, creds_rotated_at: now };
}

/**
 * Привязка подписки к одному устройству (installation-id из расширения).
 * При первом обращении пишем installation_id в БД, далее любые запросы с
 * другим installation_id отклоняются. Защищает от шеринга token+ creds
 * между устройствами.
 */
function bindOrCheckInstallation(order, installationId) {
    if (!installationId || typeof installationId !== 'string' || installationId.length < 8) {
        return { ok: true, order };
    }
    if (!order.installation_id) {
        db.prepare('UPDATE orders SET installation_id = ? WHERE id = ?').run(
            installationId,
            order.id,
        );
        return { ok: true, order: { ...order, installation_id: installationId } };
    }
    if (order.installation_id !== installationId) {
        return { ok: false, reason: 'installation mismatch' };
    }
    return { ok: true, order };
}

function readInstallationId(req) {
    const h = req.headers['x-installation-id'];
    return typeof h === 'string' ? h : '';
}

export default async function (fastify) {
    fastify.get('/api/account', async (req, reply) => {
        const order = authOrder(req);
        if (!order) return reply.code(401).send({ error: 'unauthorized' });
        return { account: publicAccount(order) };
    });

    fastify.get('/api/profile', async (req, reply) => {
        const order = authOrder(req);
        if (!order) return reply.code(401).send({ error: 'unauthorized' });
        if (order.subscribed_until < Date.now()) {
            return reply.code(402).send({ error: 'subscription expired' });
        }
        const bound = bindOrCheckInstallation(order, readInstallationId(req));
        if (!bound.ok) return reply.code(403).send({ error: bound.reason });
        let current = bound.order;
        // если креды старые (TTL прошёл) — ротируем при каждом обращении
        if (
            !current.creds_rotated_at ||
            Date.now() - current.creds_rotated_at > CREDENTIALS_TTL_MS
        ) {
            current = rotateCreds(current);
        }
        const profile = publicProfile(current);
        if (!profile) return reply.code(503).send({ error: 'proxy not available' });
        return { profile };
    });

    /** Принудительная ротация кредов. Расширение зовёт по своему расписанию. */
    fastify.post('/api/profile/rotate', async (req, reply) => {
        const order = authOrder(req);
        if (!order) return reply.code(401).send({ error: 'unauthorized' });
        if (order.subscribed_until < Date.now()) {
            return reply.code(402).send({ error: 'subscription expired' });
        }
        const bound = bindOrCheckInstallation(order, readInstallationId(req));
        if (!bound.ok) return reply.code(403).send({ error: bound.reason });
        const updated = rotateCreds(bound.order);
        const profile = publicProfile(updated);
        if (!profile) return reply.code(503).send({ error: 'proxy not available' });
        return { profile };
    });

    /** Logout — token остаётся валидным для текущей подписки, очищаем только локально на клиенте. */
    fastify.post('/api/auth/logout', async () => ({ ok: true }));
}

// Внутренний API для агентов-синхронизаторов на прокси-серверах.
// Защищён shared-secret в заголовке X-Internal-Token. Никогда не публикуй URL и не
// проксируй наружу без TLS+файрвола.

import { db } from '../lib/db.js';
import { INTERNAL_API_TOKEN } from '../lib/config.js';
import { getServerById } from '../lib/proxy-pool.js';

function checkInternalToken(req, reply) {
    if (!INTERNAL_API_TOKEN) {
        reply.code(503).send({ error: 'internal API disabled' });
        return false;
    }
    const got = req.headers['x-internal-token'] || '';
    if (typeof got !== 'string' || got !== INTERNAL_API_TOKEN) {
        reply.code(401).send({ error: 'forbidden' });
        return false;
    }
    return true;
}

export default async function (fastify) {
    /**
     * GET /api/internal/server/:id/users
     *
     * Возвращает текущий список активных подписчиков для конкретного прокси-сервера.
     * Агент на этом сервере читает ответ и перегенерирует Caddyfile.
     *
     * Headers: X-Internal-Token: <INTERNAL_API_TOKEN>
     *
     * Ответ:
     *   {
     *     server: { id, host, port, scheme },
     *     users:  [ { username, password, expires_at } ],
     *     generated_at: <unix ms>
     *   }
     */
    fastify.get('/api/internal/server/:id/users', async (req, reply) => {
        if (!checkInternalToken(req, reply)) return;
        const serverId = String(req.params.id || '');
        const server = getServerById(serverId);
        if (!server) return reply.code(404).send({ error: 'server not found' });

        const now = Date.now();
        const rows = db
            .prepare(
                `SELECT proxy_user AS username, proxy_pass AS password, subscribed_until AS expires_at
                   FROM orders
                  WHERE proxy_id = ? AND status = 'paid' AND subscribed_until > ?
                  ORDER BY id`,
            )
            .all(serverId, now);

        return {
            server: {
                id: server.id,
                host: server.host,
                port: server.port,
                scheme: server.scheme,
            },
            users: rows,
            generated_at: now,
        };
    });

    /**
     * POST /api/internal/admin/revoke
     * Body: { token } | { orderId }
     *
     * Помечает подписку revoked. Расширение получит 401 при следующем запросе.
     * Полезно если юзер написал «у меня украли креды».
     */
    fastify.post('/api/internal/admin/revoke', async (req, reply) => {
        if (!checkInternalToken(req, reply)) return;
        const { token, orderId } = req.body || {};
        if (!token && !orderId) {
            return reply.code(400).send({ error: 'token or orderId required' });
        }
        const where = token ? 'token = ?' : 'id = ?';
        const value = token || orderId;
        const r = db.prepare(`UPDATE orders SET status = 'revoked' WHERE ${where}`).run(value);
        return { ok: true, changed: r.changes };
    });
}

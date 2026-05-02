// Внутренний API для агентов-синхронизаторов на прокси-серверах.
// Защищён shared-secret в заголовке X-Internal-Token. Никогда не публикуй URL и не
// проксируй наружу без TLS+файрвола.

import { db } from '../lib/db.js';
import {
    INTERNAL_API_TOKEN,
    SHAREGUARD_WINDOW_MS,
    SHAREGUARD_MAX_IPS,
} from '../lib/config.js';
import { getServerById } from '../lib/proxy-pool.js';

/**
 * Скользящее окно: для каждого proxy_user — set of client IPs, замеченных
 * за последние SHAREGUARD_WINDOW_MS миллисекунд. Если размер >= порога —
 * это значит креды одновременно используют несколько устройств = шеринг.
 */
const shareTracker = new Map(); // proxy_user -> Map<ip, lastSeenMs>

function trackConnection(proxyUser, clientIp) {
    if (!proxyUser || !clientIp) return false;
    const now = Date.now();
    let bucket = shareTracker.get(proxyUser);
    if (!bucket) {
        bucket = new Map();
        shareTracker.set(proxyUser, bucket);
    }
    bucket.set(clientIp, now);
    // вычищаем старые
    for (const [ip, ts] of bucket) {
        if (now - ts > SHAREGUARD_WINDOW_MS) bucket.delete(ip);
    }
    return bucket.size > SHAREGUARD_MAX_IPS;
}

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
     * Body: { token } | { orderId } | { proxyUser }
     *
     * Помечает подписку revoked. Расширение получит 401 при следующем запросе.
     * Полезно если юзер написал «у меня украли креды».
     */
    fastify.post('/api/internal/admin/revoke', async (req, reply) => {
        if (!checkInternalToken(req, reply)) return;
        const { token, orderId, proxyUser } = req.body || {};
        if (!token && !orderId && !proxyUser) {
            return reply.code(400).send({ error: 'token or orderId or proxyUser required' });
        }
        let where, value;
        if (token) { where = 'token = ?'; value = token; }
        else if (orderId) { where = 'id = ?'; value = orderId; }
        else { where = 'proxy_user = ?'; value = proxyUser; }
        const r = db.prepare(`UPDATE orders SET status = 'revoked' WHERE ${where}`).run(value);
        return { ok: true, changed: r.changes };
    });

    /**
     * POST /api/internal/connections
     * Body: { user, ip }  — одна запись о подключении к прокси.
     *
     * Принимает события от shareguard-watcher на прокси-сервере (он tail'ит
     * caddy access log). Если за SHAREGUARD_WINDOW_MS у одного user'а
     * больше SHAREGUARD_MAX_IPS уникальных IP — order помечается revoked.
     * Возвращает {revoked: true} чтобы watcher мог залогировать факт.
     */
    fastify.post('/api/internal/connections', async (req, reply) => {
        if (!checkInternalToken(req, reply)) return;
        const { user, ip } = req.body || {};
        if (!user || !ip) return reply.code(400).send({ error: 'user and ip required' });
        const overLimit = trackConnection(String(user), String(ip));
        if (overLimit) {
            const r = db
                .prepare(`UPDATE orders SET status = 'revoked' WHERE proxy_user = ? AND status = 'paid'`)
                .run(user);
            if (r.changes > 0) {
                fastify.log.warn(
                    { user, ip, ipsInWindow: shareTracker.get(user)?.size },
                    'shareguard: revoked for too many concurrent IPs',
                );
            }
            shareTracker.delete(user);
            return { ok: true, revoked: true };
        }
        return { ok: true, revoked: false };
    });
}

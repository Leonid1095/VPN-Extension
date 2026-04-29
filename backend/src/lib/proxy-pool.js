// Простой пул прокси-серверов на основе JSON-файла.
// MVP: выбираем least-loaded по числу выданных активных подписок.

import fs from 'node:fs';
import crypto from 'node:crypto';
import { db } from './db.js';
import { config } from './config.js';

/**
 * Формат файла:
 * [
 *   {
 *     "id": "eu-1",
 *     "scheme": "https",
 *     "host": "eu-1.proxy.example.com",
 *     "port": 443,
 *     "name": "PLGames EU-1",
 *     "capacity": 200
 *   }
 * ]
 */

let cache = null;
let cacheTime = 0;

function loadPool() {
    if (cache && Date.now() - cacheTime < 30_000) return cache;
    try {
        const raw = fs.readFileSync(config.proxyPoolFile, 'utf-8');
        cache = JSON.parse(raw);
        cacheTime = Date.now();
        return cache;
    } catch (e) {
        return [];
    }
}

function pickServer() {
    const pool = loadPool();
    if (pool.length === 0) return null;

    const counts = db
        .prepare(
            `SELECT proxy_id, COUNT(*) AS n FROM orders
             WHERE status = 'paid' AND subscribed_until > ?
             GROUP BY proxy_id`,
        )
        .all(Date.now());
    const loadMap = Object.fromEntries(counts.map((c) => [c.proxy_id, c.n]));

    return pool
        .map((s) => ({ ...s, load: loadMap[s.id] || 0 }))
        .filter((s) => (s.capacity ?? Infinity) > s.load)
        .sort((a, b) => a.load - b.load)[0] || null;
}

/** Генерим креды для basic_auth Caddy/NaiveProxy. Логин включает orderId для трассировки. */
function generateCreds(orderId) {
    const password = crypto.randomBytes(18).toString('base64url');
    return {
        username: `u_${orderId}`,
        password,
    };
}

/** Возвращает {server, username, password} либо null если пул пуст. */
export function provision(orderId) {
    const server = pickServer();
    if (!server) return null;
    const creds = generateCreds(orderId);
    return { server, ...creds };
}

export function getServerById(id) {
    return loadPool().find((s) => s.id === id) || null;
}

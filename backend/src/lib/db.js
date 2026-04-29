import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = path.resolve('./data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'plgames.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS orders (
    id            TEXT PRIMARY KEY,            -- короткий ID (например 'a8f3k29q'), используется в comment DonatePay
    tier          TEXT NOT NULL,               -- '30d' / '90d' / '365d'
    amount_rub    INTEGER NOT NULL,
    duration_days INTEGER NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'paid' | 'expired' | 'cancelled'
    token         TEXT UNIQUE,                 -- Bearer-токен, генерится после paid
    proxy_id      TEXT,                        -- какой сервер из пула выдан
    proxy_user    TEXT,                        -- сгенерированный логин для basic_auth
    proxy_pass    TEXT,                        -- сгенерированный пароль
    subscribed_until INTEGER,                  -- unix ms окончания подписки
    payment_id    TEXT,                        -- DonatePay payment id из webhook
    created_at    INTEGER NOT NULL,
    paid_at       INTEGER,
    expires_at    INTEGER NOT NULL             -- pending живёт 2 часа, потом отбрасывается
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_token  ON orders(token);
CREATE INDEX IF NOT EXISTS idx_orders_expires ON orders(expires_at);
`);

export function ensureClean() {
    // помечаем просроченные pending как expired (ничего страшного если быстрый юзер ещё успел)
    db.prepare(
        `UPDATE orders SET status = 'expired'
         WHERE status = 'pending' AND expires_at < ?`,
    ).run(Date.now());
}

import crypto from 'node:crypto';

/** Длинный random Bearer-токен (без серверного состояния — хранится в orders). */
export function generateToken() {
    return crypto.randomBytes(32).toString('base64url');
}

/** Короткий читаемый orderId. Не содержит "0OIl1" чтобы было читать вслух. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function generateOrderId(n = 8) {
    const bytes = crypto.randomBytes(n);
    let out = '';
    for (let i = 0; i < n; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
}

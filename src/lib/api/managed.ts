/**
 * Клиент нашего бэкенда (managed VPN).
 *
 * Сейчас это ЗАГЛУШКА с детерминированными моками — расширение полностью
 * собирается и работает без реального API. Чтобы подключить настоящий
 * бэкенд, замените:
 *   1) BACKEND_URL — реальный URL API
 *   2) BUY_URL     — публичная страница покупки подписки
 *   3) Реализацию методов login / fetchAccount / fetchProvisionedProfile
 *      на fetch к BACKEND_URL с указанными ниже схемами запросов/ответов.
 *
 * Контракт ответов сервера:
 *
 *   POST /api/auth/login          { email, password }   -> { token, account }
 *   POST /api/auth/logout         (Bearer)              -> 200
 *   GET  /api/account             (Bearer)              -> { account }
 *   GET  /api/profile             (Bearer)              -> { profile }
 *
 *   account =
 *     { email: string; subscribedUntil?: number /* unix ms *​/ }
 *   profile =
 *     { scheme, host, port, username?, password?, name? }
 */

import { ManagedAccount, ProxyProfile } from '../../common/types';
import { buildProfile, ParsedProxy } from '../../common/parse';

/** Реальный URL — заменить при деплое. */
export const BACKEND_URL = 'https://api.example.com';
/** Страница покупки/тарифов — открывается в новой вкладке. */
export const BUY_URL = 'https://example.com/pricing';

const MOCK = true; // флипнуть в false когда будет бэкенд

interface LoginResult {
    account: ManagedAccount;
}

export class ManagedApiError extends Error {}

export async function login(email: string, password: string): Promise<LoginResult> {
    if (!email || !password) {
        throw new ManagedApiError('Введи email и пароль');
    }
    if (MOCK) {
        // Демо-аккаунт: любой email/пароль примет, подписка на 30 дней
        return {
            account: {
                email,
                token: 'mock_token_' + Math.random().toString(36).slice(2),
                subscribedUntil: Date.now() + 30 * 24 * 60 * 60 * 1000,
                lastSyncedAt: Date.now(),
            },
        };
    }
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new ManagedApiError(`Не удалось войти (${res.status})`);
    const data = await res.json();
    return {
        account: {
            email: data.account.email,
            token: data.token,
            subscribedUntil: data.account.subscribedUntil,
            lastSyncedAt: Date.now(),
        },
    };
}

export async function logout(account: ManagedAccount): Promise<void> {
    if (MOCK) return;
    try {
        await fetch(`${BACKEND_URL}/api/auth/logout`, {
            method: 'POST',
            headers: { authorization: `Bearer ${account.token}` },
        });
    } catch {
        // ignore — локально всё равно очистим
    }
}

export async function refreshAccount(account: ManagedAccount): Promise<ManagedAccount> {
    if (MOCK) {
        return { ...account, lastSyncedAt: Date.now() };
    }
    const res = await fetch(`${BACKEND_URL}/api/account`, {
        headers: { authorization: `Bearer ${account.token}` },
    });
    if (!res.ok) throw new ManagedApiError(`Сессия истекла (${res.status})`);
    const data = await res.json();
    return {
        ...account,
        email: data.account.email,
        subscribedUntil: data.account.subscribedUntil,
        lastSyncedAt: Date.now(),
    };
}

/**
 * Запрашивает у бэкенда provisioned-профиль. Возвращает готовый ProxyProfile
 * (с source='managed'), но с собственным id, чтобы локально дедуплицировать
 * по host:port не по id.
 */
export async function fetchProvisionedProfile(account: ManagedAccount): Promise<ProxyProfile> {
    if (!account.subscribedUntil || account.subscribedUntil < Date.now()) {
        throw new ManagedApiError('Подписка не активна');
    }

    let parsed: ParsedProxy;
    if (MOCK) {
        // Демо-профиль — он не подключится к реальному серверу, но UI и логика
        // активации проверяются полностью.
        parsed = {
            scheme: 'https',
            host: 'demo-proxy.example.com',
            port: 443,
            username: 'demo_' + account.email.split('@')[0],
            password: 'demo_password',
            name: 'Наш сервер (демо)',
        };
    } else {
        const res = await fetch(`${BACKEND_URL}/api/profile`, {
            headers: { authorization: `Bearer ${account.token}` },
        });
        if (!res.ok) throw new ManagedApiError(`Не удалось получить профиль (${res.status})`);
        const data = await res.json();
        parsed = {
            scheme: data.profile.scheme,
            host: data.profile.host,
            port: data.profile.port,
            username: data.profile.username,
            password: data.profile.password,
            name: data.profile.name,
        };
    }

    return buildProfile(parsed, 'managed', parsed.name || 'Наш сервер');
}

export function openBuyPage(): void {
    if (typeof chrome !== 'undefined' && (chrome as any).tabs && (chrome as any).tabs.create) {
        (chrome as any).tabs.create({ url: BUY_URL });
    } else {
        // popup-context fallback
        window.open(BUY_URL, '_blank');
    }
}

/**
 * Клиент бэкенда PLGames Connect.
 * Контракт описан в backend/src/routes/*.js. CORS открыт для расширений.
 *
 * Чтобы поменять адрес API — собери расширение с переменной окружения
 * PLGAMES_API_URL=https://api.your-domain.example  npm run build
 * (см. webpack.config.js)
 */

import { ManagedAccount, PendingOrder, ProxyProfile, ProxyScheme } from '../../common/types';
import { buildProfile, ParsedProxy } from '../../common/parse';
import { getInstallationId } from '../../common/storage';

declare const PLGAMES_API_URL: string | undefined;
declare const process: { env: { PLGAMES_API_URL?: string } } | undefined;

function resolveApiUrl(): string {
    try {
        if (typeof PLGAMES_API_URL !== 'undefined' && PLGAMES_API_URL) {
            return PLGAMES_API_URL;
        }
    } catch {
        // не определён — fallback ниже
    }
    return 'https://api.plgames-connect.example';
}

export const API_URL = resolveApiUrl();

export class ManagedApiError extends Error {
    constructor(
        message: string,
        public statusCode: number = 0,
    ) {
        super(message);
    }
}

interface RawTier {
    key: string;
    label: string;
    amountRub: number;
    durationDays: number;
}
export interface Tier extends RawTier {}

interface RawOrder {
    id: string;
    tier: string;
    status: 'pending' | 'paid' | 'expired' | 'cancelled';
    amountRub: number;
    durationDays: number;
    createdAt: number;
    expiresAt: number;
    token?: string;
    subscribedUntil?: number;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
            'content-type': 'application/json',
            ...(init?.headers || {}),
        },
    });
    let data: any = null;
    try {
        data = await res.json();
    } catch {
        /* ignore */
    }
    if (!res.ok) {
        const msg = data?.error || `Сервер вернул ${res.status}`;
        throw new ManagedApiError(msg, res.status);
    }
    return data as T;
}

/** Список тарифов для UI попапа. */
export async function fetchTiers(): Promise<Tier[]> {
    const data = await api<{ tiers: RawTier[] }>(`/api/tiers`);
    return data.tiers;
}

/** Создать pending-заказ. Возвращает данные для polling и paymentUrl для DonatePay. */
export async function createOrder(tierKey: string): Promise<{
    pending: PendingOrder;
    paymentUrl: string;
}> {
    const data = await api<{
        order: RawOrder;
        paymentUrl: string;
        comment: string;
        tierLabel: string;
    }>(`/api/orders`, {
        method: 'POST',
        body: JSON.stringify({ tier: tierKey }),
    });
    return {
        pending: {
            id: data.order.id,
            tier: data.order.tier,
            tierLabel: data.tierLabel,
            amountRub: data.order.amountRub,
            paymentUrl: data.paymentUrl,
            comment: data.comment,
            createdAt: data.order.createdAt,
            expiresAt: data.order.expiresAt,
        },
        paymentUrl: data.paymentUrl,
    };
}

export interface OrderStatusResult {
    status: 'pending' | 'paid' | 'expired' | 'cancelled' | 'unknown';
    account?: ManagedAccount;
    profile?: ProxyProfile;
}

/** Опросить статус заказа. Если paid — сразу возвращаем account+profile. */
export async function pollOrder(orderId: string): Promise<OrderStatusResult> {
    const data = await api<{ order: RawOrder }>(`/api/orders/${encodeURIComponent(orderId)}`);
    const o = data.order;
    if (o.status !== 'paid') return { status: o.status };

    if (!o.token || !o.subscribedUntil) {
        return { status: 'unknown' };
    }

    const account: ManagedAccount = {
        token: o.token,
        subscribedUntil: o.subscribedUntil,
        durationDays: o.durationDays,
        tier: o.tier,
        lastSyncedAt: Date.now(),
    };

    const profile = await fetchProfile(account);
    return { status: 'paid', account, profile };
}

/** Получить прокси-креды по уже выданному токену. */
export async function fetchProfile(account: ManagedAccount): Promise<ProxyProfile> {
    const installationId = await getInstallationId();
    const data = await api<{
        profile: {
            scheme: ProxyScheme;
            host: string;
            port: number;
            username?: string;
            password?: string;
            name?: string;
        };
    }>(`/api/profile`, {
        headers: {
            authorization: `Bearer ${account.token}`,
            'x-installation-id': installationId,
        },
    });
    const parsed: ParsedProxy = {
        scheme: data.profile.scheme,
        host: data.profile.host,
        port: data.profile.port,
        username: data.profile.username,
        password: data.profile.password,
        name: data.profile.name,
    };
    return buildProfile(parsed, 'managed', parsed.name || 'PLGames Pro');
}

/**
 * Принудительная ротация кредов: бэкенд выдаёт новый username/password,
 * старые перестают работать после следующего sync на прокси-сервере.
 * Зовётся фоновым SW раз в 12 часов.
 */
export async function rotateProfile(account: ManagedAccount): Promise<ProxyProfile> {
    const installationId = await getInstallationId();
    const data = await api<{
        profile: {
            scheme: ProxyScheme;
            host: string;
            port: number;
            username?: string;
            password?: string;
            name?: string;
        };
    }>(`/api/profile/rotate`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${account.token}`,
            'x-installation-id': installationId,
        },
    });
    const parsed: ParsedProxy = {
        scheme: data.profile.scheme,
        host: data.profile.host,
        port: data.profile.port,
        username: data.profile.username,
        password: data.profile.password,
        name: data.profile.name,
    };
    return buildProfile(parsed, 'managed', parsed.name || 'PLGames Pro');
}

/** Обновить состояние подписки (например, после открытия попапа после долгого простоя). */
export async function refreshAccount(account: ManagedAccount): Promise<ManagedAccount> {
    const data = await api<{
        account: { subscribedUntil: number; durationDays: number; tier: string };
    }>(`/api/account`, {
        headers: { authorization: `Bearer ${account.token}` },
    });
    return {
        ...account,
        subscribedUntil: data.account.subscribedUntil,
        durationDays: data.account.durationDays,
        tier: data.account.tier,
        lastSyncedAt: Date.now(),
    };
}

export async function logout(account: ManagedAccount): Promise<void> {
    try {
        await api(`/api/auth/logout`, {
            method: 'POST',
            headers: { authorization: `Bearer ${account.token}` },
        });
    } catch {
        /* всё равно удаляем локально */
    }
}

export function openPaymentPage(url: string): void {
    if (typeof chrome !== 'undefined' && (chrome as any).tabs?.create) {
        (chrome as any).tabs.create({ url });
    } else {
        window.open(url, '_blank');
    }
}

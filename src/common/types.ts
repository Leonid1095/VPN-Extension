export type ProxyScheme = 'https' | 'http' | 'socks5' | 'socks4';

/**
 * Источник профиля:
 *  - 'byo'      — пользователь добавил свой сервер (ссылка/файл/руками)
 *  - 'managed'  — выдан нашим бэкендом по оплаченному заказу
 */
export type ProxySource = 'byo' | 'managed';

export interface ProxyProfile {
    id: string;
    name: string;
    scheme: ProxyScheme;
    host: string;
    port: number;
    username?: string;
    password?: string;
    /** Откуда профиль появился. Managed нельзя редактировать в UI. */
    source: ProxySource;
    /** Только для managed: когда был обновлён с бэкенда (unix ms). */
    syncedAt?: number;
}

/**
 * Pending-заказ: создан в расширении, но ещё не оплачен.
 * Попап polling-ом проверяет статус, фоновый SW дублирует через chrome.alarms.
 */
export interface PendingOrder {
    id: string;
    tier: string;            // '30d' | '90d' | '365d'
    tierLabel: string;
    amountRub: number;
    paymentUrl: string;      // ссылка на DonatePay
    comment: string;         // что юзер увидит в комментарии при оплате
    createdAt: number;
    expiresAt: number;
}

/**
 * Состояние активной подписки (после успешной оплаты).
 */
export interface ManagedAccount {
    /** Bearer-токен, выданный бэкендом. Хранится только локально. */
    token: string;
    subscribedUntil: number;     // unix ms
    durationDays: number;
    tier: string;
    lastSyncedAt: number;
}

/**
 * Информация о доступной новой версии расширения.
 * Заполняется фоновой проверкой GitHub Releases раз в 24 часа.
 */
export interface UpdateInfo {
    latestVersion: string;       // например "2.4.2"
    currentVersion: string;      // версия из манифеста на момент проверки
    releaseUrl: string;          // ссылка на страницу релиза
    downloadUrl: string;         // прямая ссылка на zip
    notes: string;               // первые ~400 символов release notes
    checkedAt: number;           // unix ms
    dismissedFor?: string;       // версия, для которой юзер скрыл уведомление
}

export interface AppSettings {
    enabled: boolean;
    activeProfileId: string | null;
    profiles: ProxyProfile[];
    bypassList: string[];
    account: ManagedAccount | null;
    pendingOrder: PendingOrder | null;
    update: UpdateInfo | null;
}

export type ConnectionStatus = 'connected' | 'disconnected';

/**
 * Хосты, которые расширение НЕ проксирует — обычные local-isolation
 * + наши собственные домены, чтобы запросы /api/profile, /api/account и т.п.
 * шли напрямую с устройства юзера, а не через прокси-туннель к нашему же
 * серверу (избегаем hairpin: через прокси-сервер обратно к API того же
 * VPS — это даёт 5-секундные стопы из-за NAT-loopback в SNI-стримере).
 */

// Адрес API подставляется на сборке (webpack DefinePlugin, из PLGAMES_API_URL).
declare const PLGAMES_API_URL: string | undefined;

/**
 * Хосты бэкенда выводятся из сконфигурированного API-URL, а не хардкодятся:
 * сам хост, апекс-домен и все его поддомены. Так в исходниках нет привязки к
 * конкретному продакшен-домену — он задаётся только при сборке.
 */
function apiBypassHosts(): string[] {
    try {
        if (typeof PLGAMES_API_URL !== 'undefined' && PLGAMES_API_URL) {
            const host = new URL(PLGAMES_API_URL).hostname;
            const apex = host.split('.').slice(-2).join('.');
            return Array.from(new Set([host, apex, `*.${apex}`]));
        }
    } catch {
        /* невалидный URL — просто без bypass для бэкенда */
    }
    return [];
}

export const DEFAULT_BYPASS_LIST: string[] = [
    'localhost',
    '127.0.0.1',
    '<local>',
    ...apiBypassHosts(),
];

export const DEFAULT_SETTINGS: AppSettings = {
    enabled: false,
    activeProfileId: null,
    profiles: [],
    bypassList: [...DEFAULT_BYPASS_LIST],
    account: null,
    pendingOrder: null,
    update: null,
};

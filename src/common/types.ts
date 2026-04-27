export type ProxyScheme = 'https' | 'http' | 'socks5' | 'socks4';

/**
 * Источник профиля:
 *  - 'byo'      — пользователь добавил свой сервер (ссылка/файл/руками)
 *  - 'managed'  — выдан нашим бэкендом по активной подписке
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

export interface ManagedAccount {
    email: string;
    /** Bearer-токен от нашего бэкенда. Хранится только локально. */
    token: string;
    /** Дата окончания подписки (unix ms). undefined => подписки нет. */
    subscribedUntil?: number;
    /** Когда последний раз ходили на бэкенд. */
    lastSyncedAt: number;
}

export interface AppSettings {
    enabled: boolean;
    activeProfileId: string | null;
    profiles: ProxyProfile[];
    bypassList: string[];
    account: ManagedAccount | null;
}

export type ConnectionStatus = 'connected' | 'disconnected';

export const DEFAULT_BYPASS_LIST: string[] = ['localhost', '127.0.0.1', '<local>'];

export const DEFAULT_SETTINGS: AppSettings = {
    enabled: false,
    activeProfileId: null,
    profiles: [],
    bypassList: [...DEFAULT_BYPASS_LIST],
    account: null,
};

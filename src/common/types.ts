export type ProxyScheme = 'https' | 'http' | 'socks5' | 'socks4';

export interface ProxyProfile {
    id: string;
    name: string;
    scheme: ProxyScheme;
    host: string;
    port: number;
    username?: string;
    password?: string;
}

export interface AppSettings {
    enabled: boolean;
    activeProfileId: string | null;
    profiles: ProxyProfile[];
    bypassList: string[];
}

export type ConnectionStatus = 'connected' | 'disconnected';

export const DEFAULT_BYPASS_LIST: string[] = ['localhost', '127.0.0.1', '<local>'];

export const DEFAULT_SETTINGS: AppSettings = {
    enabled: false,
    activeProfileId: null,
    profiles: [],
    bypassList: [...DEFAULT_BYPASS_LIST],
};

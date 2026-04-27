import { ProxyProfile, ProxyScheme } from './types';

const VALID_SCHEMES: ProxyScheme[] = ['https', 'http', 'socks5', 'socks4'];

export function generateId(): string {
    return 'p_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

export function defaultPort(scheme: ProxyScheme): number {
    switch (scheme) {
        case 'https':
            return 443;
        case 'http':
            return 8080;
        case 'socks5':
        case 'socks4':
            return 1080;
    }
}

export function isValidHost(host: string): boolean {
    if (!host) return false;
    const ipv4 =
        /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (ipv4.test(host)) return true;
    const ipv6 = /^\[?[0-9a-fA-F:]+\]?$/;
    if (ipv6.test(host) && host.includes(':')) return true;
    const domain =
        /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
    return domain.test(host);
}

export function isValidPort(port: number): boolean {
    return Number.isInteger(port) && port > 0 && port <= 65535;
}

export interface ParsedProxy {
    scheme: ProxyScheme;
    host: string;
    port: number;
    username?: string;
    password?: string;
}

export function parseProxyUrl(url: string): ParsedProxy {
    const trimmed = url.trim();
    const match = trimmed.match(
        /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(?:([^:@/\s]+)(?::([^@/\s]*))?@)?(\[[0-9a-fA-F:]+\]|[^:/\s]+)(?::(\d+))?\/?$/,
    );
    if (!match) {
        throw new Error('Не удалось разобрать URL прокси (ожидаемый формат: scheme://[user:pass@]host[:port])');
    }
    const [, rawScheme, user, pass, host, portStr] = match;
    const scheme = rawScheme.toLowerCase() as ProxyScheme;
    if (!VALID_SCHEMES.includes(scheme)) {
        throw new Error(`Схема "${rawScheme}" не поддерживается. Допустимы: https, http, socks5, socks4.`);
    }
    if (!isValidHost(host.replace(/^\[|\]$/g, ''))) {
        throw new Error('Некорректный хост');
    }
    const port = portStr ? parseInt(portStr, 10) : defaultPort(scheme);
    if (!isValidPort(port)) {
        throw new Error('Некорректный порт (1–65535)');
    }
    return {
        scheme,
        host,
        port,
        username: user ? safeDecode(user) : undefined,
        password: pass ? safeDecode(pass) : undefined,
    };
}

function safeDecode(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

export function validateProfile(profile: Partial<ProxyProfile>): string[] {
    const errors: string[] = [];
    if (!profile.name || !profile.name.trim()) {
        errors.push('Укажите название профиля');
    }
    if (!profile.scheme || !VALID_SCHEMES.includes(profile.scheme)) {
        errors.push('Выберите схему (https, http, socks5, socks4)');
    }
    if (!profile.host || !isValidHost(profile.host)) {
        errors.push('Некорректный хост');
    }
    if (!profile.port || !isValidPort(profile.port)) {
        errors.push('Некорректный порт');
    }
    if ((profile.username && !profile.password) || (!profile.username && profile.password)) {
        errors.push('Укажите логин и пароль вместе либо оставьте оба пустыми');
    }
    if (profile.scheme === 'socks4' && (profile.username || profile.password)) {
        errors.push('SOCKS4 не поддерживает авторизацию по логину/паролю');
    }
    return errors;
}

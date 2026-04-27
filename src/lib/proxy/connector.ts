import { browser } from 'webextension-polyfill-ts';
import { AppSettings, ConnectionStatus, ProxyProfile } from '../../common/types';

interface ChromeSingleProxy {
    scheme: string;
    host: string;
    port: number;
}

interface ChromeProxyValue {
    mode: 'fixed_servers' | 'direct' | 'auto_detect' | 'pac_script' | 'system';
    rules?: {
        singleProxy: ChromeSingleProxy;
        bypassList: string[];
    };
}

function buildProxyValue(profile: ProxyProfile, bypassList: string[]): ChromeProxyValue {
    return {
        mode: 'fixed_servers',
        rules: {
            singleProxy: {
                scheme: profile.scheme,
                host: profile.host,
                port: profile.port,
            },
            bypassList: bypassList.length ? bypassList : ['localhost', '127.0.0.1', '<local>'],
        },
    };
}

export async function applyProxy(settings: AppSettings): Promise<void> {
    const profile =
        settings.activeProfileId !== null
            ? settings.profiles.find((p) => p.id === settings.activeProfileId)
            : undefined;

    if (settings.enabled && profile) {
        const value = buildProxyValue(profile, settings.bypassList);
        await browser.proxy.settings.set({ value: value as any, scope: 'regular' });
    } else {
        await browser.proxy.settings.clear({ scope: 'regular' });
    }
}

export async function clearProxy(): Promise<void> {
    await browser.proxy.settings.clear({ scope: 'regular' });
}

export async function getProxyStatus(): Promise<ConnectionStatus> {
    try {
        const current = (await browser.proxy.settings.get({})) as any;
        const value = current?.value as ChromeProxyValue | undefined;
        if (value && value.mode === 'fixed_servers') {
            return 'connected';
        }
        return 'disconnected';
    } catch {
        return 'disconnected';
    }
}

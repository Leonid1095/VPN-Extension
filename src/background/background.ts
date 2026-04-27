import { browser } from 'webextension-polyfill-ts';
import { AppSettings, ProxyProfile } from '../common/types';
import { getSettings, saveSettings, upsertProfile, removeProfile } from '../common/storage';
import { applyProxy, getProxyStatus } from '../lib/proxy/connector';

declare const chrome: any;

const COLOR_ON: [number, number, number, number] = [40, 167, 69, 255];
const COLOR_OFF: [number, number, number, number] = [108, 117, 125, 255];

function paintIcon(color: [number, number, number, number], size: number): ImageData {
    const buf = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < size * size; i++) {
        const o = i * 4;
        buf[o] = color[0];
        buf[o + 1] = color[1];
        buf[o + 2] = color[2];
        buf[o + 3] = color[3];
    }
    return new ImageData(buf, size, size);
}

async function refreshIcon(settings: AppSettings): Promise<void> {
    const enabled = settings.enabled && settings.activeProfileId !== null;
    const color = enabled ? COLOR_ON : COLOR_OFF;
    const sizes = [16, 32, 48, 128];
    const imageData: Record<number, ImageData> = {};
    for (const s of sizes) {
        imageData[s] = paintIcon(color, s);
    }
    await browser.action.setIcon({ imageData });
    await browser.action.setBadgeText({ text: enabled ? 'ON' : '' });
    await browser.action.setBadgeBackgroundColor({ color: '#28a745' });
}

async function syncFromStorage(): Promise<AppSettings> {
    const settings = await getSettings();
    await applyProxy(settings);
    await refreshIcon(settings);
    return settings;
}

function findActive(settings: AppSettings): ProxyProfile | undefined {
    if (settings.activeProfileId === null) return undefined;
    return settings.profiles.find((p) => p.id === settings.activeProfileId);
}

if (typeof chrome !== 'undefined' && chrome.webRequest && chrome.webRequest.onAuthRequired) {
    chrome.webRequest.onAuthRequired.addListener(
        (details: any, callback: (resp: { authCredentials?: { username: string; password: string } }) => void) => {
            if (!details || !details.isProxy) {
                callback({});
                return;
            }
            getSettings()
                .then((settings) => {
                    if (!settings.enabled) {
                        callback({});
                        return;
                    }
                    const profile = findActive(settings);
                    if (profile && profile.username && profile.password) {
                        callback({
                            authCredentials: {
                                username: profile.username,
                                password: profile.password,
                            },
                        });
                    } else {
                        callback({});
                    }
                })
                .catch(() => callback({}));
        },
        { urls: ['<all_urls>'] },
        ['asyncBlocking'],
    );
}

browser.runtime.onMessage.addListener(async (message: any) => {
    switch (message?.type) {
        case 'getSettings': {
            return await getSettings();
        }
        case 'upsertProfile': {
            const settings = await upsertProfile(message.profile as ProxyProfile);
            return settings;
        }
        case 'removeProfile': {
            const settings = await removeProfile(message.id as string);
            await applyProxy(settings);
            await refreshIcon(settings);
            return settings;
        }
        case 'activate': {
            const settings = await getSettings();
            const exists = settings.profiles.some((p) => p.id === message.id);
            if (!exists) {
                throw new Error('Профиль не найден');
            }
            settings.activeProfileId = message.id as string;
            settings.enabled = true;
            await saveSettings(settings);
            await applyProxy(settings);
            await refreshIcon(settings);
            return settings;
        }
        case 'deactivate': {
            const settings = await getSettings();
            settings.enabled = false;
            await saveSettings(settings);
            await applyProxy(settings);
            await refreshIcon(settings);
            return settings;
        }
        case 'updateBypassList': {
            const settings = await getSettings();
            settings.bypassList = Array.isArray(message.bypassList) ? message.bypassList : settings.bypassList;
            await saveSettings(settings);
            await applyProxy(settings);
            return settings;
        }
        case 'getStatus': {
            const status = await getProxyStatus();
            return { status };
        }
        default:
            return undefined;
    }
});

browser.runtime.onInstalled.addListener(() => {
    void syncFromStorage();
});

browser.runtime.onStartup.addListener(() => {
    void syncFromStorage();
});

void syncFromStorage();

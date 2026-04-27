import { browser } from 'webextension-polyfill-ts';
import { AppSettings, ProxyProfile } from '../common/types';
import {
    getSettings,
    saveSettings,
    upsertProfile,
    removeProfile,
    setAccount,
} from '../common/storage';
import { applyProxy, getProxyStatus } from '../lib/proxy/connector';
import {
    fetchProvisionedProfile,
    login as apiLogin,
    logout as apiLogout,
    ManagedApiError,
    refreshAccount,
} from '../lib/api/managed';

declare const chrome: any;

// ----- icon rendering --------------------------------------------------------

function drawIcon(size: number, active: boolean): ImageData {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
    if (!ctx) {
        // Fallback: solid square
        const buf = new Uint8ClampedArray(size * size * 4);
        const c = active ? [40, 167, 69, 255] : [108, 117, 125, 255];
        for (let i = 0; i < size * size; i++) {
            const o = i * 4;
            buf[o] = c[0];
            buf[o + 1] = c[1];
            buf[o + 2] = c[2];
            buf[o + 3] = c[3];
        }
        return new ImageData(buf, size, size);
    }

    ctx.clearRect(0, 0, size, size);

    // Скруглённый квадрат-фон
    const r = size * 0.22;
    const bg = ctx.createLinearGradient(0, 0, 0, size);
    if (active) {
        bg.addColorStop(0, '#34d399');
        bg.addColorStop(1, '#059669');
    } else {
        bg.addColorStop(0, '#94a3b8');
        bg.addColorStop(1, '#475569');
    }
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();

    // Щит-глиф (упрощённый): белая фигура в центре
    ctx.fillStyle = '#ffffff';
    const cx = size / 2;
    const top = size * 0.22;
    const bot = size * 0.82;
    const w = size * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx + w / 2, top + size * 0.08);
    ctx.lineTo(cx + w / 2, size * 0.55);
    ctx.quadraticCurveTo(cx + w / 2, bot, cx, bot);
    ctx.quadraticCurveTo(cx - w / 2, bot, cx - w / 2, size * 0.55);
    ctx.lineTo(cx - w / 2, top + size * 0.08);
    ctx.closePath();
    ctx.fill();

    // Галочка / стрелка внутри щита
    ctx.strokeStyle = active ? '#059669' : '#475569';
    ctx.lineWidth = Math.max(1.5, size * 0.07);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.13, size * 0.5);
    ctx.lineTo(cx - size * 0.02, size * 0.62);
    ctx.lineTo(cx + size * 0.16, size * 0.4);
    ctx.stroke();

    return ctx.getImageData(0, 0, size, size);
}

async function refreshIcon(settings: AppSettings): Promise<void> {
    const enabled = settings.enabled && settings.activeProfileId !== null;
    const sizes = [16, 32, 48, 128];
    const imageData: Record<number, ImageData> = {};
    for (const s of sizes) {
        imageData[s] = drawIcon(s, enabled);
    }
    try {
        await browser.action.setIcon({ imageData });
    } catch {
        // если SW проснулся в момент когда action недоступно — пропускаем
    }
    try {
        await browser.action.setBadgeText({ text: enabled ? 'ON' : '' });
        await browser.action.setBadgeBackgroundColor({ color: '#059669' });
    } catch {
        // ignore
    }
}

// ----- proxy state sync ------------------------------------------------------

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

// ----- proxy auth ------------------------------------------------------------

if (typeof chrome !== 'undefined' && chrome.webRequest && chrome.webRequest.onAuthRequired) {
    chrome.webRequest.onAuthRequired.addListener(
        (
            details: any,
            callback: (resp: { authCredentials?: { username: string; password: string } }) => void,
        ) => {
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

// ----- message handlers ------------------------------------------------------

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
            settings.bypassList = Array.isArray(message.bypassList)
                ? message.bypassList
                : settings.bypassList;
            await saveSettings(settings);
            await applyProxy(settings);
            return settings;
        }
        case 'getStatus': {
            const status = await getProxyStatus();
            return { status };
        }

        // ----- managed VPN ---------------------------------------------------

        case 'managedLogin': {
            try {
                const { account } = await apiLogin(message.email, message.password);
                let settings = await setAccount(account);
                // Сразу пытаемся подтянуть provisioned-профиль
                try {
                    const profile = await fetchProvisionedProfile(account);
                    // Дедуп: убираем старые managed-профили и кладём свежий
                    settings.profiles = settings.profiles.filter((p) => p.source !== 'managed');
                    settings.profiles.push({ ...profile, syncedAt: Date.now() });
                    await saveSettings(settings);
                } catch (e) {
                    // профиля пока нет — это ок (например, без подписки)
                }
                return { ok: true, settings };
            } catch (e) {
                return { ok: false, error: (e as Error).message };
            }
        }
        case 'managedLogout': {
            const settings = await getSettings();
            if (settings.account) {
                try {
                    await apiLogout(settings.account);
                } catch {
                    /* ignore */
                }
            }
            const next = await setAccount(null);
            await applyProxy(next);
            await refreshIcon(next);
            return { ok: true, settings: next };
        }
        case 'managedRefresh': {
            const settings = await getSettings();
            if (!settings.account) return { ok: false, error: 'Не авторизован' };
            try {
                const account = await refreshAccount(settings.account);
                let next = await setAccount(account);
                try {
                    const profile = await fetchProvisionedProfile(account);
                    next.profiles = next.profiles.filter((p) => p.source !== 'managed');
                    next.profiles.push({ ...profile, syncedAt: Date.now() });
                    await saveSettings(next);
                } catch (e) {
                    if (e instanceof ManagedApiError) {
                        // подписки нет — оставляем без managed-профиля
                        next.profiles = next.profiles.filter((p) => p.source !== 'managed');
                        await saveSettings(next);
                    } else {
                        throw e;
                    }
                }
                return { ok: true, settings: next };
            } catch (e) {
                return { ok: false, error: (e as Error).message };
            }
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

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

// ----- brand icon rendering --------------------------------------------------
// Эта функция рисует "P"-монограмму на indigo-градиентном квадрате — точно ту
// же геометрию, что и tools/build-icons.js, но в OffscreenCanvas, на лету.

interface IconColors {
    bgTop: string;
    bgBot: string;
    glyph: string;
    accent: string | null;
}

const ICON_ACTIVE: IconColors = {
    bgTop: '#6366f1',
    bgBot: '#4338ca',
    glyph: '#ffffff',
    accent: '#10b981',
};
const ICON_IDLE: IconColors = {
    bgTop: '#94a3b8',
    bgBot: '#475569',
    glyph: '#ffffff',
    accent: null,
};

function drawIcon(size: number, colors: IconColors): ImageData {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
    if (!ctx) {
        // Fallback solid colour
        const buf = new Uint8ClampedArray(size * size * 4);
        for (let i = 0; i < size * size; i++) {
            const o = i * 4;
            buf[o] = 99;
            buf[o + 1] = 102;
            buf[o + 2] = 241;
            buf[o + 3] = 255;
        }
        return new ImageData(buf, size, size);
    }

    ctx.clearRect(0, 0, size, size);

    // 1. скруглённый квадрат — фон
    const r = size * 0.22;
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, colors.bgTop);
    grad.addColorStop(1, colors.bgBot);
    ctx.fillStyle = grad;
    roundedRectPath(ctx, 0, 0, size, size, r);
    ctx.fill();

    // 2. "P"-монограмма
    const T = size * 0.16;
    const stem_x = size * 0.3;
    const stem_top = size * 0.2;
    const stem_bot = size * 0.82;
    const bowl_cx = stem_x + T / 2;
    const bowl_cy = size * 0.36;
    const outer_R = size * 0.24;

    ctx.strokeStyle = colors.glyph;
    ctx.fillStyle = colors.glyph;
    ctx.lineWidth = T;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // вертикальный stem
    ctx.beginPath();
    ctx.moveTo(stem_x + T / 2, stem_top + T / 2);
    ctx.lineTo(stem_x + T / 2, stem_bot - T / 2);
    ctx.stroke();

    // bowl как полудуга (от верха stem'а вокруг и обратно к stem'у)
    ctx.beginPath();
    ctx.arc(bowl_cx, bowl_cy, outer_R - T / 2, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    // 3. accent dot (online)
    if (colors.accent) {
        const ax = size * 0.78;
        const ay = size * 0.78;
        const aR = size * 0.16;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ax, ay, aR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = colors.accent;
        ctx.beginPath();
        ctx.arc(ax, ay, aR - size * 0.04, 0, Math.PI * 2);
        ctx.fill();
    }

    return ctx.getImageData(0, 0, size, size);
}

function roundedRectPath(
    ctx: OffscreenCanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

async function refreshIcon(settings: AppSettings): Promise<void> {
    const enabled = settings.enabled && settings.activeProfileId !== null;
    const colors = enabled ? ICON_ACTIVE : ICON_IDLE;
    const sizes = [16, 32, 48, 128];
    const imageData: Record<number, ImageData> = {};
    for (const s of sizes) {
        imageData[s] = drawIcon(s, colors);
    }
    try {
        await browser.action.setIcon({ imageData });
    } catch {
        /* ignore */
    }
    try {
        await browser.action.setBadgeText({ text: '' }); // бренд-точка уже на иконке
    } catch {
        /* ignore */
    }
    try {
        const profile = enabled
            ? settings.profiles.find((p) => p.id === settings.activeProfileId)
            : undefined;
        const title = profile
            ? `PLGames Connect — ${profile.name} (${profile.scheme}://${profile.host}:${profile.port})`
            : 'PLGames Connect — выключено';
        await browser.action.setTitle({ title });
    } catch {
        /* ignore */
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

        // ----- managed (PLGames Pro) ----------------------------------------

        case 'managedLogin': {
            try {
                const { account } = await apiLogin(message.email, message.password);
                let settings = await setAccount(account);
                try {
                    const profile = await fetchProvisionedProfile(account);
                    settings.profiles = settings.profiles.filter((p) => p.source !== 'managed');
                    settings.profiles.push({ ...profile, syncedAt: Date.now() });
                    await saveSettings(settings);
                } catch {
                    /* без подписки или временная ошибка — ок */
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

import { browser } from 'webextension-polyfill-ts';
import { AppSettings, ProxyProfile } from '../common/types';
import {
    getSettings,
    saveSettings,
    upsertProfile,
    removeProfile,
    setAccount,
    setPendingOrder,
    upsertManagedProfile,
    setUpdateInfo,
    dismissUpdate,
} from '../common/storage';
import { checkForUpdate } from '../lib/updater';
import { applyProxy, getProxyStatus } from '../lib/proxy/connector';
import {
    createOrder,
    fetchTiers,
    logout as apiLogout,
    pollOrder,
    refreshAccount,
    rotateProfile,
} from '../lib/api/managed';

declare const chrome: any;

// ----- icon rendering --------------------------------------------------------

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

function drawIcon(size: number, colors: IconColors): ImageData {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
    if (!ctx) {
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
    const r = size * 0.22;
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, colors.bgTop);
    grad.addColorStop(1, colors.bgBot);
    ctx.fillStyle = grad;
    roundedRectPath(ctx, 0, 0, size, size, r);
    ctx.fill();

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
    ctx.beginPath();
    ctx.moveTo(stem_x + T / 2, stem_top + T / 2);
    ctx.lineTo(stem_x + T / 2, stem_bot - T / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bowl_cx, bowl_cy, outer_R - T / 2, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

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

async function refreshIcon(settings: AppSettings): Promise<void> {
    const enabled = settings.enabled && settings.activeProfileId !== null;
    const colors = enabled ? ICON_ACTIVE : ICON_IDLE;
    const sizes = [16, 32, 48, 128];
    const imageData: Record<number, ImageData> = {};
    for (const s of sizes) imageData[s] = drawIcon(s, colors);
    try {
        await browser.action.setIcon({ imageData });
    } catch {}
    try {
        await browser.action.setTitle({
            title: enabled ? 'PLGames Connect — подключено' : 'PLGames Connect',
        });
    } catch {}

    // Бэйдж: показываем "NEW" если есть актуальное обновление и юзер его не скрыл.
    // Подключённое состояние имеет приоритет — иначе бэйдж "NEW" перекрыл бы статус.
    try {
        const update = settings.update;
        const hasUnseenUpdate =
            update &&
            update.latestVersion &&
            update.dismissedFor !== update.latestVersion;
        if (!enabled && hasUnseenUpdate) {
            await browser.action.setBadgeText({ text: 'NEW' });
            await browser.action.setBadgeBackgroundColor({ color: '#f59e0b' });
        } else {
            await browser.action.setBadgeText({ text: '' });
        }
    } catch {}
}

// ----- helpers ---------------------------------------------------------------

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
                    if (!settings.enabled) return callback({});
                    const profile = findActive(settings);
                    if (profile && profile.username && profile.password) {
                        callback({
                            authCredentials: {
                                username: profile.username,
                                password: profile.password,
                            },
                        });
                    } else callback({});
                })
                .catch(() => callback({}));
        },
        { urls: ['<all_urls>'] },
        ['asyncBlocking'],
    );
}

// ----- alarms ----------------------------------------------------------------

const ORDER_ALARM = 'plgc-poll-order';
const ROTATE_ALARM = 'plgc-rotate-creds';
const ROTATE_PERIOD_MIN = 12 * 60; // 12 часов
const UPDATE_ALARM = 'plgc-check-update';
const UPDATE_PERIOD_MIN = 24 * 60; // раз в сутки

async function schedulePoll(periodMin = 0.5): Promise<void> {
    try {
        await browser.alarms.create(ORDER_ALARM, {
            delayInMinutes: periodMin,
            periodInMinutes: periodMin,
        });
    } catch {}
}

async function clearPoll(): Promise<void> {
    try {
        await browser.alarms.clear(ORDER_ALARM);
    } catch {}
}

async function tickPoll(): Promise<void> {
    const settings = await getSettings();
    const pending = settings.pendingOrder;
    if (!pending) return clearPoll();

    if (Date.now() > pending.expiresAt) {
        await setPendingOrder(null);
        await clearPoll();
        return;
    }

    try {
        const res = await pollOrder(pending.id);
        if (res.status === 'paid' && res.account && res.profile) {
            await setAccount(res.account);
            await upsertManagedProfile(res.profile);
            await setPendingOrder(null);
            await clearPoll();
            const next = await getSettings();
            await refreshIcon(next);
        } else if (res.status === 'expired' || res.status === 'cancelled') {
            await setPendingOrder(null);
            await clearPoll();
        }
    } catch {
        // сетевые ошибки — будем пробовать снова на следующем тике
    }
}

async function scheduleRotation(): Promise<void> {
    try {
        await browser.alarms.create(ROTATE_ALARM, {
            delayInMinutes: ROTATE_PERIOD_MIN,
            periodInMinutes: ROTATE_PERIOD_MIN,
        });
    } catch {}
}

async function clearRotation(): Promise<void> {
    try {
        await browser.alarms.clear(ROTATE_ALARM);
    } catch {}
}

async function tickRotate(): Promise<void> {
    const settings = await getSettings();
    const acc = settings.account;
    if (!acc || acc.subscribedUntil < Date.now()) {
        await clearRotation();
        return;
    }
    try {
        const profile = await rotateProfile(acc);
        await upsertManagedProfile(profile);
        // если активный профиль был managed — заново применим прокси с новыми кредами
        const next = await getSettings();
        const active = next.activeProfileId
            ? next.profiles.find((p) => p.id === next.activeProfileId)
            : null;
        if (next.enabled && active && active.source === 'managed') {
            await applyProxy(next);
        }
    } catch {
        // оставим текущие — попробуем ещё раз через 12 часов
    }
}

// ----- update notifier (раз в сутки проверяем GitHub Releases) ---------------

async function scheduleUpdateCheck(): Promise<void> {
    try {
        await browser.alarms.create(UPDATE_ALARM, {
            delayInMinutes: 1,                    // первая проверка через минуту после старта
            periodInMinutes: UPDATE_PERIOD_MIN,
        });
    } catch {}
}

async function tickUpdateCheck(): Promise<void> {
    try {
        const info = await checkForUpdate();
        if (info) {
            const next = await setUpdateInfo(info);
            await refreshIcon(next);
        } else {
            // нет апдейта — чистим прошлую запись если была
            const settings = await getSettings();
            if (settings.update && settings.update.latestVersion === info) {
                // unreachable но оставлено для ясности
            } else if (settings.update) {
                const cur = (browser.runtime.getManifest() as any).version;
                if (settings.update.latestVersion === cur) {
                    await setUpdateInfo(null);
                    const refreshed = await getSettings();
                    await refreshIcon(refreshed);
                }
            }
        }
    } catch {
        /* ignore */
    }
}

if (typeof browser.alarms !== 'undefined') {
    browser.alarms.onAlarm.addListener(async (alarm) => {
        if (alarm.name === ORDER_ALARM) await tickPoll();
        else if (alarm.name === ROTATE_ALARM) await tickRotate();
        else if (alarm.name === UPDATE_ALARM) await tickUpdateCheck();
    });
}

// ----- message handlers ------------------------------------------------------

browser.runtime.onMessage.addListener(async (message: any) => {
    switch (message?.type) {
        case 'getSettings':
            return await getSettings();

        case 'upsertProfile':
            return await upsertProfile(message.profile as ProxyProfile);

        case 'removeProfile': {
            const settings = await removeProfile(message.id as string);
            await applyProxy(settings);
            await refreshIcon(settings);
            return settings;
        }

        case 'activate': {
            const settings = await getSettings();
            if (!settings.profiles.some((p) => p.id === message.id)) {
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

        case 'getStatus':
            return { status: await getProxyStatus() };

        // ----- managed (PLGames Pro) ---------------------------------------

        case 'fetchTiers': {
            try {
                const tiers = await fetchTiers();
                return { ok: true, tiers };
            } catch (e) {
                return { ok: false, error: (e as Error).message };
            }
        }

        case 'createPurchase': {
            try {
                const { pending, paymentUrl } = await createOrder(message.tier as string);
                await setPendingOrder(pending);
                await schedulePoll(0.5);
                await scheduleRotation();
                if ((chrome as any)?.tabs?.create) {
                    (chrome as any).tabs.create({ url: paymentUrl });
                }
                const settings = await getSettings();
                return { ok: true, settings, paymentUrl };
            } catch (e) {
                return { ok: false, error: (e as Error).message };
            }
        }

        case 'cancelPurchase': {
            await setPendingOrder(null);
            await clearPoll();
            const settings = await getSettings();
            return { ok: true, settings };
        }

        case 'pollNow': {
            await tickPoll();
            const settings = await getSettings();
            return { ok: true, settings };
        }

        case 'managedRefresh': {
            const settings = await getSettings();
            if (!settings.account) return { ok: false, error: 'no account' };
            try {
                const acc = await refreshAccount(settings.account);
                const next = await setAccount(acc);
                return { ok: true, settings: next };
            } catch (e) {
                return { ok: false, error: (e as Error).message };
            }
        }

        case 'managedLogout': {
            const settings = await getSettings();
            if (settings.account) {
                try {
                    await apiLogout(settings.account);
                } catch {}
            }
            const next = await setAccount(null);
            await applyProxy(next);
            await refreshIcon(next);
            await clearRotation();
            return { ok: true, settings: next };
        }

        case 'rotateNow': {
            await tickRotate();
            const settings = await getSettings();
            return { ok: true, settings };
        }

        case 'checkUpdateNow': {
            await tickUpdateCheck();
            const settings = await getSettings();
            return { ok: true, settings };
        }

        case 'dismissUpdate': {
            const settings = await getSettings();
            const v = settings.update?.latestVersion;
            if (v) {
                const next = await dismissUpdate(v);
                await refreshIcon(next);
                return { ok: true, settings: next };
            }
            return { ok: true, settings };
        }

        default:
            return undefined;
    }
});

browser.runtime.onInstalled.addListener(() => {
    void syncFromStorage();
    void scheduleUpdateCheck();
    // первая проверка сразу после установки/обновления
    void tickUpdateCheck();
});

browser.runtime.onStartup.addListener(() => {
    void syncFromStorage().then(async (s) => {
        if (s.pendingOrder) await schedulePoll(0.5);
        if (s.account && s.account.subscribedUntil > Date.now()) await scheduleRotation();
        await scheduleUpdateCheck();
    });
});

void syncFromStorage().then(async (s) => {
    if (s.pendingOrder) await schedulePoll(0.5);
    if (s.account && s.account.subscribedUntil > Date.now()) await scheduleRotation();
    await scheduleUpdateCheck();
});

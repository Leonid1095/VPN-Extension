import { browser } from 'webextension-polyfill-ts';
import {
    AppSettings,
    DEFAULT_SETTINGS,
    ManagedAccount,
    PendingOrder,
    ProxyProfile,
    UpdateInfo,
} from './types';

const KEY = 'appSettings';
const INSTALLATION_KEY = 'installationId';

function mergeBypassList(stored: string[] | undefined): string[] {
    const base = stored && stored.length ? [...stored] : [];
    for (const required of DEFAULT_SETTINGS.bypassList) {
        if (!base.includes(required)) base.push(required);
    }
    return base.length ? base : [...DEFAULT_SETTINGS.bypassList];
}

/**
 * Стабильный per-installation идентификатор для привязки подписки к одному
 * устройству. Генерируется один раз при первом запросе, persist в local storage.
 * Бэкенд при первом /api/profile запоминает его и отклоняет последующие
 * запросы с другим installationId.
 */
export async function getInstallationId(): Promise<string> {
    const result = await browser.storage.local.get(INSTALLATION_KEY);
    let id = (result[INSTALLATION_KEY] || '') as string;
    if (!id || typeof id !== 'string' || id.length < 16) {
        // 16 байт = 128 бит энтропии, urlsafe base64 ~22 символа
        const bytes = new Uint8Array(16);
        (globalThis.crypto || (globalThis as any).msCrypto).getRandomValues(bytes);
        id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        await browser.storage.local.set({ [INSTALLATION_KEY]: id });
    }
    return id;
}

export async function getSettings(): Promise<AppSettings> {
    const result = await browser.storage.local.get(KEY);
    const stored = (result[KEY] || {}) as Partial<AppSettings>;
    return {
        enabled: stored.enabled ?? DEFAULT_SETTINGS.enabled,
        activeProfileId: stored.activeProfileId ?? DEFAULT_SETTINGS.activeProfileId,
        profiles: stored.profiles ?? [],
        // Миграция: если у юзера старый bypass-список без наших доменов —
        // добавляем недостающие, чтобы /api запросы расширения не уходили в
        // прокси-петлю (см. DEFAULT_BYPASS_LIST).
        bypassList: mergeBypassList(stored.bypassList),
        account: stored.account ?? null,
        pendingOrder: stored.pendingOrder ?? null,
        update: stored.update ?? null,
    };
}

export async function setUpdateInfo(update: UpdateInfo | null): Promise<AppSettings> {
    const settings = await getSettings();
    settings.update = update;
    await saveSettings(settings);
    return settings;
}

export async function dismissUpdate(version: string): Promise<AppSettings> {
    const settings = await getSettings();
    if (settings.update) {
        settings.update = { ...settings.update, dismissedFor: version };
        await saveSettings(settings);
    }
    return settings;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
    await browser.storage.local.set({ [KEY]: settings });
}

export async function upsertProfile(profile: ProxyProfile): Promise<AppSettings> {
    const settings = await getSettings();
    const idx = settings.profiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) {
        settings.profiles[idx] = profile;
    } else {
        settings.profiles.push(profile);
    }
    await saveSettings(settings);
    return settings;
}

export async function removeProfile(id: string): Promise<AppSettings> {
    const settings = await getSettings();
    settings.profiles = settings.profiles.filter((p) => p.id !== id);
    if (settings.activeProfileId === id) {
        settings.activeProfileId = null;
        settings.enabled = false;
    }
    await saveSettings(settings);
    return settings;
}

export async function setAccount(account: ManagedAccount | null): Promise<AppSettings> {
    const settings = await getSettings();
    settings.account = account;
    if (!account) {
        // logout: чистим managed-профиль
        settings.profiles = settings.profiles.filter((p) => p.source !== 'managed');
        if (
            settings.activeProfileId &&
            !settings.profiles.some((p) => p.id === settings.activeProfileId)
        ) {
            settings.activeProfileId = null;
            settings.enabled = false;
        }
    }
    await saveSettings(settings);
    return settings;
}

export async function setPendingOrder(order: PendingOrder | null): Promise<AppSettings> {
    const settings = await getSettings();
    settings.pendingOrder = order;
    await saveSettings(settings);
    return settings;
}

export async function upsertManagedProfile(profile: ProxyProfile): Promise<AppSettings> {
    const settings = await getSettings();
    settings.profiles = settings.profiles.filter((p) => p.source !== 'managed');
    settings.profiles.push(profile);
    await saveSettings(settings);
    return settings;
}

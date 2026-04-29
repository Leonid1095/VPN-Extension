import { browser } from 'webextension-polyfill-ts';
import {
    AppSettings,
    DEFAULT_SETTINGS,
    ManagedAccount,
    PendingOrder,
    ProxyProfile,
} from './types';

const KEY = 'appSettings';

export async function getSettings(): Promise<AppSettings> {
    const result = await browser.storage.local.get(KEY);
    const stored = (result[KEY] || {}) as Partial<AppSettings>;
    return {
        enabled: stored.enabled ?? DEFAULT_SETTINGS.enabled,
        activeProfileId: stored.activeProfileId ?? DEFAULT_SETTINGS.activeProfileId,
        profiles: stored.profiles ?? [],
        bypassList:
            stored.bypassList && stored.bypassList.length
                ? stored.bypassList
                : [...DEFAULT_SETTINGS.bypassList],
        account: stored.account ?? null,
        pendingOrder: stored.pendingOrder ?? null,
    };
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

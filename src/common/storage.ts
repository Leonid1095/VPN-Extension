import { browser } from 'webextension-polyfill-ts';
import { AppSettings, DEFAULT_SETTINGS, ProxyProfile } from './types';

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

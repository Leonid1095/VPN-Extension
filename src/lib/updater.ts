/**
 * Проверка наличия новой версии через GitHub Releases API.
 *
 * Расширение установлено через `Load unpacked` (вне Web Store) — Chrome не
 * умеет автообновлять такие расширения. Поэтому раз в сутки фоновый SW сам
 * ходит в GitHub, сравнивает `tag_name` последнего релиза с `manifest.version`
 * и кладёт badge + карточку в попап со ссылкой на скачивание.
 */

import { browser } from 'webextension-polyfill-ts';
import { UpdateInfo } from '../common/types';

const REPO = 'Leonid1095/VPN-Extension';
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;

interface GhRelease {
    tag_name: string;
    html_url: string;
    body?: string;
    assets?: Array<{
        name: string;
        browser_download_url: string;
    }>;
}

/** "v2.4.1" -> "2.4.1" */
function normalizeTag(tag: string): string {
    return tag.replace(/^v/i, '').trim();
}

/** Сравнение semver. Возвращает 1 / 0 / -1. */
function compareVersions(a: string, b: string): number {
    const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
    const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const da = pa[i] ?? 0;
        const db = pb[i] ?? 0;
        if (da > db) return 1;
        if (da < db) return -1;
    }
    return 0;
}

export function getCurrentVersion(): string {
    try {
        return (browser.runtime.getManifest() as any).version || '0.0.0';
    } catch {
        return '0.0.0';
    }
}

/**
 * Проверяет последний релиз GitHub. Возвращает UpdateInfo если есть НОВАЯ
 * версия, иначе null.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
    let res: Response;
    try {
        res = await fetch(RELEASES_API, {
            headers: { accept: 'application/vnd.github+json' },
        });
    } catch {
        return null; // оффлайн — попробуем в следующий тик
    }
    if (!res.ok) return null;

    const release = (await res.json()) as GhRelease;
    const latest = normalizeTag(release.tag_name);
    const current = getCurrentVersion();

    if (!latest || compareVersions(latest, current) <= 0) {
        return null;
    }

    const zipAsset =
        release.assets?.find((a) => a.name.endsWith('.zip')) || release.assets?.[0];
    const notes = (release.body || '').slice(0, 400);

    return {
        latestVersion: latest,
        currentVersion: current,
        releaseUrl: release.html_url,
        downloadUrl: zipAsset?.browser_download_url || release.html_url,
        notes,
        checkedAt: Date.now(),
    };
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { browser } from 'webextension-polyfill-ts';
import { AppSettings, ProxyProfile } from '../common/types';
import { buildProfile, parseProxyFile, parseProxyUrl } from '../common/parse';
import { BUY_URL } from '../lib/api/managed';

type Screen = 'home' | 'addByo' | 'managed';

const styles = {
    container: {
        width: '380px',
        padding: '16px',
        fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        background: '#f8f9fa',
        color: '#212529',
        boxSizing: 'border-box' as const,
    },
    header: {
        display: 'flex' as const,
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
    },
    backLink: {
        background: 'transparent',
        border: 'none',
        color: '#0d6efd',
        cursor: 'pointer',
        fontSize: '13px',
        padding: 0,
        textDecoration: 'none',
    },
    title: { margin: 0, fontSize: '16px', fontWeight: 600 },
    badge: (on: boolean) => ({
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 600,
        background: on ? '#059669' : '#6c757d',
        color: 'white',
    }),
    card: {
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '8px',
    },
    cardActive: {
        border: '1px solid #059669',
        boxShadow: '0 0 0 2px rgba(5,150,105,0.15)',
    },
    profileRow: {
        display: 'flex' as const,
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '8px',
    },
    profileMain: { flex: 1, minWidth: 0 },
    profileName: { fontWeight: 600, fontSize: '13px', wordBreak: 'break-word' as const },
    profileMeta: { fontSize: '11px', color: '#6b7280', marginTop: '2px' },
    sourceTag: (managed: boolean) => ({
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: 600,
        background: managed ? '#fef3c7' : '#dbeafe',
        color: managed ? '#92400e' : '#1e40af',
        marginRight: '6px',
        verticalAlign: 'middle',
    }),
    btnRow: { display: 'flex' as const, gap: '6px' },
    btn: {
        padding: '6px 10px',
        border: 'none',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
    },
    btnPrimary: { background: '#0d6efd', color: 'white' },
    btnSuccess: { background: '#059669', color: 'white' },
    btnDanger: { background: '#dc3545', color: 'white' },
    btnNeutral: { background: '#e5e7eb', color: '#212529' },
    btnGhost: { background: 'transparent', color: '#6b7280', padding: '4px 6px' },
    bigButton: {
        width: '100%',
        padding: '14px',
        border: 'none',
        borderRadius: '10px',
        fontWeight: 600,
        cursor: 'pointer',
        fontSize: '14px',
        marginTop: '8px',
        textAlign: 'left' as const,
        display: 'flex' as const,
        alignItems: 'center',
        gap: '12px',
    },
    bigPrimary: { background: '#0d6efd', color: 'white' },
    bigManaged: {
        background: 'linear-gradient(135deg,#10b981,#059669)',
        color: 'white',
    },
    bigEmoji: { fontSize: '22px' },
    bigText: { display: 'flex' as const, flexDirection: 'column' as const, gap: '2px' },
    bigSubtitle: { fontSize: '11px', opacity: 0.85, fontWeight: 400 },
    formCard: {
        background: 'white',
        border: '1px solid #cfd4da',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '8px',
    },
    label: {
        display: 'block',
        fontSize: '11px',
        fontWeight: 600,
        color: '#374151',
        marginBottom: '4px',
    },
    input: {
        width: '100%',
        padding: '7px 9px',
        fontSize: '13px',
        border: '1px solid #cfd4da',
        borderRadius: '6px',
        boxSizing: 'border-box' as const,
        marginBottom: '8px',
    },
    dropZone: {
        border: '2px dashed #cfd4da',
        borderRadius: '8px',
        padding: '14px',
        textAlign: 'center' as const,
        background: '#f9fafb',
        color: '#6b7280',
        fontSize: '12px',
        cursor: 'pointer',
        marginBottom: '8px',
    },
    dropZoneActive: { borderColor: '#0d6efd', background: '#eff6ff', color: '#0d6efd' },
    sep: {
        display: 'flex' as const,
        alignItems: 'center',
        gap: '8px',
        margin: '10px 0',
        color: '#9ca3af',
        fontSize: '11px',
    },
    sepLine: { flex: 1, height: '1px', background: '#e5e7eb' },
    alertErr: {
        background: '#f8d7da',
        color: '#721c24',
        border: '1px solid #f5c6cb',
        padding: '8px 10px',
        borderRadius: '6px',
        fontSize: '12px',
        marginBottom: '8px',
    },
    alertOk: {
        background: '#d1fae5',
        color: '#065f46',
        border: '1px solid #a7f3d0',
        padding: '8px 10px',
        borderRadius: '6px',
        fontSize: '12px',
        marginBottom: '8px',
    },
    sectionTitle: {
        fontSize: '12px',
        fontWeight: 600,
        color: '#6b7280',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.04em',
        margin: '12px 0 6px',
    },
    footer: {
        marginTop: '12px',
        textAlign: 'center' as const,
        fontSize: '10px',
        color: '#9ca3af',
    },
    statusBlock: {
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '8px',
        fontSize: '12px',
    },
    subscriptionActive: { color: '#065f46', fontWeight: 600 },
    subscriptionInactive: { color: '#92400e', fontWeight: 600 },
};

const App: React.FC = () => {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [screen, setScreen] = useState<Screen>('home');
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        void load();
    }, []);

    async function load() {
        try {
            const s = (await browser.runtime.sendMessage({ type: 'getSettings' })) as AppSettings;
            setSettings(s);
        } catch {
            setError('Не удалось загрузить настройки');
        }
    }

    function flash(msg: string, isError = false) {
        if (isError) {
            setError(msg);
            setInfo(null);
            setTimeout(() => setError(null), 3000);
        } else {
            setInfo(msg);
            setError(null);
            setTimeout(() => setInfo(null), 1800);
        }
    }

    const active: ProxyProfile | null = useMemo(() => {
        if (!settings || !settings.activeProfileId) return null;
        return settings.profiles.find((p) => p.id === settings.activeProfileId) ?? null;
    }, [settings]);

    async function activate(id: string) {
        try {
            setBusy(true);
            const s = (await browser.runtime.sendMessage({ type: 'activate', id })) as AppSettings;
            setSettings(s);
            flash('Прокси включён');
        } catch (e) {
            flash(`Ошибка: ${(e as Error).message}`, true);
        } finally {
            setBusy(false);
        }
    }

    async function deactivate() {
        try {
            setBusy(true);
            const s = (await browser.runtime.sendMessage({ type: 'deactivate' })) as AppSettings;
            setSettings(s);
            flash('Прокси отключён');
        } catch (e) {
            flash(`Ошибка: ${(e as Error).message}`, true);
        } finally {
            setBusy(false);
        }
    }

    async function remove(id: string) {
        try {
            setBusy(true);
            const s = (await browser.runtime.sendMessage({
                type: 'removeProfile',
                id,
            })) as AppSettings;
            setSettings(s);
            flash('Профиль удалён');
        } catch (e) {
            flash(`Ошибка: ${(e as Error).message}`, true);
        } finally {
            setBusy(false);
        }
    }

    if (!settings) {
        return <div style={styles.container}>Загрузка…</div>;
    }

    const enabled = settings.enabled && active !== null;

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                {screen !== 'home' ? (
                    <button
                        style={styles.backLink}
                        onClick={() => {
                            setScreen('home');
                            setError(null);
                        }}
                    >
                        ← Назад
                    </button>
                ) : (
                    <h1 style={styles.title}>Web Proxy Manager</h1>
                )}
                <div style={styles.badge(enabled)}>{enabled ? 'ON' : 'OFF'}</div>
            </div>

            {error && <div style={styles.alertErr}>{error}</div>}
            {info && <div style={styles.alertOk}>{info}</div>}

            {screen === 'home' && (
                <HomeScreen
                    settings={settings}
                    busy={busy}
                    active={active}
                    onActivate={activate}
                    onDeactivate={deactivate}
                    onRemove={remove}
                    onAddByo={() => setScreen('addByo')}
                    onManaged={() => setScreen('managed')}
                />
            )}

            {screen === 'addByo' && (
                <AddByoScreen
                    onSaved={(s) => {
                        setSettings(s);
                        setScreen('home');
                        flash('Профиль добавлен');
                    }}
                    onError={(m) => flash(m, true)}
                />
            )}

            {screen === 'managed' && (
                <ManagedScreen
                    settings={settings}
                    onChanged={(s) => setSettings(s)}
                    onError={(m) => flash(m, true)}
                    onInfo={(m) => flash(m)}
                />
            )}

            <div style={styles.footer}>
                Трафик идёт только из браузера через выбранный прокси.
            </div>
        </div>
    );
};

// ----- HOME ------------------------------------------------------------------

const HomeScreen: React.FC<{
    settings: AppSettings;
    active: ProxyProfile | null;
    busy: boolean;
    onActivate: (id: string) => void;
    onDeactivate: () => void;
    onRemove: (id: string) => void;
    onAddByo: () => void;
    onManaged: () => void;
}> = ({ settings, active, busy, onActivate, onDeactivate, onRemove, onAddByo, onManaged }) => {
    const account = settings.account;
    const subscriptionActive =
        account && account.subscribedUntil && account.subscribedUntil > Date.now();

    return (
        <>
            {active && (
                <div style={{ ...styles.card, ...styles.cardActive }}>
                    <div style={styles.profileRow}>
                        <div style={styles.profileMain}>
                            <div style={styles.profileName}>
                                <span style={styles.sourceTag(active.source === 'managed')}>
                                    {active.source === 'managed' ? 'наш' : 'свой'}
                                </span>
                                {active.name}
                            </div>
                            <div style={styles.profileMeta}>
                                {active.scheme}://{active.host}:{active.port}
                                {active.username ? ` • ${active.username}` : ''}
                            </div>
                        </div>
                        <button
                            disabled={busy}
                            style={{ ...styles.btn, ...styles.btnDanger }}
                            onClick={onDeactivate}
                        >
                            Выкл
                        </button>
                    </div>
                </div>
            )}

            {settings.profiles.length > 0 && (
                <>
                    <div style={styles.sectionTitle}>Профили</div>
                    {settings.profiles.map((p) => {
                        const isActive =
                            settings.enabled && settings.activeProfileId === p.id;
                        return (
                            <div
                                key={p.id}
                                style={{
                                    ...styles.card,
                                    ...(isActive ? styles.cardActive : {}),
                                }}
                            >
                                <div style={styles.profileRow}>
                                    <div style={styles.profileMain}>
                                        <div style={styles.profileName}>
                                            <span
                                                style={styles.sourceTag(p.source === 'managed')}
                                            >
                                                {p.source === 'managed' ? 'наш' : 'свой'}
                                            </span>
                                            {p.name}
                                        </div>
                                        <div style={styles.profileMeta}>
                                            {p.scheme}://{p.host}:{p.port}
                                            {p.username ? ` • ${p.username}` : ''}
                                        </div>
                                    </div>
                                    <div style={styles.btnRow}>
                                        {!isActive && (
                                            <button
                                                disabled={busy}
                                                style={{
                                                    ...styles.btn,
                                                    ...styles.btnSuccess,
                                                }}
                                                onClick={() => onActivate(p.id)}
                                            >
                                                Вкл
                                            </button>
                                        )}
                                        {p.source === 'byo' && (
                                            <button
                                                disabled={busy}
                                                style={{ ...styles.btn, ...styles.btnGhost }}
                                                onClick={() => onRemove(p.id)}
                                                title="Удалить"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </>
            )}

            <div style={styles.sectionTitle}>Добавить</div>

            <button style={{ ...styles.bigButton, ...styles.bigPrimary }} onClick={onAddByo}>
                <span style={styles.bigEmoji}>🔧</span>
                <span style={styles.bigText}>
                    Свой сервер
                    <span style={styles.bigSubtitle}>
                        вставь ссылку или брось файл с конфигом
                    </span>
                </span>
            </button>

            <button style={{ ...styles.bigButton, ...styles.bigManaged }} onClick={onManaged}>
                <span style={styles.bigEmoji}>★</span>
                <span style={styles.bigText}>
                    Использовать наш VPN
                    {subscriptionActive ? (
                        <span style={styles.bigSubtitle}>
                            активная подписка • {account!.email}
                        </span>
                    ) : account ? (
                        <span style={styles.bigSubtitle}>
                            войдено как {account.email} • подписки нет
                        </span>
                    ) : (
                        <span style={styles.bigSubtitle}>войти или купить подписку</span>
                    )}
                </span>
            </button>
        </>
    );
};

// ----- BYO -------------------------------------------------------------------

const AddByoScreen: React.FC<{
    onSaved: (s: AppSettings) => void;
    onError: (m: string) => void;
}> = ({ onSaved, onError }) => {
    const [url, setUrl] = useState('');
    const [name, setName] = useState('');
    const [drag, setDrag] = useState(false);
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    async function saveFromUrl() {
        if (!url.trim()) return onError('Вставь ссылку прокси');
        try {
            setBusy(true);
            const parsed = parseProxyUrl(url);
            const profile = buildProfile(parsed, 'byo', name.trim() || `${parsed.scheme}://${parsed.host}`);
            const s = (await browser.runtime.sendMessage({
                type: 'upsertProfile',
                profile,
            })) as AppSettings;
            onSaved(s);
        } catch (e) {
            onError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }

    async function handleFiles(files: FileList | null) {
        if (!files || !files.length) return;
        try {
            setBusy(true);
            const text = await files[0].text();
            const parsedList = parseProxyFile(text);
            // массово сохраняем
            let lastSettings: AppSettings | null = null;
            for (const parsed of parsedList) {
                const profile = buildProfile(
                    parsed,
                    'byo',
                    parsed.name || name.trim() || `${parsed.scheme}://${parsed.host}`,
                );
                lastSettings = (await browser.runtime.sendMessage({
                    type: 'upsertProfile',
                    profile,
                })) as AppSettings;
            }
            if (lastSettings) onSaved(lastSettings);
        } catch (e) {
            onError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div style={styles.formCard}>
            <label style={styles.label}>Название (необязательно)</label>
            <input
                style={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: домашний сервер"
            />

            <label style={styles.label}>Ссылка прокси</label>
            <input
                style={styles.input}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://user:pass@example.com:443"
                autoFocus
            />
            <button
                style={{ ...styles.btn, ...styles.btnPrimary, width: '100%' }}
                disabled={busy}
                onClick={saveFromUrl}
            >
                Добавить
            </button>

            <div style={styles.sep}>
                <span style={styles.sepLine} />
                <span>или</span>
                <span style={styles.sepLine} />
            </div>

            <div
                style={{ ...styles.dropZone, ...(drag ? styles.dropZoneActive : {}) }}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    void handleFiles(e.dataTransfer.files);
                }}
            >
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>📁</div>
                <div>Перетащи файл с конфигом или кликни</div>
                <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>
                    JSON ({'{'}scheme,host,port,username,password{'}'}) или строка ссылки
                </div>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".json,.txt,.proxy,application/json,text/plain"
                    style={{ display: 'none' }}
                    onChange={(e) => void handleFiles(e.target.files)}
                />
            </div>
        </div>
    );
};

// ----- MANAGED ---------------------------------------------------------------

const ManagedScreen: React.FC<{
    settings: AppSettings;
    onChanged: (s: AppSettings) => void;
    onError: (m: string) => void;
    onInfo: (m: string) => void;
}> = ({ settings, onChanged, onError, onInfo }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);

    const account = settings.account;
    const subscribed =
        account && account.subscribedUntil && account.subscribedUntil > Date.now();

    async function login() {
        if (!email.trim() || !password) return onError('Введи email и пароль');
        try {
            setBusy(true);
            const res = (await browser.runtime.sendMessage({
                type: 'managedLogin',
                email: email.trim(),
                password,
            })) as { ok: boolean; settings?: AppSettings; error?: string };
            if (!res.ok || !res.settings) return onError(res.error || 'Ошибка входа');
            onChanged(res.settings);
            onInfo('Вход выполнен');
        } catch (e) {
            onError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }

    async function logout() {
        try {
            setBusy(true);
            const res = (await browser.runtime.sendMessage({ type: 'managedLogout' })) as {
                ok: boolean;
                settings?: AppSettings;
            };
            if (res.settings) onChanged(res.settings);
            onInfo('Вышел из аккаунта');
        } catch (e) {
            onError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }

    async function refresh() {
        try {
            setBusy(true);
            const res = (await browser.runtime.sendMessage({ type: 'managedRefresh' })) as {
                ok: boolean;
                settings?: AppSettings;
                error?: string;
            };
            if (!res.ok) return onError(res.error || 'Ошибка обновления');
            if (res.settings) onChanged(res.settings);
            onInfo('Обновлено');
        } catch (e) {
            onError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }

    function buy() {
        // открываем страницу покупки в новой вкладке
        if ((chrome as any)?.tabs?.create) {
            (chrome as any).tabs.create({ url: BUY_URL });
        } else {
            window.open(BUY_URL, '_blank');
        }
    }

    if (!account) {
        return (
            <div style={styles.formCard}>
                <div style={{ fontSize: '13px', marginBottom: '8px' }}>
                    Войди в свой аккаунт, чтобы получить готовый профиль с нашего сервера.
                </div>
                <label style={styles.label}>Email</label>
                <input
                    style={styles.input}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoFocus
                />
                <label style={styles.label}>Пароль</label>
                <input
                    style={styles.input}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                />
                <button
                    style={{ ...styles.btn, ...styles.btnSuccess, width: '100%' }}
                    onClick={login}
                    disabled={busy}
                >
                    Войти
                </button>
                <div style={styles.sep}>
                    <span style={styles.sepLine} />
                    <span>или</span>
                    <span style={styles.sepLine} />
                </div>
                <button
                    style={{ ...styles.btn, ...styles.btnPrimary, width: '100%' }}
                    onClick={buy}
                    disabled={busy}
                >
                    Купить подписку
                </button>
            </div>
        );
    }

    return (
        <div style={styles.formCard}>
            <div style={styles.statusBlock}>
                <div style={{ marginBottom: '6px' }}>
                    <span style={{ color: '#6b7280' }}>Аккаунт: </span>
                    <strong>{account.email}</strong>
                </div>
                <div>
                    <span style={{ color: '#6b7280' }}>Подписка: </span>
                    {subscribed ? (
                        <span style={styles.subscriptionActive}>
                            активна до{' '}
                            {new Date(account.subscribedUntil!).toLocaleDateString()}
                        </span>
                    ) : (
                        <span style={styles.subscriptionInactive}>не активна</span>
                    )}
                </div>
            </div>

            {subscribed ? (
                <>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                        Профиль с нашего сервера уже добавлен в список (помечен «наш»).
                        Нажми «Вкл» рядом с ним на главном экране.
                    </div>
                    <button
                        style={{ ...styles.btn, ...styles.btnPrimary, width: '100%' }}
                        onClick={refresh}
                        disabled={busy}
                    >
                        Обновить профиль
                    </button>
                </>
            ) : (
                <button
                    style={{ ...styles.btn, ...styles.btnPrimary, width: '100%' }}
                    onClick={buy}
                    disabled={busy}
                >
                    Купить подписку
                </button>
            )}

            <button
                style={{ ...styles.btn, ...styles.btnNeutral, width: '100%', marginTop: '8px' }}
                onClick={logout}
                disabled={busy}
            >
                Выйти из аккаунта
            </button>
        </div>
    );
};

const root = document.getElementById('root');
if (root) {
    ReactDOM.render(<App />, root);
}

import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { browser } from 'webextension-polyfill-ts';
import { AppSettings, ProxyProfile, ProxyScheme } from '../common/types';
import { defaultPort, generateId, parseProxyUrl, validateProfile } from '../common/parse';

const SCHEMES: ProxyScheme[] = ['https', 'http', 'socks5', 'socks4'];

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
    title: { margin: 0, fontSize: '16px', fontWeight: 600 },
    badge: (on: boolean) => ({
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 600,
        background: on ? '#28a745' : '#6c757d',
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
        border: '1px solid #28a745',
        boxShadow: '0 0 0 2px rgba(40,167,69,0.15)',
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
    btnSuccess: { background: '#28a745', color: 'white' },
    btnDanger: { background: '#dc3545', color: 'white' },
    btnNeutral: { background: '#e5e7eb', color: '#212529' },
    btnGhost: { background: 'transparent', color: '#6b7280', padding: '4px 6px' },
    addBtn: {
        width: '100%',
        padding: '10px',
        background: '#0d6efd',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        fontWeight: 600,
        cursor: 'pointer',
        marginTop: '8px',
    },
    formCard: {
        background: 'white',
        border: '1px solid #cfd4da',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '8px',
    },
    label: { display: 'block', fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '4px' },
    input: {
        width: '100%',
        padding: '7px 9px',
        fontSize: '13px',
        border: '1px solid #cfd4da',
        borderRadius: '6px',
        boxSizing: 'border-box' as const,
        marginBottom: '8px',
    },
    select: {
        width: '100%',
        padding: '7px 9px',
        fontSize: '13px',
        border: '1px solid #cfd4da',
        borderRadius: '6px',
        boxSizing: 'border-box' as const,
        marginBottom: '8px',
        background: 'white',
    },
    row2: { display: 'grid' as const, gridTemplateColumns: '1fr 1fr', gap: '8px' },
    quickRow: { display: 'flex' as const, gap: '6px', marginBottom: '8px' },
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
        background: '#d4edda',
        color: '#155724',
        border: '1px solid #c3e6cb',
        padding: '8px 10px',
        borderRadius: '6px',
        fontSize: '12px',
        marginBottom: '8px',
    },
    empty: {
        textAlign: 'center' as const,
        padding: '18px 8px',
        color: '#6b7280',
        fontSize: '13px',
    },
    sectionTitle: {
        fontSize: '12px',
        fontWeight: 600,
        color: '#6b7280',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.04em',
        margin: '12px 0 6px',
    },
    footer: { marginTop: '12px', textAlign: 'center' as const, fontSize: '10px', color: '#9ca3af' },
};

interface FormState {
    id?: string;
    name: string;
    scheme: ProxyScheme;
    host: string;
    port: string;
    username: string;
    password: string;
    pasteUrl: string;
}

const blankForm: FormState = {
    name: '',
    scheme: 'https',
    host: '',
    port: String(defaultPort('https')),
    username: '',
    password: '',
    pasteUrl: '',
};

const App: React.FC = () => {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [editing, setEditing] = useState<FormState | null>(null);
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
        } catch (e) {
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
            flash(`Ошибка включения: ${(e as Error).message}`, true);
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
            flash(`Ошибка отключения: ${(e as Error).message}`, true);
        } finally {
            setBusy(false);
        }
    }

    async function remove(id: string) {
        try {
            setBusy(true);
            const s = (await browser.runtime.sendMessage({ type: 'removeProfile', id })) as AppSettings;
            setSettings(s);
            flash('Профиль удалён');
        } catch (e) {
            flash(`Ошибка удаления: ${(e as Error).message}`, true);
        } finally {
            setBusy(false);
        }
    }

    function startCreate() {
        setEditing({ ...blankForm });
    }

    function startEdit(p: ProxyProfile) {
        setEditing({
            id: p.id,
            name: p.name,
            scheme: p.scheme,
            host: p.host,
            port: String(p.port),
            username: p.username || '',
            password: p.password || '',
            pasteUrl: '',
        });
    }

    function cancelEdit() {
        setEditing(null);
        setError(null);
    }

    function applyPaste() {
        if (!editing) return;
        const url = editing.pasteUrl.trim();
        if (!url) {
            setError('Вставьте ссылку прокси');
            return;
        }
        try {
            const parsed = parseProxyUrl(url);
            setEditing({
                ...editing,
                scheme: parsed.scheme,
                host: parsed.host,
                port: String(parsed.port),
                username: parsed.username || '',
                password: parsed.password || '',
                name: editing.name || `${parsed.scheme}://${parsed.host}`,
                pasteUrl: '',
            });
            setError(null);
        } catch (e) {
            setError((e as Error).message);
        }
    }

    async function save() {
        if (!editing) return;
        const port = parseInt(editing.port, 10);
        const profile: ProxyProfile = {
            id: editing.id || generateId(),
            name: editing.name.trim(),
            scheme: editing.scheme,
            host: editing.host.trim(),
            port,
            username: editing.username.trim() || undefined,
            password: editing.password ? editing.password : undefined,
        };
        const errors = validateProfile(profile);
        if (errors.length) {
            setError(errors.join('. '));
            return;
        }
        try {
            setBusy(true);
            const s = (await browser.runtime.sendMessage({
                type: 'upsertProfile',
                profile,
            })) as AppSettings;
            setSettings(s);
            setEditing(null);
            flash(editing.id ? 'Профиль обновлён' : 'Профиль добавлен');
        } catch (e) {
            flash(`Ошибка сохранения: ${(e as Error).message}`, true);
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
                <h1 style={styles.title}>Web Proxy Manager</h1>
                <div style={styles.badge(enabled)}>{enabled ? 'ON' : 'OFF'}</div>
            </div>

            {error && <div style={styles.alertErr}>{error}</div>}
            {info && <div style={styles.alertOk}>{info}</div>}

            {active && (
                <div style={{ ...styles.card, ...styles.cardActive }}>
                    <div style={styles.profileRow}>
                        <div style={styles.profileMain}>
                            <div style={styles.profileName}>{active.name}</div>
                            <div style={styles.profileMeta}>
                                {active.scheme}://{active.host}:{active.port}
                                {active.username ? ` • ${active.username}` : ''}
                            </div>
                        </div>
                        <button
                            disabled={busy}
                            style={{ ...styles.btn, ...styles.btnDanger }}
                            onClick={deactivate}
                        >
                            Выкл
                        </button>
                    </div>
                </div>
            )}

            <div style={styles.sectionTitle}>Профили</div>

            {settings.profiles.length === 0 && !editing && (
                <div style={styles.card}>
                    <div style={styles.empty}>
                        Профилей нет. Добавьте свой прокси-сервер или вставьте ссылку.
                    </div>
                </div>
            )}

            {settings.profiles.map((p) => {
                const isActive = settings.enabled && settings.activeProfileId === p.id;
                return (
                    <div key={p.id} style={{ ...styles.card, ...(isActive ? styles.cardActive : {}) }}>
                        <div style={styles.profileRow}>
                            <div style={styles.profileMain}>
                                <div style={styles.profileName}>{p.name}</div>
                                <div style={styles.profileMeta}>
                                    {p.scheme}://{p.host}:{p.port}
                                    {p.username ? ` • ${p.username}` : ''}
                                </div>
                            </div>
                            <div style={styles.btnRow}>
                                {!isActive && (
                                    <button
                                        disabled={busy}
                                        style={{ ...styles.btn, ...styles.btnSuccess }}
                                        onClick={() => activate(p.id)}
                                    >
                                        Вкл
                                    </button>
                                )}
                                <button
                                    disabled={busy}
                                    style={{ ...styles.btn, ...styles.btnNeutral }}
                                    onClick={() => startEdit(p)}
                                >
                                    Изм
                                </button>
                                <button
                                    disabled={busy}
                                    style={{ ...styles.btn, ...styles.btnGhost }}
                                    onClick={() => remove(p.id)}
                                    title="Удалить"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })}

            {editing && (
                <div style={styles.formCard}>
                    <label style={styles.label}>Быстрый ввод (необязательно)</label>
                    <div style={styles.quickRow}>
                        <input
                            style={{ ...styles.input, marginBottom: 0 }}
                            value={editing.pasteUrl}
                            onChange={(e) => setEditing({ ...editing, pasteUrl: e.target.value })}
                            placeholder="https://user:pass@example.com:443"
                        />
                        <button
                            style={{ ...styles.btn, ...styles.btnPrimary }}
                            onClick={applyPaste}
                            type="button"
                        >
                            Разобрать
                        </button>
                    </div>

                    <label style={styles.label}>Название</label>
                    <input
                        style={styles.input}
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        placeholder="Мой сервер"
                    />

                    <div style={styles.row2}>
                        <div>
                            <label style={styles.label}>Схема</label>
                            <select
                                style={styles.select}
                                value={editing.scheme}
                                onChange={(e) => {
                                    const scheme = e.target.value as ProxyScheme;
                                    const portNum = parseInt(editing.port, 10);
                                    const wasDefault =
                                        Number.isFinite(portNum) &&
                                        SCHEMES.some((s) => defaultPort(s) === portNum);
                                    setEditing({
                                        ...editing,
                                        scheme,
                                        port: wasDefault ? String(defaultPort(scheme)) : editing.port,
                                    });
                                }}
                            >
                                {SCHEMES.map((s) => (
                                    <option key={s} value={s}>
                                        {s.toUpperCase()}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={styles.label}>Порт</label>
                            <input
                                style={styles.input}
                                type="number"
                                min={1}
                                max={65535}
                                value={editing.port}
                                onChange={(e) => setEditing({ ...editing, port: e.target.value })}
                            />
                        </div>
                    </div>

                    <label style={styles.label}>Хост</label>
                    <input
                        style={styles.input}
                        value={editing.host}
                        onChange={(e) => setEditing({ ...editing, host: e.target.value })}
                        placeholder="example.com или 1.2.3.4"
                    />

                    <div style={styles.row2}>
                        <div>
                            <label style={styles.label}>Логин</label>
                            <input
                                style={styles.input}
                                value={editing.username}
                                onChange={(e) =>
                                    setEditing({ ...editing, username: e.target.value })
                                }
                                placeholder="не обязательно"
                                autoComplete="off"
                            />
                        </div>
                        <div>
                            <label style={styles.label}>Пароль</label>
                            <input
                                style={styles.input}
                                type="password"
                                value={editing.password}
                                onChange={(e) =>
                                    setEditing({ ...editing, password: e.target.value })
                                }
                                placeholder="не обязательно"
                                autoComplete="new-password"
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            disabled={busy}
                            style={{ ...styles.btn, ...styles.btnPrimary, flex: 1 }}
                            onClick={save}
                        >
                            Сохранить
                        </button>
                        <button
                            disabled={busy}
                            style={{ ...styles.btn, ...styles.btnNeutral, flex: 1 }}
                            onClick={cancelEdit}
                        >
                            Отмена
                        </button>
                    </div>
                </div>
            )}

            {!editing && (
                <button style={styles.addBtn} onClick={startCreate}>
                    + Добавить профиль
                </button>
            )}

            <div style={styles.footer}>
                Трафик идёт только из браузера через выбранный прокси.
            </div>
        </div>
    );
};

const root = document.getElementById('root');
if (root) {
    ReactDOM.render(<App />, root);
}

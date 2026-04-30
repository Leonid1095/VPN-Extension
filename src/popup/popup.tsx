import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { browser } from 'webextension-polyfill-ts';
import { AppSettings, PendingOrder, ProxyProfile } from '../common/types';
import { buildProfile, parseProxyFile, parseProxyUrl } from '../common/parse';
import { Tier } from '../lib/api/managed';

type Screen = 'home' | 'addByo' | 'managed';

const PRODUCT_NAME = 'PLGames Connect';
const PRODUCT_SUBTITLE = 'Network Profile Manager';

// ============================================================================
// design tokens
// ============================================================================

const tokens = {
    color: {
        bg: '#f5f6fb',
        surface: '#ffffff',
        surfaceAlt: '#f8fafc',
        border: '#e2e8f0',
        borderStrong: '#cbd5e1',
        text: '#0f172a',
        textMuted: '#64748b',
        textSubtle: '#94a3b8',
        primary: '#4f46e5',
        primaryHover: '#4338ca',
        primarySoft: '#eef2ff',
        accent: '#10b981',
        accentSoft: '#d1fae5',
        gold: '#f59e0b',
        goldSoft: '#fef3c7',
        danger: '#dc2626',
        dangerSoft: '#fee2e2',
    },
    radius: { sm: '6px', md: '10px', lg: '14px', xl: '18px' },
    shadow: {
        sm: '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)',
        md: '0 4px 12px rgba(15,23,42,0.08)',
        lg: '0 10px 30px rgba(79,70,229,0.18)',
        ring: '0 0 0 3px rgba(79,70,229,0.18)',
    },
};

// ============================================================================
// inline SVG glyphs
// ============================================================================

const Logo: React.FC<{ size?: number }> = ({ size = 32 }) => (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden>
        <defs>
            <linearGradient id="logo-bg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#6366f1" />
                <stop offset="1" stopColor="#4338ca" />
            </linearGradient>
        </defs>
        <rect width="128" height="128" rx="28" fill="url(#logo-bg)" />
        <path
            d="M38.4 23 L38.4 105 M38.4 25.6 a30 30 0 0 1 30 30 a30 30 0 0 1 -30 30"
            stroke="#fff"
            strokeWidth="20.5"
            strokeLinecap="round"
            fill="none"
        />
        <circle cx="100" cy="100" r="14" fill="#10b981" stroke="#fff" strokeWidth="4" />
    </svg>
);

const IconShield: React.FC<{ size?: number; color?: string }> = ({
    size = 16,
    color = 'currentColor',
}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
            d="M12 2 L4 5 V11 C4 16 7.5 20.5 12 22 C16.5 20.5 20 16 20 11 V5 Z"
            stroke={color}
            strokeWidth="1.8"
            strokeLinejoin="round"
        />
        <path d="M9 12 L11 14 L15 10" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const IconPower: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 4 V12" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <path d="M7 7 a8 8 0 1 0 10 0" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
);

const IconPlus: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 5 V19 M5 12 H19" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
);

const IconStar: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path
            d="M12 3 L14.6 9.1 L21 9.7 L16.2 14 L17.7 20.3 L12 17 L6.3 20.3 L7.8 14 L3 9.7 L9.4 9.1 Z"
            fill={color}
        />
    </svg>
);

const IconArrowLeft: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M15 6 L9 12 L15 18" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const IconClose: React.FC<{ size?: number; color?: string }> = ({ size = 12, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M6 6 L18 18 M6 18 L18 6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
);

const IconUpload: React.FC<{ size?: number; color?: string }> = ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
            d="M12 16 V4 M7 9 L12 4 L17 9"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path d="M5 16 V19 a1 1 0 0 0 1 1 H18 a1 1 0 0 0 1 -1 V16" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
);

const Spinner: React.FC<{ size?: number }> = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray="14 50" fill="none">
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite"/>
        </circle>
    </svg>
);

// ============================================================================
// styles
// ============================================================================

const S = {
    container: {
        width: '380px',
        padding: '14px',
        background: tokens.color.bg,
        color: tokens.color.text,
    } as React.CSSProperties,
    headerBar: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '14px',
        gap: '10px',
    } as React.CSSProperties,
    brand: { display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 } as React.CSSProperties,
    brandTextWrap: { display: 'flex', flexDirection: 'column' as const, minWidth: 0, lineHeight: 1.15 },
    brandTitle: { fontSize: '14px', fontWeight: 700, letterSpacing: '-0.01em' } as React.CSSProperties,
    brandSubtitle: { fontSize: '11px', color: tokens.color.textMuted, marginTop: '1px' } as React.CSSProperties,
    statusPill: (on: boolean): React.CSSProperties => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.02em',
        background: on ? tokens.color.accentSoft : '#e2e8f0',
        color: on ? '#065f46' : tokens.color.textMuted,
    }),
    statusDot: (on: boolean): React.CSSProperties => ({
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        background: on ? tokens.color.accent : tokens.color.textSubtle,
    }),
    backBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        background: 'transparent',
        border: 'none',
        padding: '4px 6px',
        marginLeft: '-6px',
        color: tokens.color.primary,
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        borderRadius: tokens.radius.sm,
    } as React.CSSProperties,

    activeCard: {
        background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
        color: '#fff',
        borderRadius: tokens.radius.lg,
        padding: '14px',
        marginBottom: '14px',
        boxShadow: tokens.shadow.lg,
    } as React.CSSProperties,
    activeRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' } as React.CSSProperties,
    activeHead: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' } as React.CSSProperties,
    activeName: { fontSize: '15px', fontWeight: 700 } as React.CSSProperties,
    activeMeta: {
        fontSize: '12px',
        opacity: 0.85,
        wordBreak: 'break-word' as const,
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    } as React.CSSProperties,
    activeDisconnect: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        background: 'rgba(255,255,255,0.18)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.25)',
        borderRadius: '8px',
        padding: '6px 10px',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap' as const,
    } as React.CSSProperties,

    sectionLabel: {
        fontSize: '10.5px',
        fontWeight: 700,
        color: tokens.color.textMuted,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.08em',
        margin: '4px 0 8px',
    } as React.CSSProperties,

    profileCard: {
        background: tokens.color.surface,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.md,
        padding: '11px 12px',
        marginBottom: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
    } as React.CSSProperties,
    profileBody: { flex: 1, minWidth: 0 } as React.CSSProperties,
    profileTitleRow: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' as const },
    profileTitle: {
        fontSize: '13px',
        fontWeight: 600,
        color: tokens.color.text,
        wordBreak: 'break-word' as const,
    } as React.CSSProperties,
    profileMeta: {
        fontSize: '11px',
        color: tokens.color.textMuted,
        marginTop: '2px',
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        wordBreak: 'break-all' as const,
    } as React.CSSProperties,
    sourceTag: (variant: 'byo' | 'pro'): React.CSSProperties => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        padding: '2px 7px',
        borderRadius: '999px',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        background: variant === 'pro' ? tokens.color.goldSoft : tokens.color.primarySoft,
        color: variant === 'pro' ? '#92400e' : tokens.color.primaryHover,
    }),
    iconBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        borderRadius: '8px',
        background: 'transparent',
        border: 'none',
        color: tokens.color.textSubtle,
        cursor: 'pointer',
    } as React.CSSProperties,
    btnConnect: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '6px 11px',
        background: tokens.color.accent,
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
    } as React.CSSProperties,

    bigCardPair: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '10px',
        marginTop: '12px',
    } as React.CSSProperties,
    bigCard: (variant: 'byo' | 'pro'): React.CSSProperties => ({
        background:
            variant === 'pro'
                ? 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)'
                : tokens.color.surface,
        color: variant === 'pro' ? '#fff' : tokens.color.text,
        border: variant === 'pro' ? 'none' : `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.lg,
        padding: '14px',
        cursor: 'pointer',
        textAlign: 'left',
        boxShadow: variant === 'pro' ? '0 8px 22px rgba(234,88,12,0.25)' : tokens.shadow.sm,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        minHeight: '88px',
    }),
    bigCardTitle: {
        fontSize: '13px',
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
    } as React.CSSProperties,
    bigCardDesc: { fontSize: '11px', opacity: 0.78, lineHeight: 1.35 } as React.CSSProperties,

    formCard: {
        background: tokens.color.surface,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.lg,
        padding: '14px',
        marginBottom: '10px',
        boxShadow: tokens.shadow.sm,
    } as React.CSSProperties,
    label: {
        display: 'block',
        fontSize: '11px',
        fontWeight: 600,
        color: tokens.color.textMuted,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        marginBottom: '6px',
    } as React.CSSProperties,
    input: {
        width: '100%',
        padding: '9px 11px',
        fontSize: '13px',
        border: `1px solid ${tokens.color.borderStrong}`,
        borderRadius: '9px',
        marginBottom: '10px',
        background: '#fff',
        color: tokens.color.text,
        outline: 'none',
    } as React.CSSProperties,
    primaryWide: {
        width: '100%',
        padding: '10px 12px',
        background: tokens.color.primary,
        color: '#fff',
        border: 'none',
        borderRadius: '10px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
    } as React.CSSProperties,
    ghostWide: {
        width: '100%',
        padding: '10px 12px',
        background: tokens.color.surfaceAlt,
        color: tokens.color.text,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: '10px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
    } as React.CSSProperties,
    drop: (active: boolean): React.CSSProperties => ({
        border: `2px dashed ${active ? tokens.color.primary : tokens.color.border}`,
        background: active ? tokens.color.primarySoft : tokens.color.surfaceAlt,
        color: active ? tokens.color.primary : tokens.color.textMuted,
        borderRadius: '12px',
        padding: '16px',
        textAlign: 'center',
        cursor: 'pointer',
    }),
    sep: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        margin: '12px 0',
        color: tokens.color.textSubtle,
        fontSize: '11px',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.08em',
    } as React.CSSProperties,
    sepLine: { flex: 1, height: '1px', background: tokens.color.border } as React.CSSProperties,
    toast: (kind: 'err' | 'ok'): React.CSSProperties => ({
        background: kind === 'err' ? tokens.color.dangerSoft : tokens.color.accentSoft,
        color: kind === 'err' ? '#7f1d1d' : '#065f46',
        border: `1px solid ${kind === 'err' ? '#fecaca' : '#a7f3d0'}`,
        padding: '9px 11px',
        borderRadius: '10px',
        fontSize: '12px',
        marginBottom: '10px',
    }),
    accountCard: {
        background: tokens.color.primarySoft,
        borderRadius: tokens.radius.md,
        padding: '12px',
        marginBottom: '10px',
        border: `1px solid ${tokens.color.border}`,
    } as React.CSSProperties,
    accountRow: { display: 'flex', justifyContent: 'space-between', fontSize: '12px' } as React.CSSProperties,
    accountKey: { color: tokens.color.textMuted } as React.CSSProperties,
    footer: {
        marginTop: '14px',
        textAlign: 'center' as const,
        fontSize: '10.5px',
        color: tokens.color.textSubtle,
    } as React.CSSProperties,
    emptyCard: {
        background: tokens.color.surface,
        border: `1px dashed ${tokens.color.border}`,
        borderRadius: tokens.radius.lg,
        padding: '16px',
        marginBottom: '10px',
        textAlign: 'center' as const,
        fontSize: '12.5px',
        color: tokens.color.textMuted,
    } as React.CSSProperties,
    tierCard: (active: boolean, popular?: boolean): React.CSSProperties => ({
        position: 'relative',
        background: active ? tokens.color.primarySoft : tokens.color.surface,
        border: `1.5px solid ${active ? tokens.color.primary : tokens.color.border}`,
        borderRadius: tokens.radius.md,
        padding: '12px 14px',
        cursor: 'pointer',
        marginBottom: '8px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '10px',
        transition: 'all 120ms ease',
    }),
    tierTitle: { fontSize: '13px', fontWeight: 700, color: tokens.color.text } as React.CSSProperties,
    tierSub: { fontSize: '11px', color: tokens.color.textMuted, marginTop: '2px' } as React.CSSProperties,
    tierPrice: { fontSize: '15px', fontWeight: 700, color: tokens.color.primary } as React.CSSProperties,
    tierBadge: {
        position: 'absolute',
        top: '-8px',
        right: '12px',
        background: tokens.color.gold,
        color: '#fff',
        fontSize: '9.5px',
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: '999px',
        letterSpacing: '0.04em',
    } as React.CSSProperties,
    pendingCard: {
        background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
        border: `1px solid ${tokens.color.gold}`,
        borderRadius: tokens.radius.lg,
        padding: '14px',
        marginBottom: '10px',
    } as React.CSSProperties,
    pendingHead: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' } as React.CSSProperties,
    pendingTitle: { fontSize: '13px', fontWeight: 700, color: '#78350f' } as React.CSSProperties,
    pendingMono: {
        fontFamily: 'ui-monospace, Menlo, monospace',
        background: 'rgba(255,255,255,0.6)',
        padding: '2px 6px',
        borderRadius: '4px',
        fontSize: '11px',
    } as React.CSSProperties,
};

// ============================================================================
// app
// ============================================================================

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
            flash('Подключено');
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
            flash('Отключено');
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
        return (
            <div style={S.container}>
                <div style={{ textAlign: 'center', padding: '24px', color: tokens.color.textMuted }}>
                    Загрузка…
                </div>
            </div>
        );
    }

    const enabled = settings.enabled && active !== null;

    return (
        <div style={S.container}>
            <header style={S.headerBar}>
                {screen === 'home' ? (
                    <div style={S.brand}>
                        <Logo size={32} />
                        <div style={S.brandTextWrap}>
                            <span style={S.brandTitle}>{PRODUCT_NAME}</span>
                            <span style={S.brandSubtitle}>{PRODUCT_SUBTITLE}</span>
                        </div>
                    </div>
                ) : (
                    <button
                        style={S.backBtn}
                        onClick={() => {
                            setScreen('home');
                            setError(null);
                        }}
                    >
                        <IconArrowLeft />
                        Назад
                    </button>
                )}
                <div style={S.statusPill(enabled)}>
                    <span style={S.statusDot(enabled)} />
                    {enabled ? 'ПОДКЛЮЧЕНО' : 'ОТКЛЮЧЕНО'}
                </div>
            </header>

            {error && <div style={S.toast('err')}>{error}</div>}
            {info && <div style={S.toast('ok')}>{info}</div>}

            {screen === 'home' && (
                <HomeScreen
                    settings={settings}
                    active={active}
                    busy={busy}
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

            <div style={S.footer}>PLGames Connect · v2.4.0 · трафик только в браузере</div>
        </div>
    );
};

// ============================================================================
// HOME
// ============================================================================

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
    const subscriptionActive = account && account.subscribedUntil > Date.now();
    const otherProfiles = settings.profiles.filter((p) => p.id !== settings.activeProfileId);
    const hasAny = settings.profiles.length > 0;

    return (
        <>
            {active && (
                <div style={S.activeCard}>
                    <div style={S.activeRow}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={S.activeHead}>
                                <SourceTag source={active.source} inverted />
                                <span style={S.activeName}>{active.name}</span>
                            </div>
                            <div style={S.activeMeta}>
                                {active.scheme}://{active.host}:{active.port}
                                {active.username ? `  ·  ${active.username}` : ''}
                            </div>
                        </div>
                        <button style={S.activeDisconnect} onClick={onDeactivate} disabled={busy}>
                            <IconPower size={12} />
                            Откл
                        </button>
                    </div>
                </div>
            )}

            {hasAny && otherProfiles.length > 0 && (
                <>
                    <div style={S.sectionLabel}>Профили</div>
                    {otherProfiles.map((p) => (
                        <ProfileCard
                            key={p.id}
                            profile={p}
                            busy={busy}
                            onActivate={() => onActivate(p.id)}
                            onRemove={() => onRemove(p.id)}
                        />
                    ))}
                </>
            )}

            {!hasAny && !settings.pendingOrder && (
                <div style={S.emptyCard}>
                    Профилей пока нет.
                    <br />
                    Добавь свой сервер или подключи PLGames Pro.
                </div>
            )}

            <div style={S.bigCardPair}>
                <button style={S.bigCard('byo')} onClick={onAddByo}>
                    <span style={S.bigCardTitle}>
                        <IconPlus size={14} color={tokens.color.primary} />
                        Свой сервер
                    </span>
                    <span style={{ ...S.bigCardDesc, color: tokens.color.textMuted }}>
                        Вставь ссылку или брось файл с конфигом своего прокси/VPS.
                    </span>
                </button>

                <button style={S.bigCard('pro')} onClick={onManaged}>
                    <span style={S.bigCardTitle}>
                        <IconStar size={14} color="#fff" />
                        PLGames Pro
                    </span>
                    <span style={S.bigCardDesc}>
                        {subscriptionActive
                            ? `Активна · до ${new Date(account!.subscribedUntil).toLocaleDateString()}`
                            : settings.pendingOrder
                            ? 'Ожидаем оплату…'
                            : 'Купить подписку — один клик'}
                    </span>
                </button>
            </div>
        </>
    );
};

const ProfileCard: React.FC<{
    profile: ProxyProfile;
    busy: boolean;
    onActivate: () => void;
    onRemove: () => void;
}> = ({ profile, busy, onActivate, onRemove }) => (
    <div style={S.profileCard}>
        <div style={S.profileBody}>
            <div style={S.profileTitleRow}>
                <SourceTag source={profile.source} />
                <span style={S.profileTitle}>{profile.name}</span>
            </div>
            <div style={S.profileMeta}>
                {profile.scheme}://{profile.host}:{profile.port}
                {profile.username ? `  ·  ${profile.username}` : ''}
            </div>
        </div>
        <button style={S.btnConnect} onClick={onActivate} disabled={busy} title="Подключить">
            <IconPower size={12} color="#fff" />
            Вкл
        </button>
        {profile.source === 'byo' && (
            <button style={S.iconBtn} onClick={onRemove} title="Удалить">
                <IconClose size={14} />
            </button>
        )}
    </div>
);

const SourceTag: React.FC<{ source: 'byo' | 'managed'; inverted?: boolean }> = ({ source, inverted }) => {
    if (source === 'managed') {
        return (
            <span
                style={{
                    ...S.sourceTag('pro'),
                    ...(inverted ? { background: 'rgba(255,255,255,0.22)', color: '#fff' } : {}),
                }}
            >
                <IconStar size={10} color={inverted ? '#fff' : '#92400e'} />
                PRO
            </span>
        );
    }
    return (
        <span
            style={{
                ...S.sourceTag('byo'),
                ...(inverted ? { background: 'rgba(255,255,255,0.22)', color: '#fff' } : {}),
            }}
        >
            <IconShield size={10} color={inverted ? '#fff' : tokens.color.primaryHover} />
            BYO
        </span>
    );
};

// ============================================================================
// BYO
// ============================================================================

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
            const profile = buildProfile(
                parsed,
                'byo',
                name.trim() || `${parsed.scheme}://${parsed.host}`,
            );
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
        <div style={S.formCard}>
            <label style={S.label}>Название (необязательно)</label>
            <input
                style={S.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: домашний сервер"
            />
            <label style={S.label}>Ссылка прокси</label>
            <input
                style={S.input}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://user:pass@example.com:443"
                autoFocus
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
            />
            <button style={S.primaryWide} disabled={busy} onClick={saveFromUrl}>
                Добавить профиль
            </button>
            <div style={S.sep}>
                <span style={S.sepLine} />
                или
                <span style={S.sepLine} />
            </div>
            <div
                style={S.drop(drag)}
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
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>
                    <IconUpload size={22} color={drag ? tokens.color.primary : tokens.color.textSubtle} />
                </div>
                <div style={{ fontSize: '12.5px', fontWeight: 600 }}>Перетащи файл с конфигом</div>
                <div style={{ fontSize: '10.5px', marginTop: '4px', color: tokens.color.textSubtle }}>
                    JSON ({'{'}scheme, host, port, username, password{'}'}) или ссылка
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

// ============================================================================
// MANAGED — autonomous purchase flow
// ============================================================================

const ManagedScreen: React.FC<{
    settings: AppSettings;
    onChanged: (s: AppSettings) => void;
    onError: (m: string) => void;
    onInfo: (m: string) => void;
}> = ({ settings, onChanged, onError, onInfo }) => {
    const [tiers, setTiers] = useState<Tier[] | null>(null);
    const [pickedTier, setPickedTier] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const account = settings.account;
    const subscribed = account && account.subscribedUntil > Date.now();
    const pending = settings.pendingOrder;

    // Загружаем тарифы один раз
    useEffect(() => {
        if (tiers) return;
        void (async () => {
            try {
                const res = (await browser.runtime.sendMessage({ type: 'fetchTiers' })) as {
                    ok: boolean;
                    tiers?: Tier[];
                    error?: string;
                };
                if (res.ok && res.tiers) {
                    setTiers(res.tiers);
                    const middle = res.tiers[Math.floor(res.tiers.length / 2)];
                    if (middle) setPickedTier(middle.key);
                } else {
                    onError(res.error || 'Не удалось загрузить тарифы');
                }
            } catch (e) {
                onError((e as Error).message);
            }
        })();
    }, [tiers, onError]);

    // Polling: пока есть pending — раз в 3 сек дёргаем background
    useEffect(() => {
        if (!pending) return;
        const tick = async () => {
            try {
                const res = (await browser.runtime.sendMessage({ type: 'pollNow' })) as {
                    ok: boolean;
                    settings?: AppSettings;
                };
                if (res.ok && res.settings) onChanged(res.settings);
            } catch {
                /* ignore */
            }
        };
        const t = setInterval(tick, 3000);
        return () => clearInterval(t);
    }, [pending, onChanged]);

    async function buy(tierKey: string) {
        try {
            setBusy(true);
            const res = (await browser.runtime.sendMessage({
                type: 'createPurchase',
                tier: tierKey,
            })) as { ok: boolean; settings?: AppSettings; error?: string; paymentUrl?: string };
            if (!res.ok || !res.settings) return onError(res.error || 'Не удалось создать заказ');
            onChanged(res.settings);
            onInfo('Открыли страницу оплаты');
        } catch (e) {
            onError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }

    async function cancelPurchase() {
        try {
            setBusy(true);
            const res = (await browser.runtime.sendMessage({ type: 'cancelPurchase' })) as {
                ok: boolean;
                settings?: AppSettings;
            };
            if (res.settings) onChanged(res.settings);
            onInfo('Заказ отменён');
        } catch (e) {
            onError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }

    function reopenPayment(url: string) {
        if ((chrome as any)?.tabs?.create) (chrome as any).tabs.create({ url });
        else window.open(url, '_blank');
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

    async function logoutPro() {
        try {
            setBusy(true);
            const res = (await browser.runtime.sendMessage({ type: 'managedLogout' })) as {
                ok: boolean;
                settings?: AppSettings;
            };
            if (res.settings) onChanged(res.settings);
            onInfo('Подписка отвязана');
        } catch (e) {
            onError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }

    // ----- 1) активная подписка ----------------------------------
    if (subscribed) {
        return (
            <div style={S.formCard}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <IconStar size={16} color={tokens.color.gold} />
                    <strong style={{ fontSize: '13px' }}>PLGames Pro</strong>
                </div>
                <div style={S.accountCard}>
                    <div style={{ ...S.accountRow, marginBottom: '4px' }}>
                        <span style={S.accountKey}>Тариф</span>
                        <strong>{account!.tier}</strong>
                    </div>
                    <div style={S.accountRow}>
                        <span style={S.accountKey}>Подписка</span>
                        <strong style={{ color: '#065f46' }}>
                            активна до{' '}
                            {new Date(account!.subscribedUntil).toLocaleDateString()}
                        </strong>
                    </div>
                </div>
                <div style={{ fontSize: '11.5px', color: tokens.color.textMuted, marginBottom: '10px' }}>
                    Профиль PLGames Pro добавлен в список (чип «PRO»). Включи его на главном экране.
                </div>
                <button style={S.primaryWide} onClick={refresh} disabled={busy}>
                    Обновить
                </button>
                <button style={{ ...S.ghostWide, marginTop: '8px' }} onClick={logoutPro} disabled={busy}>
                    Отвязать подписку
                </button>
            </div>
        );
    }

    // ----- 2) pending — ждём оплату ------------------------------
    if (pending) {
        const minLeft = Math.max(0, Math.ceil((pending.expiresAt - Date.now()) / 60000));
        return (
            <div>
                <div style={S.pendingCard}>
                    <div style={S.pendingHead}>
                        <Spinner size={16} />
                        <span style={S.pendingTitle}>Ожидаем оплату</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#78350f', marginBottom: '8px' }}>
                        Тариф: <b>{pending.tierLabel}</b> · {pending.amountRub} ₽
                    </div>
                    <div style={{ fontSize: '11px', color: '#92400e', marginBottom: '6px' }}>
                        Сумма уже подставлена. В комментарии должно быть:
                    </div>
                    <div style={S.pendingMono}>{pending.comment}</div>
                    <div
                        style={{
                            fontSize: '10.5px',
                            color: '#92400e',
                            marginTop: '10px',
                        }}
                    >
                        Ничего делать не нужно — как только платёж пройдёт, профиль появится автоматически.
                        <br />
                        Действителен ещё ~{minLeft} мин.
                    </div>
                </div>
                <button
                    style={S.primaryWide}
                    onClick={() => reopenPayment(pending.paymentUrl)}
                    disabled={busy}
                >
                    Открыть оплату ещё раз
                </button>
                <button style={{ ...S.ghostWide, marginTop: '8px' }} onClick={cancelPurchase} disabled={busy}>
                    Отменить
                </button>
            </div>
        );
    }

    // ----- 3) выбор тарифа --------------------------------------
    return (
        <div style={S.formCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <IconStar size={16} color={tokens.color.gold} />
                <strong style={{ fontSize: '13px' }}>PLGames Pro</strong>
            </div>
            <div
                style={{
                    fontSize: '12px',
                    color: tokens.color.textMuted,
                    marginBottom: '12px',
                    lineHeight: 1.45,
                }}
            >
                Готовый профиль с нашего сервера. Выбери срок — оплата через DonatePay в один клик.
                Профиль активируется автоматически после оплаты.
            </div>

            {tiers === null && (
                <div style={{ textAlign: 'center', padding: '12px', color: tokens.color.textMuted }}>
                    <Spinner size={18} />
                    <div style={{ fontSize: '11px', marginTop: '4px' }}>Загружаем тарифы…</div>
                </div>
            )}

            {tiers?.map((t, i) => {
                const popular = i === Math.floor(tiers.length / 2);
                const active = pickedTier === t.key;
                return (
                    <div
                        key={t.key}
                        style={S.tierCard(active, popular)}
                        onClick={() => setPickedTier(t.key)}
                    >
                        {popular && <span style={S.tierBadge}>POPULAR</span>}
                        <div style={{ flex: 1 }}>
                            <div style={S.tierTitle}>{t.label}</div>
                            <div style={S.tierSub}>
                                ≈ {(t.amountRub / t.durationDays).toFixed(1)} ₽ / день
                            </div>
                        </div>
                        <div style={S.tierPrice}>{t.amountRub} ₽</div>
                    </div>
                );
            })}

            {tiers && tiers.length > 0 && (
                <button
                    style={{
                        ...S.primaryWide,
                        background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
                        marginTop: '6px',
                    }}
                    onClick={() => pickedTier && void buy(pickedTier)}
                    disabled={busy || !pickedTier}
                >
                    Перейти к оплате
                </button>
            )}

            {tiers && tiers.length === 0 && (
                <div style={{ ...S.toast('err'), marginTop: '8px' }}>
                    Тарифов нет. Проверь, что бэкенд PLGames Connect доступен.
                </div>
            )}
        </div>
    );
};

const root = document.getElementById('root');
if (root) {
    ReactDOM.render(<App />, root);
}

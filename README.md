# PLGames Connect

[![Release](https://img.shields.io/github/v/release/Leonid1095/VPN-Extension)](https://github.com/Leonid1095/VPN-Extension/releases)

> Network profile manager for PLGames players.
> Manage HTTPS / SOCKS proxy profiles in one click — no native dependencies, no installer, no admin rights.

## Features

- **Bring Your Own Server (BYO).** Paste a `scheme://user:pass@host:port` link
  or drop a JSON config — done.
- **PLGames Pro.** Sign in with your account, get a provisioned profile from
  our backend automatically. No setup required.
- **Manifest V3** Chrome / Edge / Brave / Yandex / Opera.
- **No native messaging, no installer, no admin rights, no .exe.**

## Install (production)

1. Download the latest `plgames-connect-vX.Y.Z.zip` from
   [Releases](https://github.com/Leonid1095/VPN-Extension/releases).
2. Unzip into any folder.
3. `chrome://extensions/` → enable **Developer mode** → **Load unpacked** → pick
   the unzipped folder.
4. Click the toolbar icon → **+ Свой сервер** or **PLGames Pro**.

## Build from source

```bash
git clone https://github.com/Leonid1095/VPN-Extension.git
cd VPN-Extension
npm install
npm run build           # produces dist/ ready for "Load unpacked"
```

Build pipeline:

1. `npm run build:icons` — pure-Node PNG encoder renders the brand monogram
   (no `sharp` / no `node-canvas` dependency).
2. `webpack --mode production` — bundles `background` and `popup` into `dist/`.

## Architecture

```
popup.tsx (React)
    │
    ├──► [getSettings, upsertProfile, activate, deactivate, ...]
    │
    └──► [managedLogin, managedRefresh, managedLogout]
                                │
                                ▼
background.ts (MV3 service worker)
    ├──► chrome.proxy.settings           (set / clear proxy)
    ├──► webRequest.onAuthRequired       (proxy basic auth, asyncBlocking)
    ├──► storage.local                   (profiles + account)
    └──► lib/api/managed.ts              (PLGames backend client — currently mocked)
```

### Managed backend contract

In `src/lib/api/managed.ts`:

| Method                            | Body / Header              | Response                          |
|-----------------------------------|----------------------------|-----------------------------------|
| `POST /api/auth/login`            | `{ email, password }`      | `{ token, account }`              |
| `POST /api/auth/logout`           | Authorization: Bearer …    | 200                               |
| `GET  /api/account`               | Authorization: Bearer …    | `{ account }`                     |
| `GET  /api/profile`               | Authorization: Bearer …    | `{ profile }`                     |

`account = { email, subscribedUntil? (unix ms) }`,
`profile = { scheme, host, port, username?, password?, name? }`.

Set `MOCK = false` and `BACKEND_URL = '...'` in that file when the API ships.

## Server side (BYO)

This extension is a **client only**. To use BYO mode you (or the user) need a
proxy server. See [`server/README.md`](server/README.md) for an isolated
NaiveProxy install script that works alongside an existing nginx + Caddy stack
without breaking it.

## Limitations

- **Browser-only traffic.** We use `chrome.proxy.settings`, which routes only
  what the browser fetches. System apps (Telegram, Discord, etc.) are not
  affected.
- **Schemes supported:** `https`, `http`, `socks5`, `socks4`. VLESS / Trojan /
  Shadowsocks **cannot** run inside an MV3 extension — they need a native
  client. This is by design.

## License

MIT — see [LICENSE](LICENSE).

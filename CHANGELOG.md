# Changelog

All notable changes to **PLGames Connect** will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.4.2] — 2026-05-02

### Fixed
- **on/off toggle bug.** После «Откл» профиль оставался в активной карточке (с
  кнопкой «Откл», уже бесполезной), а из общего списка исчезал — пользователь не
  мог нажать «Вкл» обратно. Теперь после деактивации активная карточка
  скрывается, а профиль возвращается в общий список.

### Added — Update notifier
- Расширение поставленное через «Load unpacked» не получает автообновлений от
  Chrome. Теперь раз в сутки фоновый SW сам проверяет GitHub Releases API:
  - сравнивает `tag_name` последнего релиза с `manifest.version`,
  - при наличии новой версии ставит badge `NEW` (золотой) и рисует карточку
    в попапе со ссылкой «Скачать» и «Позже»,
  - запоминает версию, для которой пользователь нажал «Позже» — повторно не
    показывает до следующего релиза.
- Новый эндпоинт background-message: `checkUpdateNow`, `dismissUpdate`.
- `src/lib/updater.ts` — pure GitHub API client с semver-сравнением.

## [2.4.1] — 2026-05-02

### Fixed
- `donatepay-webhook` preParsing-хук теперь возвращает `Readable.from(buf)` —
  fastify не зависает после чтения raw-body.
- `package-lock.json`: убрана зависимость `pino-pretty` (мешала
  production-build в Docker).

### Added
- `DONATEPAY_PAYMENT_PAGE_URL` env-переменная — позволяет указывать актуальный
  base URL платёжной страницы DonatePay (`https://new.donatepay.ru/@<username>`).
  Fallback на старый qiwi-формат если не задана.
- В попапе подсказка про точную сумму платежа (если ввести другую — backend
  отклонит как underpaid и подписка не активируется).

## [2.4.0] — 2026-04-29

### Security & ops
- **Credential rotation.** Backend rotates `basic_auth` username/password every
  24h on `GET /api/profile`; extension force-rotates via
  `POST /api/profile/rotate` from a `chrome.alarms` job every 12h. Stolen creds
  expire in at most one day. Active proxy is automatically re-applied with new
  credentials.
- **Internal API for proxy-side agents:** `GET /api/internal/server/:id/users`
  and `POST /api/internal/admin/revoke`, both gated by `X-Internal-Token`.
- **Proxy-side sync agent** (`agent/`): pure Bash + curl + jq, deployed via
  systemd timer, polls the internal API every 30s and rewrites the
  `basic_auth` block in the NaiveProxy Caddyfile between
  `# >>> PLGAMES_USERS_BEGIN` / `# <<< PLGAMES_USERS_END` markers, then issues
  `caddy reload`.
- **`SECURITY.md`** added: threat model, what is vs. isn't protected, ops
  checklist before going production.

### Pricing
- Tiers updated to 159 / 299 / 699 ₽ (was 199 / 499 / 1499).

### Migration notes
- Backend SQLite gains `creds_rotated_at` column (auto-migrated on startup).
- Backend `.env` adds optional `INTERNAL_API_TOKEN`. If empty — internal API is
  disabled (development).

## [2.3.0] — 2026-04-29

### Added — Pro flow становится автономным
- **Backend** (`backend/`): Node 20 + Fastify + better-sqlite3 + Docker. 4 эндпоинта
  (`/api/tiers`, `/api/orders`, `/api/orders/:id`, `/api/account`, `/api/profile`)
  плюс webhook `/api/donatepay/webhook`.
- **DonatePay интеграция**: builder ссылок на оплату с автозаполненным comment
  (`PLGC-<orderId>`), нормализатор payload-формата, проверка HMAC-подписи webhook.
- **Прокси-пул**: `data/proxy-pool.json` — конфиг серверов; `lib/proxy-pool.js` —
  least-loaded выбор + генерация уникальных basic_auth кредов на заказ.
- **Расширение**:
  - типы `PendingOrder` + `ManagedAccount` (теперь без email — авторизация по
    Bearer-токену, выданному после фиксации оплаты).
  - API-клиент: `fetchTiers`, `createOrder`, `pollOrder`, `fetchProfile`, `refreshAccount`.
  - background SW: `chrome.alarms`-watcher, который polling-ом проверяет статус
    pending-заказа, переживает рестарты SW. Permission `alarms` добавлен в манифест.
  - popup: ManagedScreen перерисован под три состояния — выбор тарифа, ожидание
    оплаты с обратным отсчётом и комментарием, активная подписка.
  - webpack `DefinePlugin` пробрасывает `PLGAMES_API_URL` из env при сборке.
- **Landing** (`landing/`): статическая страница `/thanks` для DonatePay
  `success_url` — поясняет, что профиль активируется автоматически.
- **Документация**: `backend/README.md` с инструкциями по DonatePay и nginx,
  `landing/README.md` с вариантами хостинга.

### Changed
- Manifest version 2.2.0 → 2.3.0; добавлен permission `alarms`.
- Удалены email/password поля из managed-flow — пользователь больше ничего не вводит.

## [2.2.0] — 2026-04-28

### Branding
- Renamed product to **PLGames Connect — Network Profile Manager**.
- New logo: white "P" monogram on indigo gradient with emerald online dot.
- Brand palette: indigo primary, emerald accent, gold for Pro tier.
- README rewritten under brand with hero banner + 3 screenshot mockups.

### UI
- Premium popup redesign:
  - Brand header (logo + name + status pill).
  - Featured active-profile card with gradient + monospace URL.
  - Profile cards with `BYO` / `PRO` chips.
  - Two CTA cards on bottom: «Свой сервер» and «PLGames Pro».
  - All emoji replaced with inline SVG glyphs (sharp at any DPI).
  - Coherent design tokens (color, radius, shadow).
- Toolbar icon now drawn live via `OffscreenCanvas` — switches colour with state.

### Repository
- Added GitHub Actions CI (build + attach zip on tag).
- Added Issue / PR templates.
- Added CHANGELOG.

## [2.1.0] — 2026-04-28

### Added
- **Multi-screen popup**: Home / AddBYO / Managed.
- **PLGames Pro flow**: login form, subscription status, "buy" CTA, automatic
  provisioned-profile sync from backend.
- **File import** for BYO profiles (`.json` single or array, `.txt` URL).
- Profile schema gains `source: 'byo' | 'managed'` flag with chips in UI.
- Real shield icons (4 sizes) generated by `tools/build-icons.js` —
  pure-Node PNG encoder, no dependencies.
- Live icon rendering in service worker via `OffscreenCanvas`.

### Changed
- Bumped Manifest permissions: `tabs` (open Pro buy page in new tab).

## [2.0.0] — 2026-04-26

### Added
- Browser-only HTTPS / SOCKS proxy client (full rewrite).
- `chrome.proxy.settings` based connector.
- `webRequest.onAuthRequired` (asyncBlocking) — auto-auth for proxies with
  basic auth.
- BYO profiles (single URL field).
- `server/install-naive-isolated.sh` — isolated NaiveProxy install for VPS
  alongside an existing Caddy / nginx stack (does not touch system bins,
  uses existing certbot certs via ACL).

### Removed
- All native messaging / installer / VLESS / Zapret legacy code.
- Stale documentation (~22 markdown / txt files).
- 138-byte placeholder PNG icons.

### Security
- Removed embedded `ghp_*` token from `.git/config`.
- Stripped real domain / IP placeholders from `server/` documentation.
- Hardened `.gitignore` to exclude `*.env`, `*.pem`, `*.key`, build zips.

## [1.x] — pre-2026-04-26

Legacy "VPN Browser Extension" with VLESS + Zapret + native messaging host
support. Required a Windows installer with admin rights and external Xray
binary. Replaced wholesale by 2.0.0.

<div align="center">

<img src="docs/assets/hero.svg" alt="PLGames Connect — Network Profile Manager" width="100%"/>

# PLGames Connect

**Network profile manager for browsers.** Bring your own server or use ours.

[![Release](https://img.shields.io/github/v/release/Leonid1095/VPN-Extension?style=flat-square&color=4f46e5)](https://github.com/Leonid1095/VPN-Extension/releases/latest)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4f46e5?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License](https://img.shields.io/github/license/Leonid1095/VPN-Extension?style=flat-square&color=10b981)](LICENSE)
[![Stars](https://img.shields.io/github/stars/Leonid1095/VPN-Extension?style=flat-square&color=f59e0b)](https://github.com/Leonid1095/VPN-Extension/stargazers)

[Скачать релиз](https://github.com/Leonid1095/VPN-Extension/releases/latest) ·
[Установка](#установка) ·
[Архитектура](#архитектура) ·
[Свой сервер](#свой-сервер) ·
[FAQ](#faq)

</div>

---

## Что это

**PLGames Connect** — лёгкое браузерное расширение, которое управляет HTTPS / SOCKS-прокси-профилями. Никаких нативных зависимостей, инсталлеров и прав администратора: ставится одним кликом из Chrome Web Store или ZIP-архива.

Два режима:

- 🛡 **BYO (Bring Your Own).** Вставь ссылку `scheme://user:pass@host:port` или брось файл с конфигом — профиль готов.
- ★ **PLGames Pro.** Войди в аккаунт — расширение само получит выделенный профиль с наших серверов.

---

## Скриншоты

<table>
<tr>
<td align="center" width="33%">
<img src="docs/assets/screenshot-home.svg" alt="Главный экран" width="100%"/>
<br/><sub><b>Главный экран</b><br/>активный профиль + список</sub>
</td>
<td align="center" width="33%">
<img src="docs/assets/screenshot-byo.svg" alt="Свой сервер" width="100%"/>
<br/><sub><b>Свой сервер</b><br/>ссылка или файл</sub>
</td>
<td align="center" width="33%">
<img src="docs/assets/screenshot-pro.svg" alt="PLGames Pro" width="100%"/>
<br/><sub><b>PLGames Pro</b><br/>аккаунт и подписка</sub>
</td>
</tr>
</table>

---

## Возможности

| | |
|---|---|
| ⚡ **Manifest V3** | Современный API, готово к Chrome Web Store |
| 🛡 **Без нативных зависимостей** | Только `chrome.proxy.settings` + `webRequest` |
| 🔑 **Auto-auth прокси** | `webRequest.onAuthRequired` (asyncBlocking) — креды подставляются автоматически |
| 📦 **Несколько профилей** | Список + переключатель + быстрый ввод |
| 🌈 **Динамическая иконка** | Меняет цвет когда подключено / отключено |
| 🎨 **Premium UI** | Брендовый дизайн, inline SVG, без сторонних UI-библиотек |
| 🌐 **Любые схемы** | HTTPS, HTTP, SOCKS5, SOCKS4 |
| ✈️ **Импорт файлом** | JSON конфиг (один или массив профилей) или plain-text URL |

---

## Установка

### Из релиза (рекомендуемый способ)

1. Скачай последний `plgames-connect-vX.Y.Z.zip` со страницы [Releases](https://github.com/Leonid1095/VPN-Extension/releases/latest).
2. Распакуй в любую папку.
3. Открой `chrome://extensions/`.
4. Включи **«Режим разработчика»** (Developer mode) в правом верхнем углу.
5. Нажми **«Загрузить распакованное»** (Load unpacked) → выбери распакованную папку.
6. Иконка появится в тулбаре. Готово.

> Совместимо с Chrome / Edge / Brave / Yandex / Opera (Manifest V3).

### Из исходников

```bash
git clone https://github.com/Leonid1095/VPN-Extension.git
cd VPN-Extension
npm install
npm run build           # → dist/
```

После сборки `dist/` готов к `Load unpacked`.

---

## Использование

### BYO — свой сервер

1. Кликни иконку → **«+ Свой сервер»**.
2. Вставь ссылку прокси:
   ```
   https://username:password@your-server.com:443
   ```
3. **Добавить профиль** → на главном экране нажми **Вкл**.

Поддерживаются схемы: `https`, `http`, `socks5`, `socks4`.

#### Импорт из файла

Перетащи на drop-зону `.json` или `.txt`:

```json
{
  "name": "Office",
  "scheme": "https",
  "host": "proxy.office.example.com",
  "port": 443,
  "username": "alice",
  "password": "secret"
}
```

Или массив таких объектов — добавятся все сразу.

### PLGames Pro

1. Кликни **«PLGames Pro»** → введи email и пароль.
2. Расширение автоматически получит выделенный профиль с нашего сервера и пометит его чипом `PRO`.
3. Переключение, продление и обновление — в одном экране.

> ℹ️ Сейчас режим Pro работает на моках для разработки. Реальный backend подключится через флаг в [`src/lib/api/managed.ts`](src/lib/api/managed.ts).

---

## Свой сервер

Если хочешь поднять свой прокси под BYO-режим — есть готовый скрипт изолированной установки **NaiveProxy** (Caddy + `forwardproxy@naive`), не ломающий существующий стек на сервере:

```bash
scp server/install-naive-isolated.sh root@<SERVER_IP>:/root/
ssh root@<SERVER_IP>
bash /root/install-naive-isolated.sh proxy.example.com 8445
```

Скрипт изолирован: ставит свой бинарь в `/opt/naive2/`, слушает только loopback, использует существующий certbot-сертификат через ACL. Откат — одна команда. Подробности в [`server/README.md`](server/README.md).

---

## Архитектура

```
┌────────────────────────────────────────────────────┐
│ popup.tsx (React)                                  │
│  ├── Home screen        → list, activate / deactivate
│  ├── AddByo screen      → URL parse / drop-file    │
│  └── Managed screen     → login / refresh / logout │
└────────────┬───────────────────────────────────────┘
             │ browser.runtime.sendMessage
             ▼
┌────────────────────────────────────────────────────┐
│ background.ts (MV3 Service Worker)                 │
│  ├── chrome.proxy.settings           ← apply/clear │
│  ├── webRequest.onAuthRequired       ← basic auth  │
│  ├── browser.storage.local           ← persist     │
│  ├── OffscreenCanvas (icon renderer)               │
│  └── lib/api/managed.ts              ← Pro backend │
└────────────────────────────────────────────────────┘
```

### Контракт Pro-бэкенда

В [`src/lib/api/managed.ts`](src/lib/api/managed.ts) (сейчас mocked, переключается флагом `MOCK = false`):

| Метод | Тело / заголовок | Ответ |
|---|---|---|
| `POST /api/auth/login` | `{ email, password }` | `{ token, account }` |
| `POST /api/auth/logout` | `Authorization: Bearer …` | `200 OK` |
| `GET /api/account` | `Authorization: Bearer …` | `{ account }` |
| `GET /api/profile` | `Authorization: Bearer …` | `{ profile }` |

```ts
account = { email: string; subscribedUntil?: number /* unix ms */ }
profile = { scheme, host, port, username?, password?, name? }
```

---

## Разработка

```bash
npm run dev             # webpack watch mode
npm run build           # production build (icons + webpack)
npm run build:icons     # regenerate brand icons
npm run lint
```

Структура:

```
src/
  background/    # MV3 service worker
  popup/         # React UI
  common/        # types, storage, parser
  lib/
    proxy/       # chrome.proxy.settings glue
    api/         # PLGames Pro backend client
  assets/        # icons (auto-generated by tools/build-icons.js)
tools/
  build-icons.js # pure-Node PNG renderer (no deps)
server/
  install-naive-isolated.sh    # BYO server install script
docs/
  assets/        # README hero + screenshots
```

---

## FAQ

<details>
<summary><b>Почему не VLESS / Trojan / Shadowsocks?</b></summary>

Браузерное расширение в MV3 не имеет TCP-сокета и не управляет TLS-handshake'ом. Все «настоящие» VPN-протоколы требуют нативного клиента, который пользователь вынужден ставить отдельно — это противоречит идее «один клик из Web Store». Поэтому используем стандартные HTTPS / SOCKS5 прокси, которые встроены в `chrome.proxy.settings` API.

</details>

<details>
<summary><b>Защищён ли мой пароль?</b></summary>

Креденшелы хранятся в `browser.storage.local` (sandbox расширения). Они не покидают браузер кроме момента, когда `webRequest.onAuthRequired` отправляет их на прокси-сервер по уже установленному TLS-каналу.

</details>

<details>
<summary><b>Расширение туннелирует Telegram / Discord / системный трафик?</b></summary>

Нет. Только то, что запрашивает сам браузер. Это фундаментальное ограничение MV3 API.

</details>

<details>
<summary><b>Будет ли работать в РФ?</b></summary>

Зависит от твоего сервера, не от расширения. Расширение — клиент, его не палит DPI. Сервер должен быть устойчив к блокировкам — рекомендуем NaiveProxy (на 443 порту, с реальным сайтом-заглушкой и Chrome TLS-fingerprint).

</details>

---

## Roadmap

- [x] Manifest V3 + chrome.proxy.settings
- [x] Auto-auth через webRequest.onAuthRequired
- [x] BYO режим: URL + файл
- [x] PLGames Pro stub
- [x] Branded UI и иконография
- [x] Изолированный server-installer (NaiveProxy)
- [ ] Реальный backend для Pro
- [ ] Per-site routing (PAC-список доменов через прокси)
- [ ] Web Store листинг
- [ ] Локализация EN / RU / KZ

---

## Лицензия

[MIT](LICENSE) © PLGames

---

<div align="center">
<sub>Made with care · <a href="https://github.com/Leonid1095/VPN-Extension/issues/new">сообщить об ошибке</a></sub>
</div>

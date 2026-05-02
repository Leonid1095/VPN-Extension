# Stealth-вход для NaiveProxy-нод

В дополнение к основному «браузерному» входу можно поднять второй site-block
с `probe_resistance` — он маскируется под обычный сайт при сканировании, но
требует чтобы клиент сразу слал `Proxy-Authorization` (как делает
[`naive`](https://github.com/klzgrad/naiveproxy) и `NekoBox`).

## Зачем

| Поведение при probe (запрос без auth) | Основной (proxy-1.) | **Stealth (stealth-1.)** |
|---|---|---|
| Без `probe_resistance` | `407 Proxy-Authenticate: Basic realm="..."` | — |
| С `probe_resistance` | — | `200 OK` + статичная HTML-страница |

То есть основной вход совместим с браузерами (Chrome → 407 → onAuthRequired
flow), но при пассивном сканировании выдаёт себя как прокси. Stealth-вход
выглядит как обычный сайт, но недоступен Chrome'у напрямую (тот не успевает
подставить креды).

## Установка второго входа

Допустим основной уже работает на `:8445` для `proxy-1.<domain>`.

### 1. DNS

Добавьте `A`-запись `stealth-1.<domain>` → IP сервера.

### 2. Сертификат

Расширьте существующий SAN-cert или выпустите отдельный:

```sh
certbot certonly --webroot -w /var/www/certbot \
  --cert-name plgames-extras \
  -d api.<domain> -d buy.<domain> \
  -d proxy-1.<domain> -d stealth-1.<domain> \
  --expand --non-interactive --agree-tos --email you@example.com

# симлинк-каталог на тот же cert (caddy ожидает /etc/letsencrypt/live/<host>/)
ln -sf plgames-extras /etc/letsencrypt/live/stealth-1.<domain>

# даём caddy-юзеру read access (после --expand файлы пересоздались — ACL обновить)
setfacl -m u:naive2:rx /etc/letsencrypt/live/plgames-extras
setfacl -m u:naive2:rx /etc/letsencrypt/archive/plgames-extras
setfacl -m u:naive2:r  /etc/letsencrypt/archive/plgames-extras/*.pem
```

### 3. Caddyfile

К существующему `:8445` блоку добавьте второй:

```caddyfile
# Stealth-вход для klzgrad/naive клиента — с probe_resistance.
:8446 {
    bind 127.0.0.1
    tls /etc/letsencrypt/live/stealth-1.<domain>/fullchain.pem /etc/letsencrypt/live/stealth-1.<domain>/privkey.pem

    forward_proxy {
        # >>> PLGAMES_USERS_BEGIN_STEALTH
        basic_auth __plgames_placeholder__ __plgames_placeholder__
        # <<< PLGAMES_USERS_END_STEALTH
        hide_ip
        hide_via
        probe_resistance
    }

    file_server {
        root /opt/naive2/www
    }
}
```

Маркеры `PLGAMES_USERS_BEGIN_STEALTH/END_STEALTH` распознаются `plgames-agent`
и синхронизируются вместе с основным блоком — отдельная конфигурация не нужна.

### 4. Nginx SNI

В существующий stream-диспетчер (`/etc/nginx/stream.d/*.conf`):

```nginx
map $ssl_preread_server_name $naive_backend {
    proxy-1.<domain>     127.0.0.1:8445;
    stealth-1.<domain>   127.0.0.1:8446;   # <-- добавить
    default              127.0.0.1:8443;
}
```

```sh
nginx -t && systemctl reload nginx
systemctl restart caddy-naive2
```

## Использование клиентом

### Linux / macOS

```sh
naive --listen=socks://127.0.0.1:1080 \
      --proxy=https://USER:PASS@stealth-1.<domain>
```

В браузере / системе укажите SOCKS5 `127.0.0.1:1080`.

### Windows

```
naive.exe --listen=socks://127.0.0.1:1080 --proxy=https://USER:PASS@stealth-1.<domain>
```

### Android

NekoBox / SagerNet → новый профиль NaïveProxy:
- `host`: `stealth-1.<domain>`
- `port`: `443`
- `user` / `pass`

## Отличия от стандартного PLGames Connect

Расширение PLGames Connect использует Chrome `chrome.proxy.settings` API,
который требует полноценного 407-флоу — **расширение НЕ работает со
stealth-входом**, ему нужен `proxy-1.`. Stealth-вход — отдельный канал для
тех, кто использует нативный `naive` клиент или его форки.

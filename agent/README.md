# PLGames Connect — proxy-side agent

Маленький Bash-скрипт, который ставится **на каждый прокси-сервер** (тот, где
крутится изолированный NaiveProxy из `server/install-naive-isolated.sh`) и держит
его `Caddyfile` в синхроне с источником истины — backend SQLite.

Каждые 30 секунд агент:

1. Делает HTTP GET к
   `https://api.plgames-connect.example/api/internal/server/<SERVER_ID>/users`
   с заголовком `X-Internal-Token: <INTERNAL_API_TOKEN>`.
2. Получает массив `[{username, password, expires_at}]` — текущие активные
   подписчики на ЭТОМ сервере.
3. Если набор изменился (sha256-хэш отличается от прошлого) — переписывает блок
   `basic_auth` внутри `forward_proxy { ... }` Caddyfile и делает `caddy reload`.
4. Если не изменился — ничего не трогает.

Без зависимостей кроме `curl` и `jq` (ставятся `apt install` за секунду).

## Зачем

- **Безопасность.** Креды каждые 24 часа ротируются на бэкенде. Агент подхватывает
  новые — старые перестают работать. Даже если юзер своими `username:password`
  поделился с другом — у того будет максимум сутки.
- **Ноль ручной работы.** Купил → backend выдал → агент применил → пользуется.

## Установка

На прокси-сервере (где уже стоит `caddy-naive2.service`):

```bash
# скопируй папку agent/ на сервер любым способом
scp -r agent/ root@<SERVER_IP>:/root/

ssh root@<SERVER_IP>
bash /root/agent/install-agent.sh
```

Установщик:

- ставит `curl` и `jq`,
- кладёт `plgames-agent.sh` в `/usr/local/bin`,
- создаёт `/etc/plgames-agent/agent.env` (нужно заполнить),
- регистрирует systemd-сервис + timer (раз в 30 секунд).

## Конфиг

`/etc/plgames-agent/agent.env`:

```ini
API_URL=https://api.plgames-connect.example
SERVER_ID=eu-1                    # должен совпадать с id в backend/data/proxy-pool.json
INTERNAL_API_TOKEN=…              # тот же что в backend/.env

# опционально:
# CADDYFILE=/opt/naive2/Caddyfile
# RELOAD_CMD=systemctl reload caddy-naive2
```

## Маркеры в Caddyfile

Агент знает где переписать список юзеров **только** по маркерам. Открой
`/opt/naive2/Caddyfile` и приведи блок `forward_proxy` к виду:

```caddyfile
forward_proxy {
    # >>> PLGAMES_USERS_BEGIN
    basic_auth __plgames_placeholder__ __plgames_placeholder__
    # <<< PLGAMES_USERS_END
    hide_ip
    hide_via
    probe_resistance
}
```

После правки сделай `systemctl reload caddy-naive2` — placeholder там останется до
первого срабатывания агента, после чего его заменит реальный список.

## Включить и проверить

```bash
systemctl enable --now plgames-agent.timer
systemctl start  plgames-agent.service        # прогон один раз сразу
journalctl -t plgames-agent -f                # смотреть логи
```

В норме видишь:
```
plgames-agent: synced 7 users, caddy reloaded
```
или ничего (изменений нет).

## Откат

```bash
systemctl disable --now plgames-agent.timer
rm /etc/systemd/system/plgames-agent.{service,timer}
rm /usr/local/bin/plgames-agent.sh
rm -rf /etc/plgames-agent /var/lib/plgames-agent
systemctl daemon-reload
```

## Безопасность агента

- `INTERNAL_API_TOKEN` лежит в `/etc/plgames-agent/agent.env` с правами `0640 root:root`.
- Запросы идут только по HTTPS.
- Файрвол на бэкенде должен ограничить доступ к `/api/internal/*` по IP — например
  через nginx:
  ```nginx
  location /api/internal/ {
      allow <PROXY_IP_1>;
      allow <PROXY_IP_2>;
      deny all;
      proxy_pass http://127.0.0.1:8080;
  }
  ```
- Если токен утёк — поменяй `INTERNAL_API_TOKEN` в `backend/.env` и перезапусти
  бэкенд + во всех `agent.env` на прокси-серверах. Агенты при следующем тике
  получат 401, ничего не сломают, прокси продолжат работать со старым
  Caddyfile до твоего вмешательства.

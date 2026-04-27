# Серверная часть

Расширение — тонкий HTTPS-клиент. Серверный прокси ставится отдельно.
Здесь лежит установщик под **изолированный** второй Caddy с `forwardproxy@naive`,
рассчитанный на сервер с уже работающим стеком (nginx SNI-диспетчер + первый Caddy + certbot).

## Что делает / не делает

| Делает | Не делает |
|---|---|
| Кладёт `caddy` в `/opt/naive2/caddy` | Не трогает `/usr/local/bin/caddy` |
| Регистрирует `caddy-naive2.service` | Не трогает другие caddy-юниты |
| Слушает `127.0.0.1:<PORT>` | Не открывает 80, не открывает 443 |
| Использует существующий cert из `/etc/letsencrypt/live/<DOMAIN>/` | Не выпускает сертификаты, не правит certbot |
| Создаёт пользователя `naive2` | Не лезет в `/etc/caddy/Caddyfile` или nginx-конфиг |
| Через ACL даёт `naive2` read-only на live/archive | Не меняет owner/mode `/etc/letsencrypt` |

Подключение наружу делается через **уже существующий nginx SNI-диспетчер**:
расширение коннектится на `<DOMAIN>:443`, nginx по `ssl_preread_server_name`
маршрутизирует TCP-поток на `127.0.0.1:<PORT>`, Caddy там терминирует TLS и
обслуживает forward_proxy.

## Подготовка

1. Поднять A-запись для нового субдомена (например, `proxy.example.com`)
   на IP сервера.
2. Выпустить сертификат своим обычным certbot:
   ```bash
   certbot certonly --webroot -w /var/www/html -d proxy.example.com
   # или standalone, если 80 свободен в момент выпуска
   ```
3. Решить порт на loopback (по умолчанию 8445).

## Запуск

```bash
# скопировать скрипт на сервер (любым способом)
scp server/install-naive-isolated.sh root@<SERVER_IP>:/root/

# на сервере
ssh root@<SERVER_IP>
bash install-naive-isolated.sh proxy.example.com 8445
# или с явным юзером:
bash install-naive-isolated.sh proxy.example.com 8445 myname
```

В конце выведутся `Username` и `Password` — сохрани их.

## Интеграция с nginx SNI-диспетчером

Скрипт сам ничего в nginx не правит — это твоя зона ответственности.
В существующем `stream { }` добавь маршрут по SNI:

```nginx
stream {
    map $ssl_preread_server_name $upstream {
        proxy.example.com     127.0.0.1:8445;     # новый
        <EXISTING_DOMAIN>     127.0.0.1:8444;     # уже было (пример)
        default               127.0.0.1:<existing_default>;
    }

    server {
        listen 443;
        listen [::]:443;
        ssl_preread on;
        proxy_pass $upstream;
    }
}
```

```bash
nginx -t && systemctl reload nginx
```

## Проверка

```bash
# на любой внешней машине с curl 7.61+
curl -x https://USER:PASS@proxy.example.com:443 https://api.ipify.org
# должен вернуть IP сервера, а не твой локальный
```

В расширении (`+ Добавить профиль`):

- Схема: **HTTPS**
- Хост: `proxy.example.com`
- Порт: **443**
- Логин/Пароль: из вывода скрипта

## Откат

```bash
systemctl disable --now caddy-naive2
rm /etc/systemd/system/caddy-naive2.service
rm -rf /opt/naive2
userdel naive2 2>/dev/null
systemctl daemon-reload
```

Сертификат, certbot и существующий стек не затронуты.

## Renew сертификата

Caddy в этом сетапе НЕ управляет сертификатом — `auto_https off`.
Когда твой certbot обновит cert (cron/timer), нужно дать Caddy перечитать его:

```bash
systemctl reload caddy-naive2
```

Можно вешнуть как `--deploy-hook` в certbot:
```bash
certbot renew --deploy-hook "systemctl reload caddy-naive2"
```

## Альтернативный путь — переиспользовать существующий Caddy

Если не хочется второго бинаря, добавь в **существующий** `/etc/caddy/Caddyfile`
ещё один сайт-блок (Caddy спокойно держит сколько угодно сайтов на одном
бинаре):

```
:8445 {
    bind 127.0.0.1
    tls /etc/letsencrypt/live/proxy.example.com/fullchain.pem \
        /etc/letsencrypt/live/proxy.example.com/privkey.pem
    forward_proxy {
        basic_auth USER PASS
        hide_ip
        hide_via
        probe_resistance
    }
    file_server { root /var/www/proxy-stub }
}
```

Затем `systemctl reload caddy`. Этот путь проще, но требует, чтобы существующий
Caddy умел `forwardproxy@naive` (если он собран без плагина — не сработает,
проверь: `/usr/local/bin/caddy list-modules | grep forward_proxy`).

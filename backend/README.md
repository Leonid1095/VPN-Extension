# PLGames Connect — Backend

Маленький Node.js-сервис, который:
1. Получает заказы от расширения и возвращает ссылку на оплату DonatePay.
2. Принимает webhook от DonatePay → помечает заказ оплаченным → выдаёт прокси-креды.
3. Раздаёт расширению `account` и `profile` по Bearer-токену.

Полностью автономный flow: пользователь жмёт «Купить» в расширении → уходит на DonatePay
→ оплачивает → расширение polling-ом видит оплату → автоактивирует профиль PLGames Pro.

## Стек

- **Fastify 5** (HTTP)
- **better-sqlite3** (БД, single-file)
- **Docker / Docker Compose** для деплоя

Ноль внешних SaaS, кроме самого DonatePay.

## Запуск локально

```bash
cd backend
cp .env.example .env
# отредактируй .env (минимум: JWT_SECRET, DONATEPAY_USERNAME)
npm install
node src/server.js
# слушает 0.0.0.0:8080
```

В отдельном файле создай пул прокси:

```bash
cp data/proxy-pool.example.json data/proxy-pool.json
# затем впиши свои сервера
```

Расширение по умолчанию ходит на `https://api.plgames-connect.example` —
для локальной разработки пересобери его так:

```bash
cd ..
PLGAMES_API_URL=http://localhost:8080 npm run build
```

## Запуск в продакшене

```bash
cd backend
docker compose up -d --build
```

`docker-compose.yml` биндит порт `127.0.0.1:8080` — наружу его показывай через nginx /
Caddy с TLS-терминацией.

Пример nginx-блока:

```nginx
server {
    listen 443 ssl http2;
    server_name api.plgames-connect.example;

    ssl_certificate     /etc/letsencrypt/live/api.plgames-connect.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.plgames-connect.example/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Эндпоинты

| Метод | Путь | Назначение |
|---|---|---|
| `GET`  | `/healthz` | health-check |
| `GET`  | `/api/tiers` | публичный список тарифов для попапа/landing |
| `POST` | `/api/orders` | создать pending-заказ, body `{tier}` → возвращает `{order, paymentUrl, comment, successUrl}` |
| `GET`  | `/api/orders/:id` | статус заказа (polling): `pending` / `paid` / `expired`. Если paid — возвращает `token` и `subscribedUntil` |
| `POST` | `/api/donatepay/webhook` | DonatePay отправляет сюда уведомление об оплате |
| `GET`  | `/api/account` | (Bearer) состояние подписки |
| `GET`  | `/api/profile` | (Bearer) выдача прокси-кредов |
| `POST` | `/api/auth/logout` | (Bearer) noop, для совместимости |

Bearer-токен выдаётся бэкендом после фиксации оплаты и попадает к расширению через
ответ `GET /api/orders/:id`. Расширение хранит его только локально.

## Настройка DonatePay

1. На своей странице DonatePay получи `DONATEPAY_USERNAME` (это та часть, что в
   `https://donate.qiwi.com/payin/<USERNAME>`) и API-ключ.
2. В админке DonatePay настрой webhook на адрес
   `https://api.plgames-connect.example/api/donatepay/webhook` (или другой, см.
   `DONATEPAY_WEBHOOK_PATH` в `.env`).
3. Если DonatePay даёт секрет для подписи webhook — пропиши в
   `DONATEPAY_WEBHOOK_SECRET`. Скрипт проверяет HMAC-SHA256 от raw-body.
4. **Если у DonatePay другие имена полей в webhook** — поправь функцию
   `normalizePayload()` в [`src/lib/donatepay.js`](src/lib/donatepay.js). Это единственное место,
   где предполагается формат провайдера.

Скрипт ожидает что в payload есть:
- `id` или `payment_id` — id платежа,
- `comment` или `message` — должен содержать `PLGC-<orderId>`,
- `sum` или `amount` — сумма (для контроля недоплаты),
- `status` — один из `paid` / `success` / `completed` / `ok`.

## Конфиг прокси-пула

`data/proxy-pool.json` — массив объектов:

```json
[
    {
        "id": "eu-1",
        "scheme": "https",
        "host": "eu-1.proxy.example.com",
        "port": 443,
        "name": "PLGames Pro · EU-1",
        "capacity": 200
    }
]
```

Бэкенд при выдаче профиля выбирает **least-loaded** сервер с свободной capacity и
генерит уникальный `username` / `password` (basic_auth) под этого юзера. На стороне
прокси-сервера должен быть агент, который раз в N секунд тянет список юзеров через
**внутренний** API (его ещё нет — TODO `/api/internal/server/:id/users`) или мы
прописываем статически тот же source-of-truth (SQLite) на сервере прокси.

В текущем MVP сделано так: креды генерятся, но реальная синхронизация с Caddy/NaiveProxy —
твоя следующая задача. Самый простой вариант:

1. На прокси-сервере крутится скрипт-агент (Bash или Python) с доступом read-only
   к SQLite бэкенда (через rsync или копию).
2. Раз в 30 сек агент:
   - вычитывает orders где `proxy_id = <свой> AND status='paid' AND subscribed_until > now`,
   - перегенерирует `forward_proxy { basic_auth … }` блок в Caddyfile,
   - делает `caddy reload`.

Для совсем минимального запуска можно вообще руками прописать одного-двух тестовых
юзеров в Caddyfile прокси-сервера — flow с расширением и DonatePay этим не ломается.

## БД

SQLite файл лежит в `data/plgames.db`. Бэкап — копированием файла (использует WAL).

Структура таблицы — в [`src/lib/db.js`](src/lib/db.js).

## Безопасность

- В `.env` лежат секреты: `JWT_SECRET`, DonatePay-ключи. **`.env` в `.gitignore`.**
- Bearer-токены никак не хранятся отдельно — они = `orders.token`. Logout удаляет
  только локально в расширении (не отзывает на сервере). При необходимости отзыва —
  `UPDATE orders SET token=NULL WHERE id=?`.
- Rate-limit: 60 req/min на IP по умолчанию (`@fastify/rate-limit`).
- CORS: открыт для всех (нужно расширению из любого browser-extension://). При
  необходимости сузь до конкретных origin'ов.

## TODO

- [ ] `/api/internal/server/:id/users` для агента-синхронизатора Caddyfile
- [ ] Webhook signature verification под реальный формат DonatePay (когда увидишь)
- [ ] Метрики/Prometheus
- [ ] Таска чистки expired orders из БД (сейчас они просто помечаются)

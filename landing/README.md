# PLGames Connect — Landing

Одна статическая страница `index.html`, которая показывается пользователю
после успешной оплаты DonatePay.

DonatePay принимает в URL платежа `success_url` (или подобное поле,
зависит от их API). В `.env` бэкенда переменная `SUCCESS_URL` указывает
на эту страницу с параметром `?order=<id>`:

```
https://buy.plgames-connect.example/thanks?order=a8f3k29q
```

Страница:
- читает `?order` из URL,
- подставляет `PLGC-<order>` в карточку «Заказ»,
- инструктирует пользователя вернуться в расширение.

Никакой логики на бэкенде у landing нет — расширение polling-ом само получит
статус оплаты от API.

## Деплой

Любой статический хостинг:

- **GitHub Pages** (`Settings → Pages → Source: /landing`)
- **Cloudflare Pages**
- **Netlify drop**
- nginx на собственном VPS:

```nginx
server {
    listen 443 ssl http2;
    server_name buy.plgames-connect.example;
    root /var/www/plgames-landing;
    index index.html;
    ssl_certificate     /etc/letsencrypt/live/buy.plgames-connect.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/buy.plgames-connect.example/privkey.pem;
    location /thanks { try_files /index.html =404; }
}
```

## Настройка

В файле нет хардкоженых имён хостов. Только email поддержки на 2-й строке снизу —
поменяй `support@plgames.example` на свой реальный.

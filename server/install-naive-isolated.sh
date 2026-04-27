#!/usr/bin/env bash
# ============================================================================
# Изолированная установка NaiveProxy под существующий nginx SNI-диспетчер.
#
# Что делает:
#   - Ставит свой бинарь Caddy в /opt/naive2/caddy   (не трогает /usr/local/bin/caddy)
#   - Кладёт конфиг в /opt/naive2/Caddyfile
#   - Регистрирует systemd-юнит caddy-naive2.service
#   - Слушает ТОЛЬКО на 127.0.0.1:<PORT>             (не на 80, не на 443)
#   - Использует уже выпущенный сертификат из /etc/letsencrypt/live/<DOMAIN>/
#   - НЕ управляет TLS автоматически (auto_https off) — за renew отвечает твой certbot
#
# Что НЕ делает (в отличие от типовых installer'ов):
#   - Не трогает /usr/local/bin/caddy
#   - Не открывает 80/443 в файрволе
#   - Не выпускает сертификаты
#   - Не правит твой /etc/caddy/Caddyfile или nginx-конфиг
#
# Pre-requisites:
#   1) Существующий certbot уже выпустил сертификат для <DOMAIN>:
#      ls /etc/letsencrypt/live/<DOMAIN>/fullchain.pem  -> должен существовать
#   2) Свободный TCP-порт на 127.0.0.1 (по умолчанию 8445)
#   3) Решено, какой SNI-домен будет вести в этот прокси через nginx-диспетчер
#
# Usage (root):
#   bash install-naive-isolated.sh <DOMAIN> [PORT] [USERNAME]
#
# Examples:
#   bash install-naive-isolated.sh proxy.example.com
#   bash install-naive-isolated.sh proxy.example.com 8445 myname
#
# Rollback (полное удаление):
#   systemctl disable --now caddy-naive2
#   rm /etc/systemd/system/caddy-naive2.service
#   rm -rf /opt/naive2
#   userdel naive2 2>/dev/null
#   systemctl daemon-reload
# ============================================================================

set -euo pipefail

DOMAIN="${1:-}"
LISTEN_PORT="${2:-8445}"
USERNAME="${3:-user_$(openssl rand -hex 4)}"

INSTALL_DIR=/opt/naive2
SERVICE=caddy-naive2
SERVICE_USER=naive2

# --- pre-flight ---------------------------------------------------------------

if [[ -z "$DOMAIN" ]]; then
    echo "Usage: bash $0 <DOMAIN> [PORT] [USERNAME]"
    exit 1
fi

if [[ "$EUID" -ne 0 ]]; then
    echo "Run as root."
    exit 1
fi

if ! [[ "$LISTEN_PORT" =~ ^[0-9]+$ ]] || (( LISTEN_PORT < 1 || LISTEN_PORT > 65535 )); then
    echo "PORT must be 1-65535, got: $LISTEN_PORT"
    exit 1
fi

CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
if [[ ! -f "$CERT_DIR/fullchain.pem" || ! -f "$CERT_DIR/privkey.pem" ]]; then
    cat <<EOF
Сертификат не найден в $CERT_DIR

Сначала выпусти его своим существующим certbot, например:
  certbot certonly --webroot -w /var/www/html -d $DOMAIN

или через standalone (если 80 свободен в момент выпуска):
  certbot certonly --standalone -d $DOMAIN

Затем перезапусти этот скрипт.
EOF
    exit 1
fi

if ss -ltn 2>/dev/null | awk '{print $4}' | grep -E "(127\.0\.0\.1|0\.0\.0\.0|\[::\]):$LISTEN_PORT$" >/dev/null; then
    echo "Порт $LISTEN_PORT уже кем-то занят. Выбери другой."
    exit 1
fi

if systemctl is-active --quiet "$SERVICE" 2>/dev/null; then
    echo "Сервис $SERVICE уже активен. Останови его перед переустановкой:"
    echo "  systemctl stop $SERVICE"
    exit 1
fi

# --- архитектура --------------------------------------------------------------

case "$(uname -m)" in
    x86_64)        GOARCH=amd64 ;;
    aarch64|arm64) GOARCH=arm64 ;;
    armv7l)        GOARCH=armv7 ;;
    *) echo "Архитектура не поддерживается: $(uname -m)"; exit 1 ;;
esac

# --- зависимости --------------------------------------------------------------

echo "[1/6] Зависимости..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates acl

# --- генерация пароля ---------------------------------------------------------

PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"

# --- директории и пользователь ------------------------------------------------

echo "[2/6] Структура каталогов и пользователь..."
mkdir -p "$INSTALL_DIR"/{www,data,config}
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    useradd --system --home "$INSTALL_DIR" --shell /usr/sbin/nologin --user-group "$SERVICE_USER"
fi

# --- скачивание Caddy с forwardproxy@naive ------------------------------------

echo "[3/6] Скачиваем Caddy + forwardproxy@naive..."
DOWNLOAD_URL="https://caddyserver.com/api/download?os=linux&arch=${GOARCH}&p=github.com%2Fklzgrad%2Fforwardproxy%40naive"
curl -fsSL "$DOWNLOAD_URL" -o "$INSTALL_DIR/caddy"
chmod +x "$INSTALL_DIR/caddy"
"$INSTALL_DIR/caddy" version || { echo "Caddy не запускается"; exit 1; }

# --- заглушка-сайт ------------------------------------------------------------

if [[ ! -f "$INSTALL_DIR/www/index.html" ]]; then
    cat > "$INSTALL_DIR/www/index.html" <<EOF
<!doctype html>
<meta charset="utf-8">
<title>$DOMAIN</title>
<h1>It works.</h1>
<p>This site is under construction.</p>
EOF
fi

# --- Caddyfile (auto_https off, использует certbot-сертификаты) ---------------

echo "[4/6] Caddyfile..."
cat > "$INSTALL_DIR/Caddyfile" <<EOF
{
    auto_https off
    admin off
    storage file_system {
        root $INSTALL_DIR/data
    }
    order forward_proxy before file_server
}

127.0.0.1:$LISTEN_PORT {
    tls $CERT_DIR/fullchain.pem $CERT_DIR/privkey.pem

    forward_proxy {
        basic_auth $USERNAME $PASSWORD
        hide_ip
        hide_via
        probe_resistance
    }

    file_server {
        root $INSTALL_DIR/www
    }
}
EOF

chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

# --- доступ к сертификатам Let's Encrypt --------------------------------------

echo "[5/6] Доступ к сертификатам..."
# /etc/letsencrypt/{live,archive} обычно 0700 root:root.
# Через ACL даём naive2 read-only — без изменения owner/mode для root.
setfacl -m u:"$SERVICE_USER":x  /etc/letsencrypt 2>/dev/null || true
setfacl -m u:"$SERVICE_USER":x  /etc/letsencrypt/live 2>/dev/null || true
setfacl -m u:"$SERVICE_USER":x  /etc/letsencrypt/archive 2>/dev/null || true
setfacl -m u:"$SERVICE_USER":rx "$CERT_DIR" 2>/dev/null || true
# Файлы в live — это симлинки в archive; ACL должен быть на реальный файл.
ARCHIVE_DIR="/etc/letsencrypt/archive/$DOMAIN"
if [[ -d "$ARCHIVE_DIR" ]]; then
    setfacl -m u:"$SERVICE_USER":rx "$ARCHIVE_DIR" 2>/dev/null || true
    setfacl -m u:"$SERVICE_USER":r  "$ARCHIVE_DIR"/*.pem 2>/dev/null || true
fi

# Проверка чтения от имени пользователя
if ! sudo -u "$SERVICE_USER" test -r "$CERT_DIR/privkey.pem"; then
    cat <<EOF
ВНИМАНИЕ: пользователь $SERVICE_USER не может прочитать $CERT_DIR/privkey.pem.
Возможно ACL не поддерживается ФС. Альтернативы:
  - usermod -aG ssl-cert $SERVICE_USER  (если у тебя на хосте есть group ssl-cert)
  - либо скопировать certs в $INSTALL_DIR/certs и перенаправить пути в Caddyfile
Скрипт продолжает, но сервис, скорее всего, не стартует.
EOF
fi

# --- systemd unit -------------------------------------------------------------

echo "[6/6] systemd-юнит $SERVICE.service..."
cat > "/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=Caddy + NaiveProxy (isolated, $DOMAIN)
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/caddy run --config $INSTALL_DIR/Caddyfile --adapter caddyfile
ExecReload=$INSTALL_DIR/caddy reload --config $INSTALL_DIR/Caddyfile --adapter caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
LimitNPROC=512
PrivateTmp=true
ProtectSystem=full
NoNewPrivileges=true
Restart=on-abnormal
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$SERVICE"
sleep 2
systemctl --no-pager -l status "$SERVICE" || true

# --- финальный отчёт ----------------------------------------------------------

cat <<EOF

============================================================
Готово. Изолированный NaiveProxy запущен.

  Бинарь:        $INSTALL_DIR/caddy
  Конфиг:        $INSTALL_DIR/Caddyfile
  Юнит:          $SERVICE.service
  Пользователь:  $SERVICE_USER
  Слушает:       127.0.0.1:$LISTEN_PORT  (только loopback)
  Сертификат:    $CERT_DIR (используется как есть, renew управляется твоим certbot)
  Логи:          journalctl -u $SERVICE -f

>>> ДЛЯ РАСШИРЕНИЯ <<<
  Schema:   HTTPS
  Host:     $DOMAIN
  Port:     443
  User:     $USERNAME
  Password: $PASSWORD

>>> ИНТЕГРАЦИЯ С NGINX SNI-ДИСПЕТЧЕРОМ <<<

В существующем nginx stream{} добавь маршрут по SNI. Пример:

  stream {
      map \$ssl_preread_server_name \$upstream {
          $DOMAIN                   127.0.0.1:$LISTEN_PORT;
          <EXISTING_DOMAIN>         127.0.0.1:8444;     # пример другого сайта
          default                   127.0.0.1:<твой_default_backend>;
      }

      server {
          listen 443;
          listen [::]:443;
          ssl_preread on;
          proxy_pass \$upstream;
      }
  }

После правки:
  nginx -t && systemctl reload nginx

>>> ПРОВЕРКА СНАРУЖИ <<<
  curl -x https://$USERNAME:$PASSWORD@$DOMAIN:443 https://api.ipify.org

>>> ROLLBACK <<<
  systemctl disable --now $SERVICE
  rm /etc/systemd/system/$SERVICE.service
  rm -rf $INSTALL_DIR
  userdel $SERVICE_USER 2>/dev/null
  systemctl daemon-reload
============================================================
EOF

#!/usr/bin/env bash
# ==============================================================================
# Установщик PLGames Connect proxy-side agent.
#
# Что делает:
#   • кладёт plgames-agent.sh в /usr/local/bin
#   • создаёт /etc/plgames-agent/agent.env (заполняется руками)
#   • регистрирует systemd-сервис + таймер (каждые 30 секунд)
#   • вставляет маркеры PLGAMES_USERS_BEGIN/END в твой Caddyfile (если их там нет)
#
# Запуск:
#   sudo bash install-agent.sh
#
# После установки:
#   sudo nano /etc/plgames-agent/agent.env     # заполнить значения
#   sudo systemctl enable --now plgames-agent.timer
#   journalctl -t plgames-agent -f             # смотреть логи
# ==============================================================================

set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
    echo "Run as root (sudo)."
    exit 1
fi

INSTALL_DIR=/usr/local/bin
CONF_DIR=/etc/plgames-agent
SCRIPT_SRC="$(cd "$(dirname "$0")" && pwd)/plgames-agent.sh"

if [[ ! -f "$SCRIPT_SRC" ]]; then
    echo "plgames-agent.sh not found next to this installer"
    exit 1
fi

echo "[1/5] Зависимости (curl, jq)…"
apt-get update -y >/dev/null
apt-get install -y curl jq >/dev/null

echo "[2/5] Копируем скрипт…"
install -m 0755 "$SCRIPT_SRC" "$INSTALL_DIR/plgames-agent.sh"

echo "[3/5] Конфиг…"
mkdir -p "$CONF_DIR"
if [[ ! -f "$CONF_DIR/agent.env" ]]; then
    cat > "$CONF_DIR/agent.env" <<'EOF'
# PLGames Connect proxy-side agent
# ОБЯЗАТЕЛЬНО заполни:

API_URL=https://api.plgames-connect.example
SERVER_ID=eu-1
INTERNAL_API_TOKEN=

# Опционально (по умолчанию):
# CADDYFILE=/opt/naive2/Caddyfile
# RELOAD_CMD=systemctl reload caddy-naive2
# STATE_DIR=/var/lib/plgames-agent
# LOG_TAG=plgames-agent
EOF
    chmod 0640 "$CONF_DIR/agent.env"
    echo "    создал $CONF_DIR/agent.env — заполни значения!"
fi

echo "[4/5] systemd unit + timer…"
cat > /etc/systemd/system/plgames-agent.service <<'EOF'
[Unit]
Description=PLGames Connect — sync proxy users from API
After=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/plgames-agent/agent.env
ExecStart=/usr/local/bin/plgames-agent.sh
StandardOutput=journal
StandardError=journal
EOF

cat > /etc/systemd/system/plgames-agent.timer <<'EOF'
[Unit]
Description=Run PLGames Connect agent every 30 seconds

[Timer]
OnBootSec=15s
OnUnitActiveSec=30s
AccuracySec=5s
Unit=plgames-agent.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload

echo "[5/5] Проверка Caddyfile…"
CADDYFILE=$(grep -E '^CADDYFILE=' "$CONF_DIR/agent.env" 2>/dev/null | cut -d= -f2- || true)
CADDYFILE=${CADDYFILE:-/opt/naive2/Caddyfile}

if [[ -f "$CADDYFILE" ]] && ! grep -q 'PLGAMES_USERS_BEGIN' "$CADDYFILE"; then
    cat <<EOF

ВНИМАНИЕ: $CADDYFILE не содержит маркеров PLGAMES_USERS_BEGIN/END.
Открой его и внутри блока 'forward_proxy { ... }' замени список basic_auth на:

    forward_proxy {
        # >>> PLGAMES_USERS_BEGIN
        basic_auth __plgames_placeholder__ __plgames_placeholder__
        # <<< PLGAMES_USERS_END
        hide_ip
        hide_via
        probe_resistance
    }

После этого:
    systemctl reload caddy-naive2
    systemctl enable --now plgames-agent.timer

EOF
fi

cat <<EOF

Установка завершена. Дальше:

1. Заполни /etc/plgames-agent/agent.env (минимум API_URL, SERVER_ID, INTERNAL_API_TOKEN).
2. Убедись что в $CADDYFILE есть маркеры PLGAMES_USERS_BEGIN/END (см. выше).
3. Включи таймер:    systemctl enable --now plgames-agent.timer
4. Проверь логи:     journalctl -t plgames-agent -f
5. Прогон один раз:  systemctl start plgames-agent.service

Откат всего:
    systemctl disable --now plgames-agent.timer
    rm /etc/systemd/system/plgames-agent.{service,timer}
    rm /usr/local/bin/plgames-agent.sh
    rm -rf /etc/plgames-agent /var/lib/plgames-agent
    systemctl daemon-reload
EOF

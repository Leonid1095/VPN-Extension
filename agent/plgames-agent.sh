#!/usr/bin/env bash
# ==============================================================================
# PLGames Connect — proxy-side sync agent
#
# Запускается systemd-таймером раз в 30 секунд. Тянет с PLGames API список
# текущих активных подписчиков на ЭТОТ прокси-сервер и перегенерирует блок
# basic_auth в Caddyfile. Если набор юзеров изменился — делает caddy reload.
#
# Без зависимостей кроме curl и jq (ставятся одной строкой apt install).
# ==============================================================================

set -euo pipefail
umask 077

CONF=${PLGAMES_AGENT_CONF:-/etc/plgames-agent/agent.env}
[[ -f "$CONF" ]] && set -a && . "$CONF" && set +a

: "${API_URL:?env API_URL is required (e.g. https://api.plgames-connect.example)}"
: "${SERVER_ID:?env SERVER_ID is required (id из proxy-pool.json, e.g. eu-1)}"
: "${INTERNAL_API_TOKEN:?env INTERNAL_API_TOKEN is required}"
export -n INTERNAL_API_TOKEN
if [[ "$INTERNAL_API_TOKEN" == *$'\n'* || "$INTERNAL_API_TOKEN" == *$'\r'* ]]; then
    logger -t plgames-agent "invalid internal token format"
    exit 1
fi
CADDYFILE=${CADDYFILE:-/opt/naive2/Caddyfile}
RELOAD_CMD=${RELOAD_CMD:-systemctl reload caddy-naive2}
STATE_DIR=${STATE_DIR:-/var/lib/plgames-agent}
LOG_TAG=${LOG_TAG:-plgames-agent}

mkdir -p "$STATE_DIR"
TMP_DIR=$(mktemp -d)
TMP="$TMP_DIR/response.json"
USERS_FILE="$TMP_DIR/users"
PENDING_CADDYFILE=''
cleanup() {
    rm -f -- "$TMP" "$USERS_FILE"
    rmdir -- "$TMP_DIR"
    if [[ -n "$PENDING_CADDYFILE" ]]; then rm -f -- "$PENDING_CADDYFILE"; fi
}
trap cleanup EXIT

# 1) тянем список юзеров
HTTP=$(printf 'X-Internal-Token: %s\n' "$INTERNAL_API_TOKEN" | curl -q -fsS --max-time 10 \
    -H @- \
    -o "$TMP" -w '%{http_code}' \
    "${API_URL%/}/api/internal/server/${SERVER_ID}/users") || {
    logger -t "$LOG_TAG" "API request failed (curl exit)"
    exit 0
}

if [[ "$HTTP" != "200" ]]; then
    logger -t "$LOG_TAG" "API returned HTTP $HTTP"
    exit 0
fi

# 2) детерминированный hash содержимого — чтобы зря не перезагружать Caddy
NEW_HASH=$(jq -S '.users' "$TMP" | sha256sum | cut -d' ' -f1)
PREV_HASH=$(cat "$STATE_DIR/users.sha" 2>/dev/null || true)
if [[ "$NEW_HASH" == "$PREV_HASH" && -f "$CADDYFILE" ]]; then
    exit 0
fi

# 3) генерируем строки basic_auth
jq -er '
    .users | arrays |
    map(
        if ((.username | strings | test("^[A-Za-z0-9_-]+$")) and
            (.password | strings | test("^[A-Za-z0-9_-]+$")))
        then "        basic_auth " + .username + " " + .password
        else error("invalid proxy credential format")
        end
    ) | join("\n")
' "$TMP" > "$USERS_FILE"
if [[ -z "$(head -n 1 "$USERS_FILE")" ]]; then
    # пул пуст — оставляем placeholder-юзера чтобы Caddy не падал
    printf '%s\n' '        basic_auth __plgames_placeholder__ __plgames_placeholder__' > "$USERS_FILE"
fi

# 4) ищем блоки forward_proxy в Caddyfile и переписываем basic_auth-список.
#
# Ожидаемая структура файла (чувствительна к маркерам):
#
#   forward_proxy {
#       # >>> PLGAMES_USERS_BEGIN
#       basic_auth ...
#       basic_auth ...
#       # <<< PLGAMES_USERS_END
#       hide_ip
#       hide_via
#   }
#
# Поддерживаются также маркеры PLGAMES_USERS_BEGIN_STEALTH/END_STEALTH —
# для отдельного site-block с probe_resistance (см. docs/STEALTH.md).
# Один прогон агента синхронизирует оба блока, если они есть.

if ! grep -q 'PLGAMES_USERS_BEGIN' "$CADDYFILE"; then
    logger -t "$LOG_TAG" "Caddyfile missing PLGAMES_USERS_BEGIN marker — see agent/README.md"
    exit 1
fi

# regex без anchors — ловит и BEGIN, и BEGIN_STEALTH (равно для END).
PENDING_CADDYFILE=$(mktemp -- "${CADDYFILE}.new.XXXXXX")
awk -v users_file="$USERS_FILE" '
    /# >>> PLGAMES_USERS_BEGIN/ {
        if (inside) exit 1
        print
        while ((read_status = (getline user_line < users_file)) > 0) print user_line
        if (read_status < 0) exit 1
        close(users_file)
        inside = 1
        next
    }
    /# <<< PLGAMES_USERS_END/ { if (!inside) exit 1; inside = 0 }
    !inside { print }
    END { if (inside) exit 1 }
' "$CADDYFILE" > "$PENDING_CADDYFILE"

# 5) пишем атомарно, сохраняя владельца и права: Caddy читает конфиг от своего
# юзера (naive2), а агент работает от root — без этого файл станет root:root 644,
# то есть либо Caddy не стартанёт, либо креды подписчиков станут видны всем в системе.
chown --reference="$CADDYFILE" "$PENDING_CADDYFILE"
chmod --reference="$CADDYFILE" "$PENDING_CADDYFILE"
mv -- "$PENDING_CADDYFILE" "$CADDYFILE"
PENDING_CADDYFILE=''

# 6) reload Caddy
if ! $RELOAD_CMD; then
    logger -t "$LOG_TAG" "reload command failed: $RELOAD_CMD"
    exit 1
fi

echo "$NEW_HASH" > "$STATE_DIR/users.sha"
N_USERS=$(jq -r '.users | length' "$TMP")
logger -t "$LOG_TAG" "synced $N_USERS users, caddy reloaded"

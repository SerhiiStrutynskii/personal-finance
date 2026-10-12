#!/bin/sh
# Оновлення застосунку на сервері: резервна копія, новий код, перезбирання, перевірка стану.
# Вручну з каталогу проєкту: ./scripts/deploy.sh [коміт]
# З GitHub Actions скрипт запускається як примусова команда SSH-ключа, а коміт приходить
# у SSH_ORIGINAL_COMMAND (див. docs/deploy.md, «Автоматичне оновлення»).
# Без коміту береться остання версія origin/main.
set -eu

# Увесь скрипт у функції: оболонка читає його цілком до запуску, тож git може замінити файл на ходу.
main() {
  cd "$(dirname "$0")/.."

  rev="${1:-${SSH_ORIGINAL_COMMAND:-}}"
  if [ -n "$rev" ]; then
    case "$rev" in
      *[!0-9a-f]*) fail "Очікується повний хеш коміту, отримано щось інше." ;;
    esac
    [ "${#rev}" -eq 40 ] || fail "Очікується повний хеш коміту (40 символів)."
  fi

  echo "==> Резервна копія бази"
  ./scripts/backup.sh

  echo "==> Новий код"
  git fetch --quiet origin main
  if [ -n "$rev" ]; then
    git merge-base --is-ancestor "$rev" origin/main || fail "Коміту $rev немає в origin/main."
  else
    rev="origin/main"
  fi
  # Лише перемотування вперед: локальні зміни на сервері чи старіший коміт нічого не зламають.
  git merge --ff-only "$rev"

  echo "==> Збирання й запуск"
  if ! docker compose up -d --build --wait --wait-timeout 300; then
    echo "==> Сервіси не запустилися. Останні рядки журналу app:" >&2
    docker compose logs --tail 50 app >&2 || true
    exit 1
  fi

  echo "==> Готово: $(git log -1 --format='%h %s')"
}

fail() {
  echo "$1" >&2
  exit 1
}

main "$@"

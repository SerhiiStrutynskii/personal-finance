#!/bin/sh
# Оновлення застосунку на сервері: резервна копія, новий код, готовий образ з GHCR, перевірка стану.
# Вручну з каталогу проєкту: ./scripts/deploy.sh [коміт]
# З GitHub Actions скрипт запускається як примусова команда SSH-ключа, а коміт приходить
# у SSH_ORIGINAL_COMMAND (див. docs/deploy.md, «Автоматичне оновлення»).
# Без коміту береться остання версія origin/main.
#
# Образ на сервері НЕ збирається: його збирає й публікує в GHCR джоб image у .github/workflows/ci.yml
# з тегом, що дорівнює повному хешу коміту. Сервер лише завантажує його.
# Для приватного репозиторію сервер має бути залогінений: docker login ghcr.io (токен з read:packages).
#
# Відкат на попередню версію: змінити IMAGE_TAG у .env на потрібний коміт і виконати
#   docker compose pull app && docker compose up -d --no-build --wait
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

  sha="$(git rev-parse HEAD)"
  image="$(image_name)"

  echo "==> Образ $image:$sha"
  set_env APP_IMAGE "$image"
  set_env IMAGE_TAG "$sha"
  if ! docker compose pull app; then
    fail "Не вдалося завантажити образ. Перевірте, що джоб «Build the Docker image» для цього коміту завершився успішно і що сервер залогінений у ghcr.io."
  fi

  echo "==> Запуск"
  if ! docker compose up -d --no-build --wait --wait-timeout 300; then
    echo "==> Сервіси не запустилися. Останні рядки журналу app:" >&2
    docker compose logs --tail 50 app >&2 || true
    exit 1
  fi

  # Старі образи застосунку лишаються тиждень — для відкату; давніші видаляються.
  docker image prune -af --filter "until=168h" >/dev/null 2>&1 || true

  echo "==> Готово: $(git log -1 --format='%h %s')"
}

# ghcr.io/<власник>/<репозиторій> малими літерами, з адреси origin
# (git@github.com:Owner/Repo.git або https://github.com/Owner/Repo.git).
image_name() {
  path="$(git remote get-url origin | sed -E 's#^(ssh://)?git@github\.com[:/]##; s#^https://github\.com/##; s#\.git$##')"
  case "$path" in
    */*) ;;
    *) fail "Не вдалося визначити репозиторій GitHub з адреси origin." ;;
  esac
  printf 'ghcr.io/%s\n' "$path" | tr '[:upper:]' '[:lower:]'
}

# Записує KEY=VALUE у .env, замінюючи попереднє значення. Права доступу до .env зберігаються.
set_env() {
  touch .env
  { grep -v "^$1=" .env || true; printf '%s=%s\n' "$1" "$2"; } > .env.tmp
  cat .env.tmp > .env
  rm -f .env.tmp
}

fail() {
  echo "$1" >&2
  exit 1
}

main "$@"
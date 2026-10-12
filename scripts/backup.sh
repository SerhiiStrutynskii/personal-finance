#!/bin/sh
# Резервна копія бази: стиснутий дамп у каталог backups поруч із docker-compose.yml.
# Запуск із каталогу проєкту на сервері: ./scripts/backup.sh
# Копії, старші за KEEP_DAYS днів (типово 14), видаляються.
set -eu

cd "$(dirname "$0")/.."
mkdir -p backups
umask 077

file="backups/personal_finance-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T db pg_dump -U personal_finance -d personal_finance --no-owner | gzip > "$file.tmp"
mv "$file.tmp" "$file"

find backups -name 'personal_finance-*.sql.gz' -mtime +"${KEEP_DAYS:-14}" -delete
echo "Збережено $file"

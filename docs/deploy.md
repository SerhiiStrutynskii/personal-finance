# Розгортання на сервері

Застосунок розгортається на одному сервері (VPS) через Docker Compose. Три контейнери:

- `db` — PostgreSQL, дані лежать у томі `db-data`;
- `app` — API, який роздає зібраний фронтенд із того самого домену й застосовує міграції під час старту;
- `caddy` — приймає запити на портах 80 і 443, сам отримує й оновлює HTTPS-сертифікат.

Файли: `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `.env.example`, `scripts/backup.sh`.

## Що потрібно

- Сервер з Ubuntu 22.04 або новішою, щонайменше 2 ГБ пам'яті (образ збирається на сервері).
- Домен або піддомен з A-записом на IP-адресу сервера. Без домену Caddy не отримає сертифікат,
  а без HTTPS токени входу передавалися б відкрито.
- Відкриті порти 22, 80 і 443; решта закриті.

## Перше розгортання

Усі команди виконуються на сервері.

1. Встановіть Docker за офіційною інструкцією: <https://docs.docker.com/engine/install/ubuntu/>.

2. Заберіть код. Для приватного репозиторію створіть на сервері ключ (`ssh-keygen -t ed25519`) і додайте
   його публічну частину в GitHub: Settings → Deploy keys (лише читання).

   ```sh
   git clone git@github.com:SerhiiStrutynskii/personal-finance.git
   cd personal-finance
   ```

3. Створіть файл налаштувань і заповніть його:

   ```sh
   cp .env.example .env
   nano .env
   ```

   - `DOMAIN` — ваш домен;
   - `POSTGRES_PASSWORD` — результат `openssl rand -hex 24`;
   - `JWT_SECRET` — результат `openssl rand -hex 48`;
   - `REGISTRATION_ENABLED=true` — тимчасово, щоб створити акаунти.

   Обмежте доступ до файлу: `chmod 600 .env`.

4. Запустіть:

   ```sh
   docker compose up -d --build
   docker compose ps
   ```

   Усі три сервіси мають бути `running`, а `db` і `app` — `healthy`. Перша збірка триває кілька хвилин.

5. Відкрийте `https://ваш-домен`, зареєструйте свої акаунти.

6. Закрийте реєстрацію: у `.env` поставте `REGISTRATION_ENABLED=false` і перезапустіть застосунок.

   ```sh
   docker compose up -d app
   ```

   Сторінка реєстрації зникне, а API відповідатиме `403 REGISTRATION_CLOSED`.

База починається порожньою: демо-користувача й тестових даних на сервері немає.

## Оновлення

```sh
cd personal-finance
./scripts/backup.sh
git pull
docker compose up -d --build
```

Нові міграції застосуються під час старту `app`. Якщо міграція не вдалася, контейнер не запуститься —
дивіться `docker compose logs app`.

Перед оновленням перевірте, що останній запуск CI в GitHub зелений: він проганяє лінтер, типи, тести
й збірку образу.

## Відкат

```sh
git log --oneline -5
git checkout <попередній коміт>
docker compose up -d --build
```

Міграції назад не відкочуються. Якщо нова версія змінила схему бази, відновіть базу з копії,
зробленої перед оновленням.

## Резервні копії

`./scripts/backup.sh` зберігає стиснутий дамп у `backups/` і видаляє копії, старші за 14 днів.

Щоденна копія о 03:30 — додайте рядок через `crontab -e`:

```
30 3 * * * cd /home/USER/personal-finance && ./scripts/backup.sh >> backups/backup.log 2>&1
```

Копії лежать на тому самому сервері, тому від втрати сервера не рятують. Забирайте їх на інший
комп'ютер, наприклад:

```sh
scp USER@ваш-домен:personal-finance/backups/personal_finance-*.sql.gz .
```

Відновлення з копії (поточні дані буде замінено):

```sh
docker compose stop app
docker compose exec -T db psql -U personal_finance -d postgres \
  -c 'DROP DATABASE personal_finance' -c 'CREATE DATABASE personal_finance OWNER personal_finance'
gunzip -c backups/personal_finance-РРРРММДД-ГГХХСС.sql.gz \
  | docker compose exec -T db psql -U personal_finance -d personal_finance
docker compose start app
```

Перевірте відновлення хоча б раз на тестовій копії: резервна копія, яку не пробували відновити,
нічого не гарантує.

## Корисні команди

```sh
docker compose logs -f app      # журнал застосунку
docker compose logs caddy       # сертифікати й запити
docker compose restart app      # перезапуск без перезбирання
docker compose down             # зупинити все; дані в томах лишаються
```

`docker compose down -v` видаляє томи разом із базою — не виконуйте цю команду на сервері з даними.

## Налаштування застосунку

| Змінна                 | Де задається | Призначення                                                                                 |
| ---------------------- | ------------ | ------------------------------------------------------------------------------------------- |
| `DOMAIN`               | `.env`       | Домен для Caddy й сертифіката                                                               |
| `POSTGRES_PASSWORD`    | `.env`       | Пароль бази; з нього складається `DATABASE_URL` застосунку                                  |
| `JWT_SECRET`           | `.env`       | Секрет підпису токенів; зміна розлогінить усіх користувачів                                 |
| `REGISTRATION_ENABLED` | `.env`       | `false` закриває реєстрацію; за замовчуванням у Compose — `false`                           |
| `WEB_DIST_DIR`         | `Dockerfile` | Каталог зібраного фронтенду, який роздає API                                                |
| `TRUST_PROXY`          | `Dockerfile` | `1`: перед застосунком один проксі (Caddy), тож обмеження спроб входу бачить адресу клієнта |

## Обмеження

- Лічильник невдалих спроб входу живе в пам'яті процесу: він скидається під час перезапуску й розрахований
  на один екземпляр застосунку.
- Образ збирається на сервері. Якщо пам'яті не вистачає, додайте файл підкачки або збирайте образ в іншому
  місці.
- Автоматичної викладки немає: оновлення — це `git pull` і `docker compose up -d --build` вручну.

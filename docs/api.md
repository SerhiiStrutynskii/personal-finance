# API

Базова адреса: `http://localhost:3000`. Формат — JSON. Спільні типи й zod-схеми —
`packages/shared/src/schemas.ts`.

## Авторизація

Усі маршрути `/api/*`, крім `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh` і
`/api/auth/logout`, потребують заголовка `Authorization: Bearer <accessToken>`.

- Access-токен — JWT (HS256), діє 15 хвилин.
- Refresh-токен — випадковий рядок, діє 30 днів і одноразовий: кожне оновлення видає нову пару.
  Повторне використання вже використаного токена відкликає всі токени цього входу.

Об'єкти:

- `CurrentUser`: `{ user: { id, email, name, timeZone }, household: { id, name, role } }`
- `AuthTokens`: `{ accessToken, refreshToken, expiresIn }` (`expiresIn` — секунди життя access-токена)
- `AuthSession`: `CurrentUser` разом з `AuthTokens`

| Метод | Шлях                 | Тіло                                        | Відповідь                                                                              |
| ----- | -------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| POST  | `/api/auth/register` | `{ email, password, name, householdName? }` | `201 AuthSession`; `409`, якщо email зайнятий                                          |
| POST  | `/api/auth/login`    | `{ email, password }`                       | `200 AuthSession`; `401` для невірних даних; `429` після 5 невдалих спроб за 15 хвилин |
| POST  | `/api/auth/refresh`  | `{ refreshToken }`                          | `200 AuthTokens`; `401` для невідомого, використаного чи простроченого токена          |
| POST  | `/api/auth/logout`   | `{ refreshToken }`                          | `204` завжди                                                                           |
| GET   | `/api/auth/me`       | —                                           | `200 CurrentUser`                                                                      |

Пароль — від 10 до 128 символів. Email зводиться до нижнього регістру. Реєстрація створює
користувача й окреме домогосподарство, у якому він `owner`; `householdName` за замовчуванням —
«Моє домогосподарство».

## Помилки

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "…",
    "issues": [{ "path": "amountMinor", "message": "…" }]
  }
}
```

| Статус | `code`             | Коли                                        |
| ------ | ------------------ | ------------------------------------------- |
| 400    | `VALIDATION_ERROR` | Дані не пройшли zod-схему (є `issues`)      |
| 400    | `BAD_REQUEST`      | Порушено правило домену або зіпсований JSON |
| 401    | `UNAUTHORIZED`     | Користувача не визначено                    |
| 404    | `NOT_FOUND`        | Запису немає в домогосподарстві користувача |
| 409    | `CONFLICT`         | Дублікат або запис використовується         |
| 500    | `INTERNAL_ERROR`   | Непередбачена помилка                       |

## Службове

`GET /health` → `{ "status": "ok" }` (без авторизації).

## Рахунки

Об'єкт: `{ id, name, type, currency, createdAt }`, де `type` — `card` \| `cash` \| `deposit`.

| Метод  | Шлях                | Тіло                                                            | Відповідь                       |
| ------ | ------------------- | --------------------------------------------------------------- | ------------------------------- |
| GET    | `/api/accounts`     | —                                                               | `200 { items: Account[] }`      |
| POST   | `/api/accounts`     | `{ name, type, currency? }` (`currency` за замовчуванням `UAH`) | `201 Account`                   |
| GET    | `/api/accounts/:id` | —                                                               | `200 Account`                   |
| PATCH  | `/api/accounts/:id` | `{ name?, type? }`, хоча б одне поле                            | `200 Account`                   |
| DELETE | `/api/accounts/:id` | —                                                               | `204`; `409`, якщо є транзакції |

## Категорії

Об'єкт: `{ id, name, kind, createdAt }`, де `kind` — `income` \| `expense`.

| Метод  | Шлях                  | Тіло             | Відповідь                           |
| ------ | --------------------- | ---------------- | ----------------------------------- |
| GET    | `/api/categories`     | —                | `200 { items: Category[] }`         |
| POST   | `/api/categories`     | `{ name, kind }` | `201 Category`; `409` для дубліката |
| GET    | `/api/categories/:id` | —                | `200 Category`                      |
| PATCH  | `/api/categories/:id` | `{ name }`       | `200 Category`; `409` для дубліката |
| DELETE | `/api/categories/:id` | —                | `204`; `409`, якщо використовується |

## Транзакції

Об'єкт:

```json
{
  "id": "…",
  "type": "expense",
  "accountId": "…",
  "toAccountId": null,
  "categoryId": "…",
  "amountMinor": 128450,
  "currency": "UAH",
  "description": "Супермаркет",
  "occurredAt": "2026-03-01T10:30:00.000Z",
  "createdAt": "…",
  "updatedAt": "…"
}
```

`amountMinor` — додатне ціле число мінімальних одиниць валюти (128450 = 1284,50 грн).

Тіло для створення й заміни:

- дохід або витрата: `{ type: "income" | "expense", accountId, categoryId?, amountMinor, currency?, description?, occurredAt }`
- переказ: `{ type: "transfer", accountId, toAccountId, amountMinor, currency?, description?, occurredAt }`

`occurredAt` — ISO 8601 із часовим поясом. `currency` за замовчуванням `UAH` і має збігатися з
валютою рахунку. Решта правил — у `docs/domain.md`.

| Метод  | Шлях                    | Відповідь                                            |
| ------ | ----------------------- | ---------------------------------------------------- |
| GET    | `/api/transactions`     | `200 { items: Transaction[], total, limit, offset }` |
| POST   | `/api/transactions`     | `201 Transaction`                                    |
| GET    | `/api/transactions/:id` | `200 Transaction`                                    |
| PUT    | `/api/transactions/:id` | `200 Transaction` (повна заміна)                     |
| DELETE | `/api/transactions/:id` | `204`                                                |

Параметри `GET /api/transactions`:

| Параметр     | Опис                                                       |
| ------------ | ---------------------------------------------------------- |
| `type`       | `income` \| `expense` \| `transfer`                        |
| `accountId`  | Транзакції рахунку; переказ знаходиться за обома рахунками |
| `categoryId` | Транзакції категорії                                       |
| `from`, `to` | Період за `occurredAt`: `from` включно, `to` виключно      |
| `limit`      | 1–200, за замовчуванням 50                                 |
| `offset`     | За замовчуванням 0                                         |

Сортування — від новіших до старіших.

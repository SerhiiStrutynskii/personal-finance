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

| Метод  | Шлях                  | Тіло             | Відповідь                                                     |
| ------ | --------------------- | ---------------- | ------------------------------------------------------------- |
| GET    | `/api/categories`     | —                | `200 { items: Category[] }`                                   |
| POST   | `/api/categories`     | `{ name, kind }` | `201 Category`; `409` для дубліката                           |
| GET    | `/api/categories/:id` | —                | `200 Category`                                                |
| PATCH  | `/api/categories/:id` | `{ name }`       | `200 Category`; `409` для дубліката                           |
| DELETE | `/api/categories/:id` | —                | `204`; `409`, якщо використовується в транзакціях або бюджеті |

## Транзакції

Об'єкт:

```json
{
  "id": "…",
  "type": "expense",
  "accountId": "…",
  "toAccountId": null,
  "categoryId": "…",
  "incomeLineId": null,
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

- витрата: `{ type: "expense", accountId, categoryId?, amountMinor, currency?, description?, occurredAt }`
- дохід: `{ type: "income", accountId, categoryId?, incomeLineId?, amountMinor, currency?, description?, occurredAt }`
- переказ: `{ type: "transfer", accountId, toAccountId, amountMinor, currency?, description?, occurredAt }`

`incomeLineId` — стаття доходу місячного бюджету; дохід має бути у валюті цього бюджету, а його
дата — у межах місяця бюджету, інакше `400`. Для витрат і переказів поле має бути відсутнім або `null`.

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

## Бюджети

Місячний бюджет домогосподарства. Усі суми — цілі числа в мінімальних одиницях валюти. Правила
розрахунків — у `docs/domain.md`. Кожен запит, що змінює бюджет, повертає `Budget` цілком.

Об'єкт `Budget`:

```json
{
  "id": "…",
  "month": "2026-10",
  "status": "active",
  "currency": "UAH",
  "periodStart": "2026-09-30T21:00:00.000Z",
  "periodEnd": "2026-10-31T22:00:00.000Z",
  "summary": {
    "plannedIncomeTotal": 6000000,
    "receivedIncomeTotal": 4500000,
    "plannedExpenseTotal": 5200000,
    "spentTotal": 3100000,
    "plannedBalance": 800000,
    "actualBalance": 1400000
  },
  "incomeLines": [
    { "id": "…", "name": "Зарплата", "planned": 5000000, "received": 4500000, "diff": -500000 }
  ],
  "expenseLines": [
    {
      "id": "…",
      "categoryId": "…",
      "categoryName": "Продукти",
      "planned": 1200000,
      "spent": 1350000,
      "remaining": -150000,
      "usage": 1.125,
      "status": "over"
    }
  ],
  "unplannedExpenses": [
    { "categoryId": "…", "categoryName": "Подарунки", "spent": 80000, "status": "over" }
  ],
  "otherIncome": 0
}
```

- `status` бюджету — `draft` \| `active` \| `closed`; `status` рядка — `over` \| `surplus` \| `neutral`.
- `usage` — частка використаного ліміту; `null`, якщо ліміт 0, а витрати є.
- `unplannedExpenses[].categoryId` — `null` для витрат без категорії.

| Метод  | Шлях                                     | Тіло                            | Відповідь                                                                              |
| ------ | ---------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| GET    | `/api/budgets?month=YYYY-MM`             | —                               | `200 Budget`; `404`, якщо бюджету на місяць немає                                      |
| POST   | `/api/budgets`                           | `{ month, copyFrom? }`          | `201 Budget`; `409` на дубль місяця; `404`, якщо бюджету місяця `copyFrom` немає       |
| PATCH  | `/api/budgets/:id`                       | `{ status }`                    | `200 Budget`                                                                           |
| POST   | `/api/budgets/:id/income-lines`          | `{ name, plannedAmount }`       | `201 Budget`                                                                           |
| PATCH  | `/api/budgets/:id/income-lines/:lineId`  | `{ name?, plannedAmount? }`     | `200 Budget`                                                                           |
| DELETE | `/api/budgets/:id/income-lines/:lineId`  | —                               | `200 Budget`; транзакції статті переходять в «Інші доходи»                             |
| POST   | `/api/budgets/:id/expense-lines`         | `{ categoryId, plannedAmount }` | `201 Budget`; `409`, якщо ліміт на категорію вже є; `400`, якщо це не категорія витрат |
| PATCH  | `/api/budgets/:id/expense-lines/:lineId` | `{ plannedAmount }`             | `200 Budget`                                                                           |
| DELETE | `/api/budgets/:id/expense-lines/:lineId` | —                               | `200 Budget`                                                                           |

`copyFrom` копіює статті доходів і витрат з іншого місяця; транзакції не копіюються. Будь-яка зміна
статей закритого бюджету — `409`. Чужий бюджет — `404`. Фактичні записи додаються через
`/api/transactions`.

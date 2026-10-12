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

| Статус | `code`                   | Коли                                        |
| ------ | ------------------------ | ------------------------------------------- |
| 400    | `VALIDATION_ERROR`       | Дані не пройшли zod-схему (є `issues`)      |
| 400    | `BAD_REQUEST`            | Порушено правило домену або зіпсований JSON |
| 401    | `UNAUTHORIZED`           | Користувача не визначено                    |
| 404    | `NOT_FOUND`              | Запису немає в домогосподарстві користувача |
| 409    | `CONFLICT`               | Дублікат або запис використовується         |
| 422    | `EXPENSE_DATE_IN_FUTURE` | Видаток на майбутню дату                    |
| 422    | `BUDGET_PERIOD_CLOSED`   | Створення бюджету для місяця, що минув      |
| 500    | `INTERNAL_ERROR`         | Непередбачена помилка                       |

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
  "occurrenceId": null,
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
- дохід: `{ type: "income", accountId, categoryId?, occurrenceId?, amountMinor, currency?, description?, occurredAt }`
- переказ: `{ type: "transfer", accountId, toAccountId, amountMinor, currency?, description?, occurredAt }`

`occurrenceId` — надходження періодичного доходу, яке оплачує ця транзакція; валюта має збігатися з
валютою джерела. Для витрат і переказів поле має бути відсутнім або `null`.

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

| Параметр       | Опис                                                       |
| -------------- | ---------------------------------------------------------- |
| `type`         | `income` \| `expense` \| `transfer`                        |
| `accountId`    | Транзакції рахунку; переказ знаходиться за обома рахунками |
| `categoryId`   | Транзакції категорії                                       |
| `occurrenceId` | Платежі одного надходження періодичного доходу             |
| `from`, `to`   | Період за `occurredAt`: `from` включно, `to` виключно      |
| `limit`        | 1–200, за замовчуванням 50                                 |
| `offset`       | За замовчуванням 0                                         |

Сортування — від новіших до старіших.

### Обмеження дати видатку

Правило діє для всього застосунку, а не лише для екрана бюджету: видаток можна створити чи
перенести на будь-яку дату до цієї миті включно, зокрема в минулі місяці, але не в майбутнє.
Видатки минулих місяців можна змінювати й видаляти.

Порушення — `422 EXPENSE_DATE_IN_FUTURE`. Доходів і переказів правило не стосується. Межу дає
`getAllowedExpenseDateRange` з `packages/shared`.

## Бюджети

Бюджет — план лімітів витрат по категоріях на місяць і зведення фактичних даних за цей місяць.
Фактичних записів він не зберігає: витрати рахуються з видатків за період, доходи бере з фічі
доходів. Усі суми — цілі числа в мінімальних одиницях валюти. Правила — у `docs/domain.md`.
Кожен запит, що змінює бюджет, повертає `Budget` цілком.

Об'єкт `Budget`:

```json
{
  "id": "…",
  "month": "2026-10",
  "currency": "UAH",
  "periodState": "current",
  "canAddExpense": true,
  "canEditLimits": true,
  "periodStart": "2026-09-30T21:00:00.000Z",
  "periodEnd": "2026-10-31T22:00:00.000Z",
  "summary": {
    "plannedIncomeTotal": 6000000,
    "receivedIncomeTotal": 5250000,
    "plannedExpenseTotal": 5200000,
    "spentTotal": 3180000,
    "plannedBalance": 800000,
    "actualBalance": 2070000
  },
  "incomes": {
    "occurrences": [
      {
        "name": "Зарплата",
        "plannedDate": "2026-10-05",
        "plannedAmount": 4500000,
        "actualAmount": 4500000,
        "status": "received"
      }
    ],
    "oneTimeTotal": 750000
  },
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
  ]
}
```

- `periodState` — `past` \| `current` \| `future`; обчислюється відносно поточного моменту, у базі не
  зберігається.
- `canAddExpense` (лише `current`) і `canEditLimits` (`current` і `future`) обчислює бекенд. Це
  підказки для інтерфейсу; самі правила перевіряють endpoint-и.
- `status` рядка — `over` \| `surplus` \| `neutral`.
- `usage` — частка використаного ліміту; `null`, якщо ліміт 0, а витрати є.
- `unplannedExpenses[].categoryId` — `null` для витрат без категорії.
- `plannedIncomeTotal`, `receivedIncomeTotal` і блок `incomes` — дані доходів того ж місяця
  (`GET /api/incomes`). Статей доходу в бюджеті немає.

| Метод  | Шлях                                     | Тіло                             | Відповідь                                                                                                                        |
| ------ | ---------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/budgets?month=YYYY-MM`             | —                                | `200 Budget`; `404`, якщо бюджету на місяць немає                                                                                |
| POST   | `/api/budgets`                           | `{ month, copyFrom? }`           | `201 Budget`; `409` на дубль місяця; `422 BUDGET_PERIOD_CLOSED` для минулого місяця; `404`, якщо бюджету місяця `copyFrom` немає |
| POST   | `/api/budgets/:id/expense-lines`         | `{ categoryId, plannedAmount }`  | `201 Budget`; `409`, якщо ліміт на категорію вже є; `400`, якщо це не категорія витрат                                           |
| PATCH  | `/api/budgets/:id/expense-lines/:lineId` | `{ plannedAmount?, sortOrder? }` | `200 Budget`                                                                                                                     |
| DELETE | `/api/budgets/:id/expense-lines/:lineId` | —                                | `200 Budget`                                                                                                                     |

`copyFrom` копіює лише ліміти, зокрема з місяця, що вже минув. Зміна лімітів минулого бюджету — `409`.
Чужий бюджет — `404`. Видатки створюються через `POST /api/transactions` з `type = expense`;
окремого endpoint-у для видатків із бюджету немає.

## Доходи

Періодичні доходи задаються джерелами з правилом повторення; кожне очікуване надходження — окремий
запис із запланованими датою й сумою. Разовий дохід — звичайна транзакція доходу. Усі суми — цілі
числа в мінімальних одиницях валюти, дати — `YYYY-MM-DD` у часовому поясі домогосподарства. Доходи
підтримуються лише у валюті `UAH`. Правила — у `docs/domain.md`.

### Джерела доходу

Об'єкт `IncomeSource`:
`{ id, name, accountId, currency, plannedAmount, frequency, dayOfMonth, dayOfWeek, intervalMonths, startDate, endDate, isActive }`.

- `frequency` — `monthly` \| `weekly` \| `biweekly` \| `every_n_months`.
- `dayOfMonth` (1–31) обов'язковий для `monthly` і `every_n_months`; `dayOfWeek` (1–7, понеділок = 1) —
  для `weekly` і `biweekly`; `intervalMonths` — для `every_n_months`. Зайві для частоти поля відкидаються.
- `endDate` — необов'язковий, включно.

| Метод  | Шлях                                 | Тіло                                                                                                           | Відповідь                                                                               |
| ------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| GET    | `/api/income-sources`                | —                                                                                                              | `200 { items: IncomeSource[] }`                                                         |
| POST   | `/api/income-sources`                | `{ name, accountId, plannedAmount, frequency, dayOfMonth?, dayOfWeek?, intervalMonths?, startDate, endDate? }` | `201 IncomeSource`; `400`, якщо рахунок чужий або не в `UAH`                            |
| PATCH  | `/api/income-sources/:id`            | будь-які з полів створення                                                                                     | `200 IncomeSource`; зміна суми чи графіка перегенеровує майбутні неотримані надходження |
| POST   | `/api/income-sources/:id/deactivate` | —                                                                                                              | `200 IncomeSource`; майбутні неотримані надходження видаляються                         |
| DELETE | `/api/income-sources/:id`            | —                                                                                                              | `204`; `409`, якщо є отримані доходи                                                    |

### Доходи місяця

`GET /api/incomes?month=YYYY-MM` створює відсутні надходження активних джерел за цей місяць (не далі
ніж на рік уперед) і повертає:

```json
{
  "month": "2026-10",
  "currency": "UAH",
  "today": "2026-10-11",
  "summary": {
    "plannedTotal": 6000000,
    "receivedTotal": 5250000,
    "receivedRecurring": 4500000,
    "oneTimeTotal": 750000,
    "expectedRemaining": 1500000,
    "counts": { "received": 1, "partial": 0, "pending": 1, "overdue": 0, "skipped": 0 }
  },
  "occurrences": [
    {
      "id": "…",
      "sourceId": "…",
      "name": "Зарплата",
      "accountId": "…",
      "plannedDate": "2026-10-05",
      "plannedAmount": 4500000,
      "actualDate": "2026-10-05",
      "actualAmount": 4500000,
      "status": "received",
      "diff": 0
    }
  ],
  "oneTime": [
    {
      "transactionId": "…",
      "name": "Продаж велосипеда",
      "date": "2026-10-09",
      "amount": 750000,
      "status": "received"
    }
  ]
}
```

- `status` надходження — `received` \| `partial` \| `pending` \| `overdue` \| `skipped`; його рахує бекенд.
- `diff` (отримано мінус заплановано) є лише в отриманих надходжень.
- Надходження належить до місяця за `plannedDate`, а суми `received*` рахуються за датою транзакцій.

| Метод | Шлях                                  | Тіло                                                                 | Відповідь                                                                       |
| ----- | ------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| PATCH | `/api/income-occurrences/:id`         | `{ plannedDate?, plannedAmount?, status?: "expected" \| "skipped" }` | `200` надходження; `409`, якщо в джерела вже є надходження на цю дату           |
| POST  | `/api/income-occurrences/:id/receive` | `{ amount?, date?, accountId? }`                                     | `201 Transaction`; за замовчуванням запланована сума, сьогодні, рахунок джерела |
| POST  | `/api/incomes/one-time`               | `{ amount, date, accountId, name, categoryId? }`                     | `201 Transaction`                                                               |

`receive` можна викликати кілька разів — так записуються часткові виплати; пропущене надходження
після `receive` знову стає очікуваним. Фактичні записи змінюються й видаляються через
`/api/transactions/:id`; платежі одного надходження — `GET /api/transactions?occurrenceId=…`.

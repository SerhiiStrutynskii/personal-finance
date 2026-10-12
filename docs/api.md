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

| Статус | `code`                        | Коли                                                                        |
| ------ | ----------------------------- | --------------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`            | Дані не пройшли zod-схему (є `issues`)                                      |
| 400    | `BAD_REQUEST`                 | Порушено правило домену або зіпсований JSON                                 |
| 401    | `UNAUTHORIZED`                | Користувача не визначено                                                    |
| 404    | `NOT_FOUND`                   | Запису немає в домогосподарстві користувача                                 |
| 409    | `CONFLICT`                    | Дублікат або запис використовується                                         |
| 422    | `EXPENSE_DATE_IN_FUTURE`      | Видаток або рух по боргу на майбутню дату                                   |
| 422    | `CURRENCY_MISMATCH`           | Рахунок не у валюті боргу                                                   |
| 422    | `DEBT_TYPE_MISMATCH`          | Рух не того типу боргу: платіж по кредитці чи переказ на позику             |
| 422    | `SAME_ACCOUNT`                | Погашення кредитки з неї самої                                              |
| 422    | `EARLY_REPAYMENT_NOT_ALLOWED` | Достроковий платіж без підтвердження, коли умови боргу його не передбачають |
| 422    | `BUDGET_PERIOD_CLOSED`        | Створення бюджету для місяця, що минув                                      |
| 500    | `INTERNAL_ERROR`              | Непередбачена помилка                                                       |

## Службове

`GET /health` → `{ "status": "ok" }` (без авторизації).

## Рахунки

Об'єкт: `{ id, name, type, currency, balance, creditLimit, isArchived, createdAt }`.

- `type` — `card` \| `cash` \| `deposit` \| `credit_card`. Рахунок `credit_card` створюється лише разом
  із боргом (`POST /api/debts`); через `/api/accounts` його не створити, а тип — не змінити.
- `balance` — баланс із транзакцій рахунку в мінімальних одиницях; може бути від'ємним. Для кредитної
  картки від'ємний баланс — це борг.
- `creditLimit` — кредитний ліміт; `null` для всіх типів, крім `credit_card`.
- `isArchived` — архівний рахунок лишається в історії, але нових транзакцій не приймає (`400`).

| Метод  | Шлях                | Тіло                                                            | Відповідь                                                |
| ------ | ------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| GET    | `/api/accounts`     | —                                                               | `200 { items: Account[] }`                               |
| POST   | `/api/accounts`     | `{ name, type, currency? }` (`currency` за замовчуванням `UAH`) | `201 Account`                                            |
| GET    | `/api/accounts/:id` | —                                                               | `200 Account`                                            |
| PATCH  | `/api/accounts/:id` | `{ name?, type? }`, хоча б одне поле                            | `200 Account`                                            |
| DELETE | `/api/accounts/:id` | —                                                               | `204`; `409`, якщо є транзакції, джерела доходу або борг |

## Категорії

Об'єкт: `{ id, name, kind, systemKey, createdAt }`, де `kind` — `income` \| `expense`.

`systemKey` — `debt_repayment` («Погашення боргів») \| `interest_fees` («Відсотки та комісії») для
системних категорій і `null` для звичайних. Системні категорії створює застосунок за першої потреби;
перейменувати чи видалити їх не можна (`409`).

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
  "debtId": null,
  "amountMinor": 128450,
  "currency": "UAH",
  "description": "Супермаркет",
  "occurredAt": "2026-03-01T10:30:00.000Z",
  "createdAt": "…",
  "updatedAt": "…"
}
```

`amountMinor` — додатне ціле число мінімальних одиниць валюти (128450 = 1284,50 грн).

`type` у відповіді може бути також службовим: `debt_payment` (платіж по позиці чи розстрочці, з
`debtId`) або `balance_adjustment` (початковий борг чи звірка кредитки; сума знакова й додається до
балансу рахунку як є). Службові транзакції створюються, змінюються й видаляються лише через
`/api/debts`: `POST`, `PUT` і `DELETE` у `/api/transactions` для них дають `400`.

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

| Параметр       | Опис                                                                          |
| -------------- | ----------------------------------------------------------------------------- |
| `type`         | `income` \| `expense` \| `transfer` \| `debt_payment` \| `balance_adjustment` |
| `accountId`    | Транзакції рахунку; переказ знаходиться за обома рахунками                    |
| `categoryId`   | Транзакції категорії                                                          |
| `occurrenceId` | Платежі одного надходження періодичного доходу                                |
| `from`, `to`   | Період за `occurredAt`: `from` включно, `to` виключно                         |
| `limit`        | 1–200, за замовчуванням 50                                                    |
| `offset`       | За замовчуванням 0                                                            |

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

У `spent` ідуть транзакції типів `expense` і `debt_payment` (платежі по позиках — у категорії
«Погашення боргів»). Перекази, зокрема погашення кредитки, і `balance_adjustment` не враховуються.
Новий бюджет без `copyFrom` одразу отримує ліміт «Погашення боргів» на суму щомісячних платежів
активних позик і розстрочок, якщо вони є.

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

## Борги

Кредитні картки, розстрочки й позики. Усі суми — цілі числа в мінімальних одиницях валюти, дати —
`YYYY-MM-DD` у часовому поясі домогосподарства. Борги підтримуються лише у валюті `UAH`. Правила — у
`docs/domain.md`.

Кредитна картка — це борг і рахунок водночас: її залишок — від'ємний баланс рахунку-картки, а рухи —
звичайні транзакції цього рахунку. Позики й розстрочки ведуться записами боргу.

Об'єкт `Debt`:

```json
{
  "id": "…",
  "name": "Кредитка",
  "description": null,
  "type": "credit_card",
  "status": "active",
  "accountId": "…",
  "currency": "UAH",
  "initialAmount": 0,
  "startDate": "2026-09-01",
  "maturityDate": null,
  "interestRate": 3.1,
  "ratePeriod": "month",
  "monthlyPayment": 120000,
  "paymentDay": 25,
  "earlyRepaymentAllowed": true,
  "defaultAccountId": null,
  "balance": 2340000,
  "card": {
    "creditLimit": 5000000,
    "available": 2660000,
    "usage": 0.468,
    "overLimitBy": 0,
    "nearLimit": false
  },
  "month": { "dueDate": "2026-10-25", "required": 120000, "paid": 0, "status": "pending" },
  "projection": {
    "months": 31,
    "payoffDate": "2029-04-25",
    "totalInterest": 1410000,
    "paymentCoversInterest": true,
    "maturityWarning": null,
    "assumesNoNewPurchases": true
  }
}
```

- `type` — `credit_card` \| `installment` \| `mfo_loan` \| `bank_loan`; `status` — `active` \| `closed`.
- `ratePeriod` — `year` \| `month` \| `day`; `interestRate` — відсотки, до чотирьох знаків після коми.
- `accountId` і `card` — лише в кредитної картки; `card.available` від'ємне, якщо ліміт перевищено,
  `nearLimit` — використано 90% ліміту або більше.
- `month` — платіж запитаного місяця; `status` — `none` \| `paid` \| `partial` \| `due_soon` \|
  `pending` \| `overdue`. Рахує бекенд.
- `projection` — прогноз від найближчого ще не внесеного платежу. `months`, `payoffDate` і
  `totalInterest` дорівнюють `null`, якщо борг не погашається; `maturityWarning.requiredPayment` —
  мінімальний платіж, щоб встигнути до `maturityDate`.

| Метод  | Шлях                       | Тіло                  | Відповідь                                                                                   |
| ------ | -------------------------- | --------------------- | ------------------------------------------------------------------------------------------- |
| GET    | `/api/debts?month=YYYY-MM` | —                     | `200 { month, currency, today, summary, debts: Debt[] }`; `month` за замовчуванням поточний |
| POST   | `/api/debts`               | див. нижче            | `201 Debt`                                                                                  |
| GET    | `/api/debts/:id?month=…`   | —                     | `200 DebtDetails`                                                                           |
| PATCH  | `/api/debts/:id`           | будь-які з умов боргу | `200 Debt`                                                                                  |
| POST   | `/api/debts/:id/close`     | —                     | `200 Debt`; `409`, якщо залишок не нульовий                                                 |
| DELETE | `/api/debts/:id`           | —                     | `204`; `409`, якщо в боргу є рухи                                                           |

`summary` — `{ totalBalance, totalMonthlyPayments, weightedAnnualRate, dueThisMonth, debtFreeDate,
totalCreditAvailable }` за активними боргами. Список відсортовано за датою платежу, закриті борги — в
кінці.

Тіло `POST /api/debts`:
`{ name, type, description?, initialAmount, startDate, maturityDate?, interestRate, ratePeriod,
monthlyPayment, paymentDay, earlyRepaymentAllowed?, defaultAccountId?, creditLimit?, existingAccountId? }`.

- `maturityDate` обов'язкова для всіх типів, крім `credit_card`, і має бути пізніше за `startDate`.
- `creditLimit` обов'язковий тоді й лише тоді, коли тип `credit_card`.
- `startDate` може бути в минулому, але не в майбутньому (`400`).
- Кредитна картка атомарно створює рахунок-картку з назвою боргу й, якщо `initialAmount > 0`,
  транзакцію `balance_adjustment` на `-initialAmount` з датою `startDate`.
- `existingAccountId` перетворює наявний рахунок на рахунок-картку: борг дорівнює його поточному
  від'ємному балансу, тому `initialAmount` має бути 0. Рахунок, уже прив'язаний до боргу, — `409`.
- Порушення цих правил схеми — `400 VALIDATION_ERROR`, як і в решті API.

`PATCH` змінює умови (`name`, `description`, `maturityDate`, `interestRate`, `ratePeriod`,
`monthlyPayment`, `paymentDay`, `earlyRepaymentAllowed`, `defaultAccountId`, для кредитки —
`creditLimit`) і не змінює історію; тип, `initialAmount` і `startDate` не змінюються. Закриття
кредитки архівує рахунок-картку. Позика закривається сама, коли залишок стає нульовим, і відкривається
знову з новим нарахуванням; кредитка з нульовим боргом лишається активною.

`DebtDetails` — це `Debt` плюс `viewedMonth`, `today`, `entries` (записи позики:
`{ id, kind, amount, principalPart, interestPart, accountId, date, note }`, `kind` — `payment` \|
`charge` \| `adjustment`) і `transactions` (останні 200 транзакцій рахунку-картки). У позики порожній
`transactions`, у кредитки — `entries`.

### Рухи

| Метод  | Шлях                                      | Тіло                                                                        | Відповідь            |
| ------ | ----------------------------------------- | --------------------------------------------------------------------------- | -------------------- |
| POST   | `/api/debts/:id/payments`                 | `{ accountId, amount, date, principalPart?, interestPart?, confirmEarly? }` | `201 DebtDetails`    |
| POST   | `/api/debts/:id/charges`                  | `{ amount, date, note? }`                                                   | `201 DebtDetails`    |
| DELETE | `/api/debts/:id/entries/:entryId`         | —                                                                           | `204`                |
| GET    | `/api/debts/:id/payment-preview?amount=…` | —                                                                           | `200 PaymentPreview` |
| POST   | `/api/debts/:id/card-payments`            | `{ fromAccountId, amount, date }`                                           | `201 DebtDetails`    |
| POST   | `/api/debts/:id/card-fees`                | `{ amount, date, note? }`                                                   | `201 DebtDetails`    |
| POST   | `/api/debts/:id/adjustments`              | `{ actualBalance, note? }`                                                  | `201 DebtDetails`    |

- `payments`, `charges`, `entries` і `payment-preview` — лише для позик і розстрочок; `card-payments` і
  `card-fees` — лише для кредиток. Інакше — `422 DEBT_TYPE_MISMATCH`.
- Платіж створює транзакцію `debt_payment` рахунку (категорія «Погашення боргів») і запис боргу в одній
  транзакції БД; видалення запису видаляє й транзакцію. Без `principalPart` та `interestPart` розбивка
  пропонується за ставкою; якщо вони задані, їхня сума має дорівнювати `amount`. Тіло платежу не може
  перевищувати залишок (`400`), погашений борг платежів не приймає (`409`).
- Платіж достроковий, якщо разом із ним за місяць сплачено більше за `month.required`. Коли
  `earlyRepaymentAllowed = false`, такий платіж потребує `confirmEarly: true`, інакше —
  `422 EARLY_REPAYMENT_NOT_ALLOWED`.
- Нестача коштів на рахунку платіж не блокує: застосунок фіксує факт, а не проводить оплату.
- `card-payments` створює переказ на рахунок-картку, `card-fees` — видаток з картки в категорії
  «Відсотки та комісії». Покупки з кредитки — звичайні видатки (`POST /api/transactions`) з рахунком
  картки; перевищення ліміту їх не блокує.
- `adjustments` — звірка поточною датою: для позики зберігає запис із різницею, для кредитки —
  транзакцію `balance_adjustment`. Якщо залишок збігається, нічого не записується.
- Рух можна внести на будь-яку дату до сьогодні включно, але не раніше за `startDate` позики; майбутня
  дата — `422 EXPENSE_DATE_IN_FUTURE`.
- Рахунок не в `UAH` — `422 CURRENCY_MISMATCH`; чужий або невідомий рахунок чи борг — `404`; погашення
  кредитки з неї самої — `422 SAME_ACCOUNT`.

`PaymentPreview`: `{ amount, principalPart, interestPart, isEarly, requiresConfirmation, balanceAfter,
projection, interestSaved }` — розбивка платежу на сьогодні й прогноз після нього.

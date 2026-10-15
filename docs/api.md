# API

Базова адреса: `http://localhost:3000`. Формат — JSON. Спільні типи й zod-схеми —
`packages/shared/src/schemas.ts`.

## Авторизація

Усі маршрути `/api/*`, крім `/api/auth/config`, `/api/auth/register`, `/api/auth/login`,
`/api/auth/refresh` і `/api/auth/logout`, потребують заголовка `Authorization: Bearer <accessToken>`.

- Access-токен — JWT (HS256), діє 15 хвилин.
- Refresh-токен — випадковий рядок, діє 30 днів і одноразовий: кожне оновлення видає нову пару.
  Повторне використання вже використаного токена відкликає всі токени цього входу.

Об'єкти:

- `CurrentUser`: `{ user: { id, email, name, timeZone }, household: { id, name, role } }`
- `AuthTokens`: `{ accessToken, refreshToken, expiresIn }` (`expiresIn` — секунди життя access-токена)
- `AuthSession`: `CurrentUser` разом з `AuthTokens`

| Метод | Шлях                 | Тіло                                        | Відповідь                                                                                         |
| ----- | -------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| GET   | `/api/auth/config`   | —                                           | `200 { registrationEnabled }` — чи відкрита реєстрація на цьому сервері                           |
| POST  | `/api/auth/register` | `{ email, password, name, householdName? }` | `201 AuthSession`; `409`, якщо email зайнятий; `403 REGISTRATION_CLOSED`, якщо реєстрацію закрито |
| POST  | `/api/auth/login`    | `{ email, password }`                       | `200 AuthSession`; `401` для невірних даних; `429` після 5 невдалих спроб за 15 хвилин            |
| POST  | `/api/auth/refresh`  | `{ refreshToken }`                          | `200 AuthTokens`; `401` для невідомого, використаного чи простроченого токена                     |
| POST  | `/api/auth/logout`   | `{ refreshToken }`                          | `204` завжди                                                                                      |
| GET   | `/api/auth/me`       | —                                           | `200 CurrentUser`                                                                                 |

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

| Статус | `code`                        | Коли                                                                                          |
| ------ | ----------------------------- | --------------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`            | Дані не пройшли zod-схему (є `issues`)                                                        |
| 400    | `BAD_REQUEST`                 | Порушено правило домену або зіпсований JSON                                                   |
| 401    | `UNAUTHORIZED`                | Користувача не визначено                                                                      |
| 403    | `REGISTRATION_CLOSED`         | Реєстрацію нових користувачів закрито налаштуванням сервера                                   |
| 404    | `NOT_FOUND`                   | Запису немає в домогосподарстві користувача                                                   |
| 409    | `CONFLICT`                    | Дублікат або запис використовується                                                           |
| 422    | `EXPENSE_DATE_IN_FUTURE`      | Видаток, рух по боргу або поповнення цілі на майбутню дату                                    |
| 422    | `CURRENCY_MISMATCH`           | Рахунок не у валюті боргу чи цілі                                                             |
| 422    | `DEBT_TYPE_MISMATCH`          | Рух не того типу боргу: платіж по кредитці чи переказ на позику                               |
| 422    | `SAME_ACCOUNT`                | Погашення кредитки чи поповнення цілі з того самого рахунку                                   |
| 422    | `EARLY_REPAYMENT_NOT_ALLOWED` | Достроковий платіж без підтвердження, коли умови боргу його не передбачають                   |
| 422    | `GOAL_KIND_MISMATCH`          | Дія не для цього виду цілі: поповнення цілі виходу з боргів чи план погашення для накопичення |
| 422    | `BUDGET_PERIOD_CLOSED`        | Створення бюджету для місяця, що минув                                                        |
| 500    | `INTERNAL_ERROR`              | Непередбачена помилка                                                                         |

## Службове

`GET /health` → `{ "status": "ok" }` (без авторизації).

## Головна

`GET /api/dashboard` → `200 Dashboard` — зведення поточного місяця (у часовому поясі домогосподарства)
для головної сторінки. Лише читання: числа й статуси беруться з рахунків, аналітики, доходів, боргів і
цілей. Правила — у `docs/domain.md`.

```json
{
  "month": "2026-10",
  "today": "2026-10-12",
  "currency": "UAH",
  "setup": { "hasAccounts": true, "hasTransactions": true, "hasBudget": true },
  "money": {
    "netWorth": 12400000,
    "accountsTotal": 13400000,
    "debtTotal": 3340000,
    "accounts": [
      { "id": "…", "name": "Картка", "type": "card", "currency": "UAH", "balance": 4200000 }
    ]
  },
  "monthSummary": {
    "income": 6000000,
    "expenses": 3180000,
    "net": 2820000,
    "plannedExpenseTotal": 5200000,
    "projected": 8215000,
    "daysElapsed": 12,
    "daysInMonth": 31
  },
  "plan": {
    "plannedIncome": 6000000,
    "plannedExpenses": 5200000,
    "balance": 800000,
    "state": "balanced"
  },
  "debtPayments": { "required": 390000, "paid": 270000, "remaining": 120000 },
  "attention": [
    { "kind": "debt_overdue", "id": "…", "name": "Позика", "amount": 100000, "date": "2026-10-10" }
  ],
  "upcoming": [
    { "kind": "income", "id": "…", "name": "Аванс", "amount": 1500000, "date": "2026-10-15" }
  ],
  "goals": [],
  "recent": [
    {
      "id": "…",
      "type": "expense",
      "description": "Супермаркет",
      "categoryName": "Продукти",
      "accountName": "Картка",
      "amountMinor": 128450,
      "currency": "UAH",
      "occurredAt": "2026-10-11T10:30:00.000Z"
    }
  ]
}
```

- `money.accountsTotal` — сума балансів рахунків у гривні; `netWorth` — вона ж мінус залишки активних
  позик і розстрочок; `debtTotal` — усі борги разом із кредитками. `accounts` — неархівні рахунки.
- `monthSummary.plannedExpenseTotal` — сума лімітів бюджету; `null`, якщо бюджету на місяць немає.
- `plan` — план місяця: `plannedIncome` — планова сума надходжень (`plannedTotal` доходів),
  `plannedExpenses` — сума лімітів, `balance` — їхня різниця, `state` — `balanced` (витрати не більші
  за доходи) або `deficit`. Без бюджету `plannedExpenses`, `balance` і `state` дорівнюють `null`.
- `debtPayments` — обов'язкові платежі місяця по активних боргах, зокрема мінімальні по кредитках:
  `required` — сума платежів, `paid` — сплачене з них, `remaining` — решта (те саме, що `dueThisMonth`
  огляду боргів). Борг, перший платіж якого ще не настав, сюди не входить.
- `attention[].kind` — `debt_overdue` \| `income_overdue` \| `budget_over` \| `goal_overdue` \|
  `debt_due_soon` \| `goal_behind`, у цьому порядку. `id` — борг, надходження чи ціль; для
  `budget_over` — категорія або `null`. `amount` і `date` можуть бути `null`.
- `upcoming` — платежі по боргах (`debt_payment`) і надходження (`income`) від сьогодні до кінця місяця,
  за датою; прострочене сюди не входить.
- `goals` — не більше трьох активних цілей, як у `GET /api/goals`.
- `recent` — не більше п'яти останніх витрат, доходів і платежів по боргах; перекази й службові зміни
  балансу не показуються.

## Рахунки

Об'єкт: `{ id, name, type, currency, balance, creditLimit, isArchived, createdAt }`.

- `type` — `card` \| `cash` \| `deposit` \| `credit_card`. Рахунок `credit_card` створюється лише разом
  із боргом (`POST /api/debts`); через `/api/accounts` його не створити, а тип — не змінити.
- `balance` — баланс із транзакцій рахунку в мінімальних одиницях; може бути від'ємним. Для кредитної
  картки від'ємний баланс — це борг.
- `creditLimit` — кредитний ліміт; `null` для всіх типів, крім `credit_card`.
- `isArchived` — архівний рахунок лишається в історії, але нових транзакцій не приймає (`400`).
- `openingBalance` (лише під час створення, необов'язкове) — гроші на рахунку в момент створення,
  ціле невід'ємне число мінімальних одиниць, за замовчуванням 0. Якщо більше за 0, разом із рахунком
  створюється транзакція `balance_adjustment` з описом «Початковий залишок» і поточним моментом.
  Вона змінює баланс, але не є ні доходом, ні витратою. Змінити її пізніше не можна.

| Метод  | Шлях                | Тіло                                                                             | Відповідь                                                                           |
| ------ | ------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| GET    | `/api/accounts`     | —                                                                                | `200 { items: Account[] }`                                                          |
| POST   | `/api/accounts`     | `{ name, type, currency?, openingBalance? }` (`currency` за замовчуванням `UAH`) | `201 Account`                                                                       |
| GET    | `/api/accounts/:id` | —                                                                                | `200 Account`                                                                       |
| PATCH  | `/api/accounts/:id` | `{ name?, type? }`, хоча б одне поле                                             | `200 Account`                                                                       |
| DELETE | `/api/accounts/:id` | —                                                                                | `204`; `409`, якщо є транзакції (крім початкового залишку), джерела доходу або борг |

## Категорії

Об'єкт: `{ id, name, kind, systemKey, parentId, createdAt }`, де `kind` — `income` \| `expense`.

`parentId` — батьківська категорія підкатегорії, `null` для категорії верхнього рівня. Рівнів два:
батьком може бути лише звичайна (не системна) категорія верхнього рівня того самого типу, інакше
`400`. Назва унікальна серед категорій з тим самим батьком і типом (`409`). `PATCH` з `parentId`
переносить категорію (транзакції лишаються на ній); `parentId: null` робить її верхнього рівня.
Перенесення — `409`, якщо в категорії є власні підкатегорії або якщо в якомусь бюджеті є ліміти і на
категорії, і на новому батькові. Категорію з підкатегоріями видалити не можна (`409`).

`systemKey` — `debt_repayment` («Погашення боргів») \| `interest_fees` («Відсотки та комісії») для
системних категорій і `null` для звичайних. Системні категорії створює застосунок за першої потреби;
перейменувати чи видалити їх не можна (`409`).

| Метод  | Шлях                  | Тіло                        | Відповідь                                                                      |
| ------ | --------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| GET    | `/api/categories`     | —                           | `200 { items: Category[] }`                                                    |
| POST   | `/api/categories`     | `{ name, kind, parentId? }` | `201 Category`; `409` для дубліката                                            |
| GET    | `/api/categories/:id` | —                           | `200 Category`                                                                 |
| PATCH  | `/api/categories/:id` | `{ name?, parentId? }`      | `200 Category`; `409` для дубліката чи недозволеного перенесення               |
| DELETE | `/api/categories/:id` | —                           | `204`; `409`, якщо використовується в транзакціях, бюджеті чи має підкатегорії |

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
перенести на будь-яку дату до сьогодні включно (за часовим поясом домогосподарства), зокрема в
минулі місяці, але не в майбутнє. Якщо `occurredAt` припадає на сьогодні, але пізніший за серверний
час (годинник пристрою випереджає), видаток записується поточним часом сервера.
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
    "actualBalance": 2070000,
    "planState": "balanced"
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
| POST   | `/api/budgets/:id/expense-lines`         | `{ categoryId, plannedAmount }`  | `201 Budget`; `409`, якщо ліміт на категорію, її групу чи її підкатегорію вже є; `400`, якщо це не категорія витрат              |
| PATCH  | `/api/budgets/:id/expense-lines/:lineId` | `{ plannedAmount?, sortOrder? }` | `200 Budget`                                                                                                                     |
| DELETE | `/api/budgets/:id/expense-lines/:lineId` | —                                | `200 Budget`                                                                                                                     |

У `spent` ідуть транзакції типів `expense` і `debt_payment` (платежі по позиках — у категорії
«Погашення боргів»). Перекази, зокрема погашення кредитки, і `balance_adjustment` не враховуються.
Новий бюджет без `copyFrom` одразу отримує ліміт «Погашення боргів» на суму щомісячних платежів
активних позик і розстрочок, якщо вони є. Позика, у якої `firstPaymentMonth` пізніше за місяць
бюджету, у цю суму не входить.

Ліміт групи рахує витрати самої групи й усіх її підкатегорій; ліміт підкатегорії — лише її. Ліміт і
на групі, і на її підкатегорії в одному бюджеті не допускається. `categoryName` підкатегорії в рядках
і незапланованих витратах — повна назва: «Комунальні › Вода».

Рядок ліміту групи, у якій були витрати підкатегорій, має `subcategories`: `{ categoryId, categoryName,
spent }` на кожну підкатегорію з витратами (власна назва, «Вода») і рядок «Без підкатегорії» (`categoryId`
групи) для витрат на саму групу; від більших витрат до менших. Інакше поля немає.

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
  "firstPaymentMonth": null,
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
| DELETE | `/api/debts/:id`           | —                     | `204`; борг видаляється разом із рухами                                                     |

`summary` — `{ totalBalance, totalMonthlyPayments, weightedAnnualRate, dueThisMonth, debtFreeDate,
totalCreditAvailable }` за активними боргами. Список відсортовано за датою платежу, закриті борги — в
кінці.

Тіло `POST /api/debts`:
`{ name, type, description?, initialAmount, startDate, maturityDate?, interestRate, ratePeriod,
monthlyPayment, paymentDay, firstPaymentMonth?, earlyRepaymentAllowed?, defaultAccountId?, creditLimit?,
existingAccountId? }`.

- `maturityDate` обов'язкова для всіх типів, крім `credit_card`, і має бути пізніше за `startDate`.
- `creditLimit` обов'язковий тоді й лише тоді, коли тип `credit_card`.
- `startDate` може бути в минулому, але не в майбутньому (`400`).
- `firstPaymentMonth` (`YYYY-MM` або `null`) — місяць першого платежу, не раніший за місяць `startDate`.
  До нього `month.required = 0` і статус `none`, а прогноз починається з платежу цього місяця; залишок
  боргу рахується одразу. Без нього перший платіж — найближчий за графіком після `startDate`.
- Кредитна картка атомарно створює рахунок-картку з назвою боргу й, якщо `initialAmount > 0`,
  транзакцію `balance_adjustment` на `-initialAmount` з датою `startDate`.
- `existingAccountId` перетворює наявний рахунок на рахунок-картку: борг дорівнює його поточному
  від'ємному балансу, тому `initialAmount` має бути 0. Рахунок, уже прив'язаний до боргу, — `409`.
- Порушення цих правил схеми — `400 VALIDATION_ERROR`, як і в решті API.

`PATCH` змінює умови (`name`, `description`, `maturityDate`, `interestRate`, `ratePeriod`,
`monthlyPayment`, `paymentDay`, `firstPaymentMonth`, `earlyRepaymentAllowed`, `defaultAccountId`, для кредитки —
`creditLimit`) і не змінює історію; тип, `initialAmount` і `startDate` не змінюються. Закриття
кредитки архівує рахунок-картку. Позика закривається сама, коли залишок стає нульовим, і відкривається
знову з новим нарахуванням; кредитка з нульовим боргом лишається активною.

`DELETE` видаляє борг разом з його рухами:

- позика чи розстрочка — зникають записи боргу й транзакції платежів, тож баланси рахунків, з яких
  платили, відновлюються;
- кредитка без рухів — зникають також рахунок-картка й початковий баланс;
- кредитка з рухами — видаляється лише борг: рахунок стає звичайним (`type = card`, без ліміту), а
  його покупки, перекази й баланс лишаються, щоб витрати й бюджети минулих місяців не змінилися.

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

## Цілі

Ціль накопичення (`savings`) рахується за балансом прив'язаного рахунку, ціль виходу з боргів
(`debt_payoff`) — за залишками вибраних боргів. Цілі нічого не дублюють: гроші й борги беруться з
рахунків і боргів. Усі суми — цілі числа в мінімальних одиницях валюти, лише `UAH`; частки —
відношення (0,2 = 20%). Правила — у `docs/domain.md`.

Ціль накопичення:

```json
{
  "id": "…",
  "kind": "savings",
  "name": "Подушка",
  "description": null,
  "status": "active",
  "currency": "UAH",
  "targetDate": "2027-06-30",
  "accountId": "…",
  "accountName": "Депозит",
  "targetAmount": 10000000,
  "monthlyContribution": 500000,
  "saved": 2000000,
  "remaining": 8000000,
  "progress": 0.2,
  "requiredMonthly": 1000000,
  "pace": 500000,
  "projectedMonth": "2028-02",
  "state": "behind"
}
```

- `saved` — баланс рахунку цілі (від'ємний рахується як 0); баланс на момент створення цілі зараховано.
- `requiredMonthly` — скільки відкладати щомісяця, щоб встигнути до `targetDate`; `null` без дати,
  після дати або коли ціль досягнуто.
- `pace` — `monthlyContribution`, а без нього — середній приріст балансу за три попередні повні місяці;
  `null`, якщо приросту не було. `projectedMonth` — місяць досягнення цілі за цього темпу.
- `state` — `achieved` \| `no_deadline` \| `overdue` \| `on_track` \| `behind`.

Ціль виходу з боргів:

```json
{
  "id": "…",
  "kind": "debt_payoff",
  "name": "Без боргів",
  "description": null,
  "status": "active",
  "currency": "UAH",
  "targetDate": "2028-03-31",
  "debts": [{ "id": "…", "name": "Кредитка", "balance": 2340000 }],
  "startBalance": 3000000,
  "currentBalance": 2340000,
  "paid": 660000,
  "progress": 0.22,
  "extraPayment": 200000,
  "strategy": "avalanche",
  "minimumPayments": 120000,
  "requiredMonthly": 150000,
  "debtFreeMonth": "2027-11",
  "state": "on_track"
}
```

- `startBalance` — сумарний залишок боргів цілі на момент створення; `paid` і `progress` рахуються від
  нього. Нові покупки з кредитки зменшують прогрес.
- `strategy` — `avalanche` (спершу найвища ставка) \| `snowball` (спершу найменший борг);
  `extraPayment` — сума понад мінімальні платежі на місяць.
- `requiredMonthly` — мінімальні платежі плюс найменший додатковий платіж, щоб погасити все до
  `targetDate`; `null`, якщо цього не досягти жодним платежем, якщо дата минула або боргів не лишилося.
- `debtFreeMonth` — місяць виходу з боргів за `extraPayment` і `strategy` цілі.
- `state` — `achieved` \| `overdue` \| `on_track` \| `behind`.

| Метод  | Шлях                                            | Тіло                              | Відповідь                                               |
| ------ | ----------------------------------------------- | --------------------------------- | ------------------------------------------------------- |
| GET    | `/api/goals`                                    | —                                 | `200 { today, goals: Goal[] }`, активні перед архівними |
| POST   | `/api/goals`                                    | див. нижче                        | `201 Goal`                                              |
| GET    | `/api/goals/:id`                                | —                                 | `200 Goal`                                              |
| PATCH  | `/api/goals/:id`                                | поля свого виду цілі              | `200 Goal`                                              |
| DELETE | `/api/goals/:id`                                | —                                 | `204`; рахунки, перекази й борги не змінюються          |
| POST   | `/api/goals/:id/archive`                        | —                                 | `200 Goal` зі `status = archived`                       |
| POST   | `/api/goals/:id/contributions`                  | `{ fromAccountId, amount, date }` | `201 Goal`                                              |
| GET    | `/api/goals/:id/payoff-plan?extra=…&strategy=…` | —                                 | `200 PayoffPlan`                                        |

Тіло `POST /api/goals`:

- накопичення: `{ kind: "savings", name, description?, accountId, targetAmount, targetDate?, monthlyContribution? }`;
- вихід із боргів: `{ kind: "debt_payoff", name, description?, debtIds, targetDate, extraPayment?, strategy? }`
  (`extraPayment` за замовчуванням 0, `strategy` — `avalanche`).

Правила:

- Рахунок цілі накопичення: чужий або невідомий — `404`; не в `UAH` — `422 CURRENCY_MISMATCH`;
  кредитна картка або архівний — `400`; уже має активну ціль — `409`. Рахунок із ціллю не видаляється
  (`409`).
- Борги цілі задаються під час створення й далі не змінюються; чужий або невідомий борг — `404`.
  Видалений борг зникає з цілі.
- `PATCH` не змінює вид цілі; поле іншого виду — `400`. Для накопичення можна змінити рахунок.
- Поповнення — переказ на рахунок цілі, лише для активної цілі накопичення: архівна — `409`, ціль
  виходу з боргів — `422 GOAL_KIND_MISMATCH`, рахунок цілі як джерело — `422 SAME_ACCOUNT`, майбутня
  дата — `422 EXPENSE_DATE_IN_FUTURE`.

`PayoffPlan` (лише для цілі виходу з боргів, інакше `422 GOAL_KIND_MISMATCH`):

```json
{
  "extra": 200000,
  "strategy": "avalanche",
  "plan": {
    "months": 14,
    "debtFreeMonth": "2027-11",
    "totalInterest": 310000,
    "payoffOrder": [{ "debtId": "…", "name": "Кредитка", "month": "2027-11" }],
    "timeline": [{ "month": "2026-10", "balance": 2190000 }]
  },
  "baseline": { "months": 31, "debtFreeMonth": "2029-04", "totalInterest": 1410000 },
  "interestSaved": 1100000,
  "monthsSaved": 17,
  "withoutExtra": [{ "debtId": "…", "name": "Розстрочка" }]
}
```

- Без параметрів план рахується за `extraPayment` і `strategy` цілі; параметри запиту їх перекривають і
  нічого не зберігають.
- `baseline` — лише мінімальні платежі. `months`, `debtFreeMonth` і `totalInterest` дорівнюють `null`,
  якщо борги не погашаються; тоді `interestSaved` і `monthsSaved` теж `null`.
- `withoutExtra` — борги, що не отримують додаткових грошей, бо умови не передбачають дострокового
  погашення.

## Аналітика

Лише читання: усе рахується з транзакцій, бюджетів, доходів і боргів. Суми — цілі числа в мінімальних
одиницях валюти, частки й норми — відношення (0,15 = 15%). Враховуються лише транзакції в `UAH`.
Правила — у `docs/domain.md`.

| Метод | Шлях                                              | Відповідь            |
| ----- | ------------------------------------------------- | -------------------- |
| GET   | `/api/analytics/month?month=YYYY-MM`              | `200 AnalyticsMonth` |
| GET   | `/api/analytics/trend?month=YYYY-MM&months=6\|12` | `200 AnalyticsTrend` |

`month` за замовчуванням поточний; майбутній місяць — `400`. `months` — 6 (за замовчуванням) або 12;
динаміка закінчується місяцем `month`.

`AnalyticsMonth`:

```json
{
  "month": "2026-10",
  "currency": "UAH",
  "today": "2026-10-12",
  "isCurrentMonth": true,
  "totalSpent": 3180000,
  "previousTotalSpent": 2900000,
  "change": 280000,
  "categories": [
    {
      "categoryId": "…",
      "categoryName": "Продукти",
      "spent": 1350000,
      "share": 0.4245,
      "previousSpent": 1200000,
      "change": 150000
    }
  ],
  "budget": {
    "overspent": [
      {
        "categoryId": "…",
        "categoryName": "Продукти",
        "planned": 1200000,
        "spent": 1350000,
        "overBy": 150000
      }
    ]
  },
  "forecast": {
    "daysElapsed": 12,
    "daysInMonth": 31,
    "spent": 3180000,
    "projected": 8215000,
    "plannedExpenseTotal": 5200000,
    "categories": [
      {
        "categoryId": "…",
        "categoryName": "Продукти",
        "planned": 1200000,
        "spent": 1350000,
        "projected": 3487500,
        "projectedOverBy": 2287500
      }
    ]
  }
}
```

- `categories` — категорії верхнього рівня з витратами в цьому або попередньому місяці, за спаданням
  `spent`; `categoryId = null` — витрати без категорії. Витрати підкатегорій входять у рядок групи.
  Якщо в групі були витрати підкатегорій, рядок має `subcategories` з тими самими полями: по рядку на
  підкатегорію й рядок «Без підкатегорії» (`categoryId` групи) для витрат на саму групу. Частки — від
  усіх витрат місяця.
- `budget` — `null`, якщо бюджету на місяць немає. `overspent` — рядки бюджету зі статусом `over` і
  незаплановані витрати (`planned = 0`).
- `forecast` — лише для поточного місяця, інакше `null`: `projected = spent × daysInMonth / daysElapsed`.
  Без бюджету `plannedExpenseTotal` дорівнює `null`, а `categories` порожній.

`AnalyticsTrend`:

```json
{
  "month": "2026-10",
  "months": 6,
  "currency": "UAH",
  "points": [
    {
      "month": "2026-05",
      "income": 6000000,
      "expenses": 5100000,
      "net": 900000,
      "savingsRate": 0.15,
      "netWorth": 12400000,
      "debtPayments": 390000,
      "debtLoad": 0.065
    }
  ],
  "plannedDebtLoad": { "monthlyPayments": 390000, "plannedIncome": 6000000, "ratio": 0.065 }
}
```

- `points` містить рівно `months` місяців від найдавнішого, включно з місяцями без даних.
- `savingsRate` і `debtLoad` дорівнюють `null`, якщо доходу в місяці немає.
- `netWorth` — на кінець місяця. `plannedDebtLoad` — сума щомісячних платежів активних боргів відносно
  запланованого доходу місяця `month`.

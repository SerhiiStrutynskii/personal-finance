# API

Базова адреса: `http://localhost:3000`. Формат — JSON. Спільні типи й zod-схеми —
`packages/shared/src/schemas.ts`.

## Авторизація

Усі маршрути `/api/*`, крім `/api/auth/config`, `/api/auth/invites/:token`, `/api/auth/register`,
`/api/auth/login`, `/api/auth/refresh` і `/api/auth/logout`, потребують заголовка `Authorization: Bearer <accessToken>`.

- Access-токен — JWT (HS256), діє 15 хвилин.
- Refresh-токен — випадковий рядок, діє 30 днів і одноразовий: кожне оновлення видає нову пару.
  Повторне використання вже використаного токена відкликає всі токени цього входу.

Об'єкти:

- `CurrentUser`: `{ user: { id, email, name, timeZone }, household: { id, name, role } }`
- `AuthTokens`: `{ accessToken, refreshToken, expiresIn }` (`expiresIn` — секунди життя access-токена)
- `AuthSession`: `CurrentUser` разом з `AuthTokens`

| Метод | Шлях                       | Тіло                                                      | Відповідь                                                                                                                                                               |
| ----- | -------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET   | `/api/auth/config`         | —                                                         | `200 { registrationEnabled }` — чи відкрита реєстрація на цьому сервері                                                                                                 |
| GET   | `/api/auth/invites/:token` | —                                                         | `200 { householdName, invitedBy }` — дані запрошення для сторінки реєстрації; `404`, якщо запрошення недійсне                                                           |
| POST  | `/api/auth/register`       | `{ email, password, name, householdName?, inviteToken? }` | `201 AuthSession`; `409`, якщо email зайнятий; `403 REGISTRATION_CLOSED`, якщо реєстрацію закрито й немає `inviteToken`; `422 INVITE_INVALID` для недійсного запрошення |
| POST  | `/api/auth/login`          | `{ email, password }`                                     | `200 AuthSession`; `401` для невірних даних; `429` після 5 невдалих спроб за 15 хвилин                                                                                  |
| POST  | `/api/auth/refresh`        | `{ refreshToken }`                                        | `200 AuthTokens`; `401` для невідомого, використаного чи простроченого токена                                                                                           |
| POST  | `/api/auth/logout`         | `{ refreshToken }`                                        | `204` завжди                                                                                                                                                            |
| GET   | `/api/auth/me`             | —                                                         | `200 CurrentUser`                                                                                                                                                       |

Пароль — від 10 до 128 символів. Email зводиться до нижнього регістру. Реєстрація створює
користувача й окреме домогосподарство, у якому він `owner`; `householdName` за замовчуванням —
«Моє домогосподарство». З `inviteToken` окреме домогосподарство не створюється: користувач стає
`member` домогосподарства із запрошення, а `householdName` ігнорується. За запрошенням можна
зареєструватися й тоді, коли реєстрацію закрито.

## Ролі

Усі учасники домогосподарства бачать ті самі дані. `member` веде транзакції (витрати, перекази),
прибутки, продукти, списки покупок і меню (прийоми їжі та страви). Зміни рахунків, категорій, бюджетів, боргів і цілей, а також
керування домогосподарством — лише для `owner`; для `member` такі запити повертають
`403 OWNER_ONLY`. Права перевіряються після розбору тіла запиту, тож невалідне тіло дає `400`.

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
| 403    | `OWNER_ONLY`                  | Дію може виконати лише власник домогосподарства                                               |
| 404    | `NOT_FOUND`                   | Запису немає в домогосподарстві користувача                                                   |
| 409    | `CONFLICT`                    | Дублікат або запис використовується                                                           |
| 422    | `EXPENSE_DATE_IN_FUTURE`      | Видаток, рух по боргу або поповнення цілі на майбутню дату                                    |
| 422    | `CURRENCY_MISMATCH`           | Рахунок не у валюті боргу чи цілі                                                             |
| 422    | `DEBT_TYPE_MISMATCH`          | Рух не того типу боргу: платіж по кредитці чи переказ на позику                               |
| 422    | `SAME_ACCOUNT`                | Погашення кредитки чи поповнення цілі з того самого рахунку                                   |
| 422    | `EARLY_REPAYMENT_NOT_ALLOWED` | Достроковий платіж без підтвердження, коли умови боргу його не передбачають                   |
| 422    | `GOAL_KIND_MISMATCH`          | Дія не для цього виду цілі: поповнення цілі виходу з боргів чи план погашення для накопичення |
| 422    | `BUDGET_PERIOD_CLOSED`        | Створення бюджету для місяця, що минув                                                        |
| 422    | `INVITE_INVALID`              | Реєстрація за запрошенням, яке відкликали, використали або строк якого минув                  |
| 422    | `TOO_MANY_INVITES`            | Понад 10 активних запрошень                                                                   |
| 422    | `OWNER_CANNOT_LEAVE`          | Власник виходить із домогосподарства чи вилучає себе                                          |
| 500    | `INTERNAL_ERROR`              | Непередбачена помилка                                                                         |

## Службове

`GET /health` → `{ "status": "ok" }` (без авторизації).

## Домогосподарство

- `Household`: `{ id, name, role, members: HouseholdMember[], invites: HouseholdInvite[] }`;
  `role` — роль поточного користувача, `invites` — активні запрошення, `member` отримує `[]`.
- `HouseholdMember`: `{ userId, name, email, role, joinedAt }`.
- `HouseholdInvite`: `{ id, createdAt, expiresAt, createdByName }`.

| Метод  | Шлях                             | Тіло       | Відповідь                                                                            |
| ------ | -------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| GET    | `/api/household`                 | —          | `200 Household`                                                                      |
| PATCH  | `/api/household`                 | `{ name }` | `200 Household`; лише `owner`                                                        |
| POST   | `/api/household/invites`         | —          | `201 HouseholdInvite & { token }`; лише `owner`; `422 TOO_MANY_INVITES`              |
| DELETE | `/api/household/invites/:id`     | —          | `204`; лише `owner`; `404`, якщо активного запрошення немає                          |
| DELETE | `/api/household/members/:userId` | —          | `204`; лише `owner`; `422 OWNER_CANNOT_LEAVE` для себе; `404` для чужого користувача |
| POST   | `/api/household/leave`           | —          | `204`; `422 OWNER_CANNOT_LEAVE` для власника                                         |

Запрошення одноразове й діє 7 днів. `token` повертається лише у відповіді на створення; у БД
зберігається його SHA-256. Посилання для учасника — `/invite/<token>` на домені застосунку.
Вилучений учасник чи той, хто вийшов, не втрачає акаунт: він отримує власне порожнє
домогосподарство, а доступ до попереднього зникає з наступного запиту.

## Головна

`GET /api/dashboard` → `200 Dashboard` — зведення поточного місяця (у часовому поясі домогосподарства)
для головної сторінки. Лише читання: числа й статуси беруться з рахунків, аналітики, прибутків, боргів і
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
- `plan` — план місяця: `plannedIncome` — планова сума надходжень (`plannedTotal` прибутків),
  `plannedExpenses` — сума лімітів, `balance` — їхня різниця, `state` — `balanced` (витрати не більші
  за прибутки) або `deficit`. Без бюджету `plannedExpenses`, `balance` і `state` дорівнюють `null`.
- `debtPayments` — обов'язкові платежі місяця по активних боргах, зокрема мінімальні по кредитках:
  `required` — сума платежів, `paid` — сплачене з них, `remaining` — решта (те саме, що `dueThisMonth`
  огляду боргів). Борг, перший платіж якого ще не настав, сюди не входить.
- `attention[].kind` — `debt_overdue` \| `income_overdue` \| `budget_over` \| `goal_overdue` \|
  `debt_due_soon` \| `goal_behind`, у цьому порядку. `id` — борг, надходження чи ціль; для
  `budget_over` — категорія або `null`. `amount` і `date` можуть бути `null`.
- `upcoming` — платежі по боргах (`debt_payment`) і надходження (`income`) від сьогодні до кінця місяця,
  за датою; прострочене сюди не входить.
- `goals` — не більше трьох активних цілей, як у `GET /api/goals`.
- `recent` — не більше п'яти останніх витрат, прибутків і платежів по боргах; перекази й службові зміни
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
  Вона змінює баланс, але не є ні прибутком, ні витратою. Змінити її пізніше не можна; поточний баланс
  виправляється коригуванням.
- Коригування балансу (`POST /api/accounts/:id/balance`): `actualBalance` — фактичний баланс рахунку
  зараз, ціле число мінімальних одиниць, може бути від'ємним; `note` — необов'язкова примітка до 500
  символів. Різниця з поточним балансом записується транзакцією `balance_adjustment` з поточним моментом
  і описом `note` або «Коригування балансу»; якщо різниці немає, нічого не записується. Минулі записи
  не змінюються, а коригування не є ні прибутком, ні витратою. Кредитна картка (її баланс звіряється через
  `POST /api/debts/:id/adjustments`) і архівний рахунок — `400`.

| Метод  | Шлях                        | Тіло                                                                             | Відповідь                                                                                          |
| ------ | --------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| GET    | `/api/accounts`             | —                                                                                | `200 { items: Account[] }`                                                                         |
| POST   | `/api/accounts`             | `{ name, type, currency?, openingBalance? }` (`currency` за замовчуванням `UAH`) | `201 Account`                                                                                      |
| GET    | `/api/accounts/:id`         | —                                                                                | `200 Account`                                                                                      |
| PATCH  | `/api/accounts/:id`         | `{ name?, type? }`, хоча б одне поле                                             | `200 Account`                                                                                      |
| POST   | `/api/accounts/:id/balance` | `{ actualBalance, note? }`                                                       | `200 Account`                                                                                      |
| DELETE | `/api/accounts/:id`         | —                                                                                | `204`; `409`, якщо є транзакції (крім початкового залишку й коригувань), джерела прибутку або борг |

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
- прибуток: `{ type: "income", accountId, categoryId?, occurrenceId?, amountMinor, currency?, description?, occurredAt }`
- переказ: `{ type: "transfer", accountId, toAccountId, amountMinor, currency?, description?, occurredAt }`

`occurrenceId` — надходження періодичного прибутку, яке оплачує ця транзакція; валюта має збігатися з
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
| `occurrenceId` | Платежі одного надходження періодичного прибутку                              |
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

Порушення — `422 EXPENSE_DATE_IN_FUTURE`. Прибутків і переказів правило не стосується. Межу дає
`getAllowedExpenseDateRange` з `packages/shared`.

## Бюджети

Бюджет — план лімітів витрат по категоріях на місяць і зведення фактичних даних за цей місяць.
Фактичних записів він не зберігає: витрати рахуються з видатків за період, прибутки бере з фічі
прибутків. Усі суми — цілі числа в мінімальних одиницях валюти. Правила — у `docs/domain.md`.
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
- `plannedIncomeTotal`, `receivedIncomeTotal` і блок `incomes` — дані прибутків того ж місяця
  (`GET /api/incomes`). Статей прибутку в бюджеті немає.

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

## Прибутки

Періодичні прибутки задаються джерелами з правилом повторення; кожне очікуване надходження — окремий
запис із запланованими датою й сумою. Разовий прибуток — звичайна транзакція прибутку. Усі суми — цілі
числа в мінімальних одиницях валюти, дати — `YYYY-MM-DD` у часовому поясі домогосподарства. Прибутки
підтримуються лише у валюті `UAH`. Правила — у `docs/domain.md`.

### Джерела прибутку

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
| DELETE | `/api/income-sources/:id`            | —                                                                                                              | `204`; `409`, якщо є отримані прибутки                                                  |

### Прибутки місяця

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

## Продукти

Довідник продуктів для списків покупок. Об'єкт: `{ id, name, unit, price, currency, isArchived, createdAt }`, де
`unit` — `pcs` \| `kg` \| `l` \| `pack`, а `price` — ціна за одиницю в мінімальних одиницях (`> 0`) або
`null`, якщо ціна невідома. Валюта — завжди `UAH`.

Назва унікальна в домогосподарстві без урахування регістру (`409`). Список відсортовано за назвою за
українським алфавітом.

| Метод  | Шлях                       | Тіло                                    | Відповідь                                          |
| ------ | -------------------------- | --------------------------------------- | -------------------------------------------------- |
| GET    | `/api/products`            | —                                       | `200 { items: Product[] }`                         |
| POST   | `/api/products`            | `{ name, unit?, price? }`               | `201 Product`; `409` для дубліката                 |
| GET    | `/api/products/:id`        | —                                       | `200 Product`                                      |
| PATCH  | `/api/products/:id`        | `{ name?, unit?, price?, isArchived? }` | `200 Product`; `409` для дубліката                 |
| DELETE | `/api/products/:id`        | —                                       | `204`; `409`, якщо продукт є в списках або стравах |
| GET    | `/api/products/:id/prices` | —                                       | `200 ProductPriceHistory`                          |

За замовчуванням `unit` — `pcs`, `price` — `null`; `price: null` у `PATCH` стирає ціну. `GET` без
параметрів не повертає архівних продуктів; `?archived=true` — повертає всі. Продукт зі списків покупок
або зі складу страв не видаляється (`409`), його архівують через `PATCH { isArchived: true }`.

## Списки покупок

Списки не створюють транзакцій. Правила — в `docs/domain.md`. Ціни — за одиницю продукту в мінімальних
одиницях (`> 0`) або `null`; кількість — ціле число тисячних одиниці (`quantityMilli`, від 1 до
1 000 000 000).

| Метод  | Шлях                                    | Тіло                                                                          | Відповідь                                     |
| ------ | --------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| GET    | `/api/shopping-lists`                   | —                                                                             | `200 { items: ShoppingListSummary[] }`        |
| POST   | `/api/shopping-lists`                   | `{ name }`                                                                    | `201 ShoppingList`                            |
| GET    | `/api/shopping-lists/:id`               | —                                                                             | `200 ShoppingList`                            |
| PATCH  | `/api/shopping-lists/:id`               | `{ name }`                                                                    | `200 ShoppingList`                            |
| DELETE | `/api/shopping-lists/:id`               | —                                                                             | `204`                                         |
| POST   | `/api/shopping-lists/:id/items`         | `{ productId, quantityMilli? }` або `{ name, unit?, price?, quantityMilli? }` | `201 ShoppingList`; `404` для чужого продукту |
| PATCH  | `/api/shopping-lists/:id/items/:itemId` | `{ quantityMilli?, expectedUnitPrice?, actualUnitPrice?, isBought? }`         | `200 ShoppingList`                            |
| DELETE | `/api/shopping-lists/:id/items/:itemId` | —                                                                             | `200 ShoppingList`                            |

Зміни рядків повертають список цілком, бо разом із рядком змінюються підсумки. `quantityMilli` за
замовчуванням — 1000 (одна одиниця). Рядок за назвою бере продукт з довідника без урахування регістру
або створює новий з `unit` і `price`.

`ShoppingListSummary` — список без рядків; `ShoppingList` — з рядками (спершу некуплені, потім куплені,
всередині — в порядку додавання):

```json
{
  "id": "…",
  "name": "На тиждень",
  "currency": "UAH",
  "createdAt": "2026-10-20T10:00:00.000Z",
  "totals": {
    "itemCount": 2,
    "boughtCount": 1,
    "expected": 16000,
    "actual": 7000,
    "remaining": 9600,
    "deviation": 600,
    "unpricedCount": 0
  },
  "items": [
    {
      "id": "…",
      "productId": "…",
      "name": "Сир",
      "unit": "kg",
      "quantityMilli": 300,
      "expectedUnitPrice": 32000,
      "actualUnitPrice": null,
      "expectedTotal": 9600,
      "actualTotal": null,
      "isBought": false,
      "boughtAt": null
    },
    {
      "id": "…",
      "productId": "…",
      "name": "Хліб",
      "unit": "pcs",
      "quantityMilli": 2000,
      "expectedUnitPrice": 3200,
      "actualUnitPrice": 3500,
      "expectedTotal": 6400,
      "actualTotal": 7000,
      "isBought": true,
      "boughtAt": "2026-10-20T10:05:00.000Z"
    }
  ]
}
```

`expectedTotal` і `actualTotal` — кількість × ціна, округлені до копійки, або `null` без ціни.
`totals`: `expected` — очікувана сума списку, `actual` — фактична сума куплених, `remaining` —
очікувана сума некуплених, `deviation` — фактична мінус очікувана сума куплених рядків з обома цінами,
`unpricedCount` — рядки без очікуваної ціни.

### Аналітика покупок

Окремо від аналітики витрат: списки не створюють транзакцій. Правила — у `docs/domain.md`.

| Метод | Шлях                                                        | Відповідь                 |
| ----- | ----------------------------------------------------------- | ------------------------- |
| GET   | `/api/shopping/analytics?month=YYYY-MM`                     | `200 ShoppingAnalytics`   |
| GET   | `/api/shopping/analytics/period?month=YYYY-MM&months=6\|12` | `200 ShoppingPeriod`      |
| GET   | `/api/products/:id/prices`                                  | `200 ProductPriceHistory` |

`month` за замовчуванням поточний; майбутній місяць — `400`.

```json
{
  "month": "2026-10",
  "currency": "UAH",
  "spent": 13400,
  "previousSpent": 0,
  "change": 13400,
  "expectedOfPriced": 12800,
  "deviation": 600,
  "purchaseCount": 2,
  "unpricedCount": 0,
  "products": [
    {
      "productId": "…",
      "name": "Хліб",
      "unit": "pcs",
      "quantityMilli": 4000,
      "spent": 13400,
      "averageUnitPrice": 3350,
      "lastUnitPrice": 3500,
      "previousUnitPrice": 3200,
      "purchaseCount": 2
    }
  ]
}
```

`products` — за спаданням `spent`; `previousUnitPrice` — ціна попередньої покупки продукту або `null`
для першої. `expectedOfPriced` і `deviation` — по покупках з обома цінами.

`ShoppingPeriod` — покупки за `months` місяців (6 за замовчуванням або 12), що закінчуються місяцем
`month`:

```json
{
  "month": "2026-10",
  "currency": "UAH",
  "months": ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"],
  "total": 129267,
  "averagePerMonth": 21545,
  "purchaseCount": 13,
  "unpricedCount": 0,
  "points": [{ "month": "2026-09", "spent": 79880, "purchaseCount": 6 }],
  "products": [
    {
      "productId": "…",
      "name": "Молоко",
      "unit": "l",
      "quantityMilli": 5000,
      "spent": 21200,
      "share": 0.164,
      "averagePerMonth": 3533,
      "averageUnitPrice": 4240,
      "minUnitPrice": 4150,
      "maxUnitPrice": 4400,
      "purchaseCount": 3,
      "byMonth": [{ "month": "2026-09", "spent": 8300, "quantityMilli": 2000 }]
    }
  ]
}
```

`points` і `byMonth` мають рядок для кожного місяця періоду, зокрема з нулями (у прикладі скорочено).
`products` — усі продукти періоду за спаданням `spent`; `share` — частка від `total`; середнє на місяць
ділить суму на всі місяці періоду.

`ProductPriceHistory` — `{ product: Product, points: [{ boughtAt, unitPrice, quantityMilli, listId,
listName }] }`, покупки з фактичною ціною від найдавнішої. Чужий продукт — `404`.

## Меню

Довідники прийомів їжі й страв; ведуть усі учасники домогосподарства. Правила — у `docs/domain.md`.
Назви — від 1 до 100 символів без пробілів по краях, унікальні в домогосподарстві без урахування
регістру (`409`). Чужий чи неіснуючий запис — `404`.

### Прийоми їжі

Об'єкт `MealType`: `{ id, name, position }`. Список — у порядку `position`.

| Метод  | Шлях                    | Тіло       | Відповідь                                                   |
| ------ | ----------------------- | ---------- | ----------------------------------------------------------- |
| GET    | `/api/meal-types`       | —          | `200 { items: MealType[] }`                                 |
| POST   | `/api/meal-types`       | `{ name }` | `201 MealType` (у кінці списку); `409` для дубліката        |
| PATCH  | `/api/meal-types/:id`   | `{ name }` | `200 MealType`; `409`; `404`                                |
| PUT    | `/api/meal-types/order` | `{ ids }`  | `200 { items: MealType[] }`; `400`, якщо набір id не повний |
| DELETE | `/api/meal-types/:id`   | —          | `204`; `404`                                                |

`ids` у `PUT /order` — усі прийоми їжі домогосподарства в новому порядку, кожен один раз (від 1 до 50).
Неповний набір, зайвий, чужий чи повторений id дають `400`, і порядок не змінюється. Позиції стають
`0..n-1`. Нове домогосподарство отримує «Сніданок», «Обід», «Вечеря».

### Страви

| Метод  | Шлях              | Тіло                      | Відповідь                                                   |
| ------ | ----------------- | ------------------------- | ----------------------------------------------------------- |
| GET    | `/api/dishes`     | —                         | `200 { items: DishSummary[] }` за назвою                    |
| POST   | `/api/dishes`     | `{ name, ingredients? }`  | `201 Dish`; `409`; `404` для чужого чи неіснуючого продукту |
| GET    | `/api/dishes/:id` | —                         | `200 Dish`; `404`                                           |
| PATCH  | `/api/dishes/:id` | `{ name?, ingredients? }` | `200 Dish`; `409`; `404`                                    |
| DELETE | `/api/dishes/:id` | —                         | `204`; `404`                                                |

`ingredients` — `[{ productId, quantityMilli }]`, до 50 рядків, кожен продукт один раз; кількість на
одну порцію в тисячних одиниці продукту (від 1 до 1 000 000 000). За замовчуванням склад порожній.
У `PATCH` хоча б одне поле; `ingredients` замінює склад цілком. Архівний продукт свого
домогосподарства дозволений. Якщо продукт чужий чи не існує — `404`, і страва не змінюється.

`DishSummary` — страва без складу; `Dish` — зі складом у переданому порядку. Ціна порції рахується
за поточними цінами продуктів при кожному запиті:

```json
{
  "id": "…",
  "name": "Гречка варена",
  "currency": "UAH",
  "portionPrice": 690,
  "isPriceComplete": true,
  "unpricedCount": 0,
  "ingredientCount": 2,
  "createdAt": "2026-10-20T10:00:00.000Z",
  "ingredients": [
    {
      "productId": "…",
      "name": "Гречка",
      "unit": "kg",
      "isArchived": false,
      "quantityMilli": 150,
      "unitPrice": 4000,
      "lineTotal": 600
    },
    {
      "productId": "…",
      "name": "Олія",
      "unit": "l",
      "isArchived": false,
      "quantityMilli": 10,
      "unitPrice": 9000,
      "lineTotal": 90
    }
  ]
}
```

`lineTotal` — кількість × ціна, округлена до копійки («половина — вгору»), або `null`, якщо в
продукту немає ціни. `portionPrice` — сума `lineTotal`; рядки без ціни дають 0, а
`isPriceComplete = false` і `unpricedCount` показують, скільки їх.

## Аналітика

Лише читання: усе рахується з транзакцій, бюджетів, прибутків і боргів. Суми — цілі числа в мінімальних
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
- `savingsRate` і `debtLoad` дорівнюють `null`, якщо прибутку в місяці немає.
- `netWorth` — на кінець місяця. `plannedDebtLoad` — сума щомісячних платежів активних боргів відносно
  запланованого прибутку місяця `month`.

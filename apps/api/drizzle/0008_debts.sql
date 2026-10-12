CREATE TABLE "debt_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"debt_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" bigint NOT NULL,
	"principal_part" bigint,
	"interest_part" bigint,
	"transaction_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debt_entries_transaction_id_unique" UNIQUE("transaction_id"),
	CONSTRAINT "debt_entries_kind_valid" CHECK ("debt_entries"."kind" IN ('payment', 'charge', 'adjustment')),
	CONSTRAINT "debt_entries_amount_valid" CHECK ("debt_entries"."kind" = 'adjustment' OR "debt_entries"."amount" > 0),
	CONSTRAINT "debt_entries_payment_shape" CHECK ("debt_entries"."kind" <> 'payment' OR ("debt_entries"."transaction_id" IS NOT NULL
        AND "debt_entries"."principal_part" >= 0 AND "debt_entries"."interest_part" >= 0
        AND "debt_entries"."principal_part" + "debt_entries"."interest_part" = "debt_entries"."amount"))
);
--> statement-breakpoint
CREATE TABLE "debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"account_id" uuid,
	"currency" char(3) DEFAULT 'UAH' NOT NULL,
	"initial_amount" bigint NOT NULL,
	"start_date" date NOT NULL,
	"maturity_date" date,
	"interest_rate" numeric(9, 4) NOT NULL,
	"rate_period" text NOT NULL,
	"monthly_payment" bigint NOT NULL,
	"payment_day" smallint NOT NULL,
	"early_repayment_allowed" boolean DEFAULT true NOT NULL,
	"default_account_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debts_account_id_unique" UNIQUE("account_id"),
	CONSTRAINT "debts_type_valid" CHECK ("debts"."type" IN ('credit_card', 'installment', 'mfo_loan', 'bank_loan')),
	CONSTRAINT "debts_rate_period_valid" CHECK ("debts"."rate_period" IN ('year', 'month', 'day')),
	CONSTRAINT "debts_status_valid" CHECK ("debts"."status" IN ('active', 'closed')),
	CONSTRAINT "debts_initial_amount_non_negative" CHECK ("debts"."initial_amount" >= 0),
	CONSTRAINT "debts_interest_rate_non_negative" CHECK ("debts"."interest_rate" >= 0),
	CONSTRAINT "debts_monthly_payment_positive" CHECK ("debts"."monthly_payment" > 0),
	CONSTRAINT "debts_payment_day_valid" CHECK ("debts"."payment_day" BETWEEN 1 AND 31),
	CONSTRAINT "debts_card_has_account" CHECK (("debts"."type" = 'credit_card') = ("debts"."account_id" IS NOT NULL)),
	CONSTRAINT "debts_maturity_required" CHECK ("debts"."type" = 'credit_card' OR "debts"."maturity_date" IS NOT NULL),
	CONSTRAINT "debts_maturity_after_start" CHECK ("debts"."maturity_date" IS NULL OR "debts"."maturity_date" > "debts"."start_date"),
	CONSTRAINT "debts_card_early_repayment" CHECK ("debts"."type" <> 'credit_card' OR "debts"."early_repayment_allowed"),
	CONSTRAINT "debts_default_account_differs" CHECK ("debts"."default_account_id" IS NULL OR "debts"."default_account_id" IS DISTINCT FROM "debts"."account_id")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "system_key" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "debt_id" uuid;--> statement-breakpoint
ALTER TABLE "debt_entries" ADD CONSTRAINT "debt_entries_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_entries" ADD CONSTRAINT "debt_entries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_entries" ADD CONSTRAINT "debt_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_default_account_id_accounts_id_fk" FOREIGN KEY ("default_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "debt_entries_debt_id_occurred_at_index" ON "debt_entries" USING btree ("debt_id","occurred_at");--> statement-breakpoint
CREATE INDEX "debts_household_id_index" ON "debts" USING btree ("household_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_debt_id_index" ON "transactions" USING btree ("debt_id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_household_id_system_key_unique" UNIQUE("household_id","system_key");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_debt_only_for_payment" CHECK ((("transactions"."type")::text = 'debt_payment') = ("transactions"."debt_id" IS NOT NULL));
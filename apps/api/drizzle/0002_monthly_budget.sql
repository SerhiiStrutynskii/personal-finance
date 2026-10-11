CREATE TABLE "budget_expense_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"planned_amount" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "budget_expense_lines_budget_id_category_id_unique" UNIQUE("budget_id","category_id"),
	CONSTRAINT "budget_expense_lines_planned_non_negative" CHECK ("budget_expense_lines"."planned_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "budget_income_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" uuid NOT NULL,
	"name" text NOT NULL,
	"planned_amount" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "budget_income_lines_planned_non_negative" CHECK ("budget_income_lines"."planned_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"currency" char(3) DEFAULT 'UAH' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_household_id_periodStart_unique" UNIQUE("household_id","period_start"),
	CONSTRAINT "budgets_status_valid" CHECK ("budgets"."status" IN ('draft', 'active', 'closed')),
	CONSTRAINT "budgets_period_valid" CHECK ("budgets"."period_end" > "budgets"."period_start")
);
--> statement-breakpoint
DROP INDEX "transactions_household_id_occurred_at_index";--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "time_zone" text DEFAULT 'Europe/Kyiv' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "income_line_id" uuid;--> statement-breakpoint
ALTER TABLE "budget_expense_lines" ADD CONSTRAINT "budget_expense_lines_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_expense_lines" ADD CONSTRAINT "budget_expense_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_income_lines" ADD CONSTRAINT "budget_income_lines_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_income_lines_budget_id_index" ON "budget_income_lines" USING btree ("budget_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_income_line_id_budget_income_lines_id_fk" FOREIGN KEY ("income_line_id") REFERENCES "public"."budget_income_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_household_id_occurred_at_type_category_id_index" ON "transactions" USING btree ("household_id","occurred_at","type","category_id");--> statement-breakpoint
CREATE INDEX "transactions_income_line_id_index" ON "transactions" USING btree ("income_line_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_income_line_only_for_income" CHECK ("transactions"."income_line_id" IS NULL OR "transactions"."type" = 'income');
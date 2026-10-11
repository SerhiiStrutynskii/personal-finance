CREATE TABLE "income_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"scheduled_date" date NOT NULL,
	"planned_date" date NOT NULL,
	"planned_amount" bigint NOT NULL,
	"status" text DEFAULT 'expected' NOT NULL,
	CONSTRAINT "income_occurrences_source_id_scheduled_date_unique" UNIQUE("source_id","scheduled_date"),
	CONSTRAINT "income_occurrences_source_id_planned_date_unique" UNIQUE("source_id","planned_date"),
	CONSTRAINT "income_occurrences_planned_positive" CHECK ("income_occurrences"."planned_amount" > 0),
	CONSTRAINT "income_occurrences_status_valid" CHECK ("income_occurrences"."status" IN ('expected', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "income_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"account_id" uuid,
	"name" text NOT NULL,
	"currency" char(3) DEFAULT 'UAH' NOT NULL,
	"planned_amount" bigint NOT NULL,
	"frequency" text NOT NULL,
	"day_of_month" smallint,
	"day_of_week" smallint,
	"interval_months" smallint,
	"start_date" date NOT NULL,
	"end_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "income_sources_planned_positive" CHECK ("income_sources"."planned_amount" > 0),
	CONSTRAINT "income_sources_frequency_valid" CHECK ("income_sources"."frequency" IN ('monthly', 'weekly', 'biweekly', 'every_n_months')),
	CONSTRAINT "income_sources_day_of_month_valid" CHECK ("income_sources"."day_of_month" BETWEEN 1 AND 31),
	CONSTRAINT "income_sources_day_of_week_valid" CHECK ("income_sources"."day_of_week" BETWEEN 1 AND 7),
	CONSTRAINT "income_sources_interval_valid" CHECK ("income_sources"."interval_months" >= 1),
	CONSTRAINT "income_sources_dates_valid" CHECK ("income_sources"."end_date" IS NULL OR "income_sources"."end_date" >= "income_sources"."start_date"),
	CONSTRAINT "income_sources_rule_complete" CHECK (("income_sources"."frequency" = 'monthly' AND "income_sources"."day_of_month" IS NOT NULL)
        OR ("income_sources"."frequency" = 'every_n_months' AND "income_sources"."day_of_month" IS NOT NULL AND "income_sources"."interval_months" IS NOT NULL)
        OR ("income_sources"."frequency" IN ('weekly', 'biweekly') AND "income_sources"."day_of_week" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "occurrence_id" uuid;--> statement-breakpoint
ALTER TABLE "income_occurrences" ADD CONSTRAINT "income_occurrences_source_id_income_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."income_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_occurrences" ADD CONSTRAINT "income_occurrences_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "income_occurrences_household_id_planned_date_index" ON "income_occurrences" USING btree ("household_id","planned_date");--> statement-breakpoint
CREATE INDEX "income_sources_household_id_index" ON "income_sources" USING btree ("household_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_occurrence_id_income_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."income_occurrences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_occurrence_id_index" ON "transactions" USING btree ("occurrence_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_occurrence_only_for_income" CHECK ("transactions"."occurrence_id" IS NULL OR "transactions"."type" = 'income');
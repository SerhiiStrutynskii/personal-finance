CREATE TABLE "goal_debts" (
	"goal_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	CONSTRAINT "goal_debts_goal_id_debt_id_pk" PRIMARY KEY("goal_id","debt_id")
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"currency" char(3) DEFAULT 'UAH' NOT NULL,
	"target_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"account_id" uuid,
	"target_amount" bigint,
	"monthly_contribution" bigint,
	"start_balance" bigint,
	"extra_payment" bigint,
	"strategy" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_kind_valid" CHECK ("goals"."kind" IN ('savings', 'debt_payoff')),
	CONSTRAINT "goals_status_valid" CHECK ("goals"."status" IN ('active', 'archived')),
	CONSTRAINT "goals_strategy_valid" CHECK ("goals"."strategy" IN ('avalanche', 'snowball')),
	CONSTRAINT "goals_target_amount_positive" CHECK ("goals"."target_amount" > 0),
	CONSTRAINT "goals_monthly_contribution_positive" CHECK ("goals"."monthly_contribution" > 0),
	CONSTRAINT "goals_start_balance_non_negative" CHECK ("goals"."start_balance" >= 0),
	CONSTRAINT "goals_extra_payment_non_negative" CHECK ("goals"."extra_payment" >= 0),
	CONSTRAINT "goals_savings_shape" CHECK (("goals"."kind" = 'savings') = ("goals"."account_id" IS NOT NULL AND "goals"."target_amount" IS NOT NULL)),
	CONSTRAINT "goals_savings_only_fields" CHECK ("goals"."kind" <> 'savings' OR ("goals"."start_balance" IS NULL AND "goals"."extra_payment" IS NULL AND "goals"."strategy" IS NULL)),
	CONSTRAINT "goals_debt_payoff_shape" CHECK ("goals"."kind" <> 'debt_payoff' OR ("goals"."target_date" IS NOT NULL AND "goals"."start_balance" IS NOT NULL
        AND "goals"."extra_payment" IS NOT NULL AND "goals"."strategy" IS NOT NULL AND "goals"."monthly_contribution" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "goal_debts" ADD CONSTRAINT "goal_debts_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_debts" ADD CONSTRAINT "goal_debts_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_debts_debt_id_index" ON "goal_debts" USING btree ("debt_id");--> statement-breakpoint
CREATE INDEX "goals_household_id_index" ON "goals" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goals_active_account_unique" ON "goals" USING btree ("account_id") WHERE "goals"."status" = 'active';
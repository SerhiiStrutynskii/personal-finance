CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"price_minor" bigint,
	"currency" char(3) DEFAULT 'UAH' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_household_name_unique" UNIQUE("household_id","name_key"),
	CONSTRAINT "products_unit_valid" CHECK ("products"."unit" IN ('pcs', 'kg', 'l', 'pack')),
	CONSTRAINT "products_price_positive" CHECK ("products"."price_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
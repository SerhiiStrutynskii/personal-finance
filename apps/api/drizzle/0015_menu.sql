CREATE TABLE "dish_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dish_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_milli" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "dish_ingredients_product_unique" UNIQUE("dish_id","product_id"),
	CONSTRAINT "dish_ingredients_quantity_positive" CHECK ("dish_ingredients"."quantity_milli" > 0)
);
--> statement-breakpoint
CREATE TABLE "dishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dishes_household_name_unique" UNIQUE("household_id","name_key")
);
--> statement-breakpoint
CREATE TABLE "meal_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_types_household_name_unique" UNIQUE("household_id","name_key")
);
--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_types" ADD CONSTRAINT "meal_types_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dish_ingredients_product_id_index" ON "dish_ingredients" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "meal_types_household_id_position_index" ON "meal_types" USING btree ("household_id","position");--> statement-breakpoint
-- Типові прийоми їжі для наявних домогосподарств (дописано вручну). name_key задано літералом:
-- у базі з collation C lower() не змінює кирилицю.
INSERT INTO "meal_types" ("household_id", "name", "name_key", "position")
SELECT h."id", d."name", d."name_key", d."position"
FROM "households" h
CROSS JOIN (VALUES ('Сніданок', 'сніданок', 0), ('Обід', 'обід', 1), ('Вечеря', 'вечеря', 2))
  AS d("name", "name_key", "position")
WHERE NOT EXISTS (SELECT 1 FROM "meal_types" m WHERE m."household_id" = h."id");

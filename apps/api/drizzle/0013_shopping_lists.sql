CREATE TABLE "shopping_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_milli" integer NOT NULL,
	"expected_unit_price_minor" bigint,
	"actual_unit_price_minor" bigint,
	"is_bought" boolean DEFAULT false NOT NULL,
	"bought_at" timestamp with time zone,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopping_list_items_product_unique" UNIQUE("list_id","product_id"),
	CONSTRAINT "shopping_list_items_quantity_positive" CHECK ("shopping_list_items"."quantity_milli" > 0),
	CONSTRAINT "shopping_list_items_prices_positive" CHECK ("shopping_list_items"."expected_unit_price_minor" > 0 AND "shopping_list_items"."actual_unit_price_minor" > 0),
	CONSTRAINT "shopping_list_items_bought_at" CHECK ("shopping_list_items"."is_bought" = ("shopping_list_items"."bought_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "shopping_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"currency" char(3) DEFAULT 'UAH' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_list_id_shopping_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shopping_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shopping_list_items_product_id_index" ON "shopping_list_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "shopping_lists_household_id_created_at_index" ON "shopping_lists" USING btree ("household_id","created_at");
CREATE TABLE "access_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text,
	"display_name" text,
	"avatar_id" integer,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"subadmin_id" integer,
	"package_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "access_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"subadmin_id" integer,
	"username" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "avatars" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"image_url" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"logo" text,
	"category" text,
	"stream_url" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movies" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"poster" text,
	"category" text,
	"file_path" text NOT NULL,
	"duration" integer,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"duration_minutes" integer DEFAULT 43200 NOT NULL,
	"price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code_id" integer NOT NULL,
	"device_id" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subadmin_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"subadmin_id" integer NOT NULL,
	"package_id" integer NOT NULL,
	"custom_price" numeric(10, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_subadmin_package" UNIQUE("subadmin_id","package_id")
);
--> statement-breakpoint
CREATE TABLE "subadmins" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"balance" numeric(10, 2) DEFAULT '0' NOT NULL,
	"whatsapp_number" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subadmins_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_alert_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"code_id" integer NOT NULL,
	"subadmin_id" integer NOT NULL,
	"alert_type" text DEFAULT 'expiring_soon' NOT NULL,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_avatar_id_avatars_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."avatars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_subadmin_id_subadmins_id_fk" FOREIGN KEY ("subadmin_id") REFERENCES "public"."subadmins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_subadmin_id_subadmins_id_fk" FOREIGN KEY ("subadmin_id") REFERENCES "public"."subadmins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_code_id_access_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."access_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subadmin_packages" ADD CONSTRAINT "subadmin_packages_subadmin_id_subadmins_id_fk" FOREIGN KEY ("subadmin_id") REFERENCES "public"."subadmins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subadmin_packages" ADD CONSTRAINT "subadmin_packages_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_alert_logs" ADD CONSTRAINT "whatsapp_alert_logs_code_id_access_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."access_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_alert_logs" ADD CONSTRAINT "whatsapp_alert_logs_subadmin_id_subadmins_id_fk" FOREIGN KEY ("subadmin_id") REFERENCES "public"."subadmins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_access_codes_code" ON "access_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_admin_sessions_token" ON "admin_sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_channels_order" ON "channels" USING btree ("order");--> statement-breakpoint
CREATE INDEX "idx_channels_category" ON "channels" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_channels_name" ON "channels" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_movies_order" ON "movies" USING btree ("order");--> statement-breakpoint
CREATE INDEX "idx_movies_category" ON "movies" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_movies_title" ON "movies" USING btree ("title");--> statement-breakpoint
CREATE INDEX "idx_movies_created_at" ON "movies" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_sessions_token" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_sessions_code_id" ON "sessions" USING btree ("code_id");--> statement-breakpoint
CREATE INDEX "idx_wa_alert_code_type" ON "whatsapp_alert_logs" USING btree ("code_id","alert_type");--> statement-breakpoint
CREATE INDEX "idx_wa_alert_subadmin" ON "whatsapp_alert_logs" USING btree ("subadmin_id");
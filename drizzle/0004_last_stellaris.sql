CREATE TABLE "user_company_memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"site_access_scope" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_company_memberships_scope_check" CHECK ("user_company_memberships"."site_access_scope" IN ('all_sites', 'selected_sites')),
	CONSTRAINT "user_company_memberships_status_check" CHECK ("user_company_memberships"."status" IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "user_site_memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_membership_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_site_memberships_status_check" CHECK ("user_site_memberships"."status" IN ('active', 'inactive'))
);
--> statement-breakpoint
ALTER TABLE "user_company_memberships" ADD CONSTRAINT "user_company_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_company_memberships" ADD CONSTRAINT "user_company_memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_site_memberships" ADD CONSTRAINT "user_site_memberships_company_fk" FOREIGN KEY ("company_membership_id","company_id") REFERENCES "public"."user_company_memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_site_memberships" ADD CONSTRAINT "user_site_memberships_site_fk" FOREIGN KEY ("site_id","company_id") REFERENCES "public"."sites"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_company_memberships_user_company_unique" ON "user_company_memberships" USING btree ("user_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_company_memberships_id_company_unique" ON "user_company_memberships" USING btree ("id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_site_memberships_membership_site_unique" ON "user_site_memberships" USING btree ("company_membership_id","site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_id_company_unique" ON "sites" USING btree ("id","company_id");--> statement-breakpoint

INSERT INTO "permissions" ("id", "code", "description", "created_at")
VALUES
  (gen_random_uuid(), 'ledger.read', '원장 조회', now()),
  (gen_random_uuid(), 'ledger.write', '원장 입력', now())
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT rp."role_id", p_new."id", now()
FROM "role_permissions" rp
JOIN "permissions" p_old ON rp."permission_id" = p_old."id"
CROSS JOIN "permissions" p_new
WHERE p_old."code" = 'master_data.write'
  AND p_new."code" IN ('ledger.read', 'ledger.write')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
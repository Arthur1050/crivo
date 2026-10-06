CREATE TYPE "public"."whatsapp_account_kind" AS ENUM('unverified', 'test', 'production');

CREATE TABLE "whatsapp_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone_number_id" text NOT NULL,
	"analytics_phone_number" text,
	"waba_id" text,
	"account_timezone" text,
	"account_kind" "whatsapp_account_kind" DEFAULT 'unverified' NOT NULL,
	"ownership_verified_at" timestamp with time zone,
	"analytics_verified_at" timestamp with time zone,
	"usage_enabled" boolean DEFAULT false NOT NULL,
	"configuration_revision" integer DEFAULT 1 NOT NULL,
	"last_usage_attempt_at" timestamp with time zone,
	"usage_sync_token" uuid,
	"usage_sync_deadline" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_channels_positive_revision" CHECK ("whatsapp_channels"."configuration_revision" > 0),
	CONSTRAINT "whatsapp_channels_lease_pair" CHECK (("whatsapp_channels"."usage_sync_token" is null) = ("whatsapp_channels"."usage_sync_deadline" is null)),
	CONSTRAINT "whatsapp_channels_usage_verified" CHECK (not "whatsapp_channels"."usage_enabled" or (
      "whatsapp_channels"."account_kind" = 'production' and "whatsapp_channels"."ownership_verified_at" is not null
      and "whatsapp_channels"."analytics_verified_at" is not null and nullif(trim("whatsapp_channels"."waba_id"), '') is not null
      and nullif(trim("whatsapp_channels"."account_timezone"), '') is not null
      and nullif(trim("whatsapp_channels"."analytics_phone_number"), '') is not null
    ))
);


ALTER TABLE "whatsapp_channels" ADD CONSTRAINT "whatsapp_channels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "whatsapp_channels_phone_number_id_idx" ON "whatsapp_channels" USING btree ("phone_number_id");

CREATE UNIQUE INDEX "whatsapp_channels_tenant_phone_idx" ON "whatsapp_channels" USING btree ("tenant_id","phone_number_id");

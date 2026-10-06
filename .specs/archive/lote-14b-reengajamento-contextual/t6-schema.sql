CREATE TABLE "whatsapp_usage" (
	"tenant_id" uuid NOT NULL,
	"phone_number_id" text NOT NULL,
	"month_start" timestamp with time zone NOT NULL,
	"configuration_revision" integer NOT NULL,
	"account_timezone" text NOT NULL,
	"month_end" timestamp with time zone NOT NULL,
	"query_end" timestamp with time zone,
	"free_service_volume" bigint,
	"last_success_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"failure_code" text,
	"query_sequence" integer DEFAULT 0 NOT NULL,
	"response_token" uuid,
	"expires_at" timestamp with time zone DEFAULT now() + interval '30 days' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_usage_period_revision_pk" PRIMARY KEY("tenant_id","phone_number_id","month_start","configuration_revision"),
	CONSTRAINT "whatsapp_usage_revision_sequence" CHECK ("whatsapp_usage"."configuration_revision" > 0 and "whatsapp_usage"."query_sequence" >= 0),
	CONSTRAINT "whatsapp_usage_nonnegative_volume" CHECK ("whatsapp_usage"."free_service_volume" >= 0),
	CONSTRAINT "whatsapp_usage_civil_month" CHECK (("whatsapp_usage"."month_start" at time zone "whatsapp_usage"."account_timezone") = date_trunc('month', "whatsapp_usage"."month_start" at time zone "whatsapp_usage"."account_timezone") and "whatsapp_usage"."month_end" = ((date_trunc('month', "whatsapp_usage"."month_start" at time zone "whatsapp_usage"."account_timezone") + interval '1 month') at time zone "whatsapp_usage"."account_timezone")),
	CONSTRAINT "whatsapp_usage_query_period" CHECK ("whatsapp_usage"."query_end" >= "whatsapp_usage"."month_start" and "whatsapp_usage"."query_end" <= "whatsapp_usage"."month_end"),
	CONSTRAINT "whatsapp_usage_success_fields" CHECK (("whatsapp_usage"."free_service_volume" is null) = ("whatsapp_usage"."last_success_at" is null) and ("whatsapp_usage"."query_end" is null) = ("whatsapp_usage"."last_success_at" is null))
);


CREATE INDEX "whatsapp_usage_expiry_idx" ON "whatsapp_usage" USING btree ("expires_at");

ALTER TABLE "whatsapp_usage" ADD CONSTRAINT "whatsapp_usage_tenant_channel_fk" FOREIGN KEY ("tenant_id","phone_number_id") REFERENCES "public"."whatsapp_channels"("tenant_id","phone_number_id") ON DELETE no action ON UPDATE no action;

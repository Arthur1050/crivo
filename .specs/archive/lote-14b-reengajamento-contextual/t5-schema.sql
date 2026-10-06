CREATE TYPE "public"."whatsapp_receipt_classification" AS ENUM('pending', 'paid_service', 'free_service', 'free_entry_point', 'unavailable', 'not_delivered');

CREATE TABLE "whatsapp_message_receipts" (
	"tenant_id" uuid NOT NULL,
	"phone_number_id" text NOT NULL,
	"wamid" text NOT NULL,
	"message_id" uuid,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"pricing_model" text,
	"category" text,
	"pricing_type" text,
	"billable" boolean,
	"pricing_conflict" boolean DEFAULT false NOT NULL,
	"classification" "whatsapp_receipt_classification" DEFAULT 'pending' NOT NULL,
	"failure_code" integer,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"orphan_expires_at" timestamp with time zone DEFAULT now() + interval '30 days',
	CONSTRAINT "whatsapp_message_receipts_tenant_id_phone_number_id_wamid_pk" PRIMARY KEY("tenant_id","phone_number_id","wamid"),
	CONSTRAINT "whatsapp_message_receipts_orphan_expiry" CHECK (("whatsapp_message_receipts"."message_id" is null) = ("whatsapp_message_receipts"."orphan_expires_at" is not null)),
	CONSTRAINT "whatsapp_message_receipts_seen_order" CHECK ("whatsapp_message_receipts"."last_seen_at" >= "whatsapp_message_receipts"."first_seen_at"),
	CONSTRAINT "whatsapp_message_receipts_conflict" CHECK (not "whatsapp_message_receipts"."pricing_conflict" or "whatsapp_message_receipts"."classification" = 'unavailable'),
	CONSTRAINT "whatsapp_message_receipts_identity_nonempty" CHECK (length(trim("whatsapp_message_receipts"."wamid")) > 0)
);


ALTER TABLE "messages" ADD COLUMN "whatsapp_phone_number_id" text;

CREATE INDEX "whatsapp_message_receipts_message_idx" ON "whatsapp_message_receipts" USING btree ("tenant_id","message_id");

CREATE INDEX "whatsapp_message_receipts_orphan_expiry_idx" ON "whatsapp_message_receipts" USING btree ("orphan_expires_at") WHERE "whatsapp_message_receipts"."message_id" is null;

CREATE UNIQUE INDEX "messages_receipt_identity_idx" ON "messages" USING btree ("tenant_id","whatsapp_phone_number_id","external_id","id");

ALTER TABLE "whatsapp_message_receipts" ADD CONSTRAINT "whatsapp_message_receipts_tenant_channel_fk" FOREIGN KEY ("tenant_id","phone_number_id") REFERENCES "public"."whatsapp_channels"("tenant_id","phone_number_id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "whatsapp_message_receipts" ADD CONSTRAINT "whatsapp_message_receipts_message_identity_fk" FOREIGN KEY ("tenant_id","phone_number_id","wamid","message_id") REFERENCES "public"."messages"("tenant_id","whatsapp_phone_number_id","external_id","id") ON DELETE cascade ON UPDATE no action;

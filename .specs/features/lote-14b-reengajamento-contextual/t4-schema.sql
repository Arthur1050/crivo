CREATE TYPE "public"."reengagement_state" AS ENUM('preparing', 'cancelled', 'omitted', 'authorized', 'accepted_pending_record', 'accepted', 'refused', 'uncertain');

CREATE TABLE "reengagement_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"phone_number_id" text NOT NULL,
	"anchor_message_id" uuid NOT NULL,
	"anchor_sent_at" timestamp with time zone NOT NULL,
	"reset_observed_at" timestamp with time zone,
	"agent_state_revision" integer NOT NULL,
	"state" "reengagement_state" DEFAULT 'preparing' NOT NULL,
	"reason_code" text,
	"claim_token" uuid,
	"claim_expires_at" timestamp with time zone,
	"prepared_at" timestamp with time zone,
	"submitted_text" text,
	"dispatch_authorized_at" timestamp with time zone,
	"dispatch_completion_deadline" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"wamid" text,
	"message_id" uuid,
	"origin_session_start_message_id" uuid,
	"origin_session_end_message_id" uuid,
	"first_inbound_message_id" uuid,
	"bridge_revision" integer DEFAULT 1 NOT NULL,
	"bridge_invalidated_at" timestamp with time zone,
	"bridge_last_inbound_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"escalation_result" text,
	"escalation_reason_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reengagement_episodes_positive_revisions" CHECK ("reengagement_episodes"."agent_state_revision" > 0 and "reengagement_episodes"."bridge_revision" > 0),
	CONSTRAINT "reengagement_episodes_claim_pair" CHECK (("reengagement_episodes"."claim_token" is null) = ("reengagement_episodes"."claim_expires_at" is null)),
	CONSTRAINT "reengagement_episodes_dispatch_pair" CHECK (("reengagement_episodes"."dispatch_authorized_at" is null) = ("reengagement_episodes"."dispatch_completion_deadline" is null)),
	CONSTRAINT "reengagement_episodes_dispatch_state" CHECK (("reengagement_episodes"."state" in ('preparing', 'cancelled', 'omitted')) = ("reengagement_episodes"."dispatch_authorized_at" is null)),
	CONSTRAINT "reengagement_episodes_accepted_identity" CHECK ("reengagement_episodes"."state" not in ('accepted_pending_record', 'accepted') or ("reengagement_episodes"."accepted_at" is not null and "reengagement_episodes"."wamid" is not null and length(trim("reengagement_episodes"."wamid")) > 0))
);


CREATE UNIQUE INDEX "reengagement_episodes_key_idx" ON "reengagement_episodes" USING btree ("tenant_id","lead_id","phone_number_id","anchor_message_id");

CREATE INDEX "reengagement_episodes_lead_anchor_idx" ON "reengagement_episodes" USING btree ("tenant_id","lead_id","anchor_sent_at");

CREATE INDEX "reengagement_episodes_expired_claim_idx" ON "reengagement_episodes" USING btree ("claim_expires_at") WHERE "reengagement_episodes"."state" = 'preparing' and "reengagement_episodes"."dispatch_authorized_at" is null;

CREATE INDEX "reengagement_episodes_pending_acceptance_idx" ON "reengagement_episodes" USING btree ("updated_at") WHERE "reengagement_episodes"."state" = 'accepted_pending_record';

ALTER TABLE "reengagement_episodes" ADD CONSTRAINT "reengagement_episodes_tenant_lead_fk" FOREIGN KEY ("tenant_id","lead_id") REFERENCES "public"."leads"("tenant_id","id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "reengagement_episodes" ADD CONSTRAINT "reengagement_episodes_tenant_channel_fk" FOREIGN KEY ("tenant_id","phone_number_id") REFERENCES "public"."whatsapp_channels"("tenant_id","phone_number_id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "reengagement_episodes" ADD CONSTRAINT "reengagement_episodes_tenant_anchor_fk" FOREIGN KEY ("tenant_id","anchor_message_id") REFERENCES "public"."messages"("tenant_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "reengagement_episodes" ADD CONSTRAINT "reengagement_episodes_tenant_message_fk" FOREIGN KEY ("tenant_id","message_id") REFERENCES "public"."messages"("tenant_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "reengagement_episodes" ADD CONSTRAINT "reengagement_episodes_tenant_origin_start_fk" FOREIGN KEY ("tenant_id","origin_session_start_message_id") REFERENCES "public"."messages"("tenant_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "reengagement_episodes" ADD CONSTRAINT "reengagement_episodes_tenant_origin_end_fk" FOREIGN KEY ("tenant_id","origin_session_end_message_id") REFERENCES "public"."messages"("tenant_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "reengagement_episodes" ADD CONSTRAINT "reengagement_episodes_tenant_first_inbound_fk" FOREIGN KEY ("tenant_id","first_inbound_message_id") REFERENCES "public"."messages"("tenant_id","id") ON DELETE no action ON UPDATE no action;

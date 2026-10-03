-- T11: mês civil inteiro nas fronteiras de overlap/gap. T6 histórico permanece intacto.
-- Aplicação somente nos cinco alvos de teste após revisão pelo root.
BEGIN;
ALTER TABLE "whatsapp_usage" DROP CONSTRAINT "whatsapp_usage_civil_month";
ALTER TABLE "whatsapp_usage" ADD CONSTRAINT "whatsapp_usage_civil_month" CHECK (
  date_trunc('second', "month_start") = "month_start"
  AND date_trunc('second', "month_end") = "month_end"
  AND date_trunc('month', ("month_start" - interval '1 microsecond') AT TIME ZONE "account_timezone") = date_trunc('month', "month_start" AT TIME ZONE "account_timezone") - interval '1 month'
  AND date_trunc('month', "month_end" AT TIME ZONE "account_timezone") = date_trunc('month', "month_start" AT TIME ZONE "account_timezone") + interval '1 month'
  AND date_trunc('month', ("month_end" - interval '1 microsecond') AT TIME ZONE "account_timezone") = date_trunc('month', "month_start" AT TIME ZONE "account_timezone")
);
COMMIT;

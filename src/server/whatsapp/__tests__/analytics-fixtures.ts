import { randomUUID } from "node:crypto";
import { db } from "../../../db";
import { whatsappChannels } from "../../../db/schema";
import { createAnalyticsAdapter } from "../analytics";

export function analyticsFixtureAdapter(base: Date) {
  return createAnalyticsAdapter({ contract: { id: "fixture-sync-v25", graphVersion: "v25.0", sourceUrl: "https://example.invalid/fixture",
    verifiedAt: base, responseSha256: "a".repeat(64) }, format: "meta-v25-pricing-analytics", phoneFilter: "normalized-number",
    pagination: "single-page-no-paging", fullMonthSha256: "b".repeat(64), numberFilterSha256: "c".repeat(64), paginationSha256: "d".repeat(64) })!;
}
export function analyticsFixtureGraph(address: RequestInfo | URL, volume = 999) {
  const url = new URL(String(address));
  return new Response(JSON.stringify({ data: [{ data_points: [{ start: Number(url.searchParams.get("start")), end: Number(url.searchParams.get("end")),
    phone_number: JSON.parse(url.searchParams.get("phone_numbers")!)[0], country: "BR", pricing_type: "FREE_CUSTOMER_SERVICE", pricing_category: "SERVICE", volume }] }] }));
}
export async function analyticsFixtureChannel(tenantId: string, base: Date, patch: Partial<typeof whatsappChannels.$inferInsert> = {}) {
  const [row] = await db.insert(whatsappChannels).values({ tenantId, phoneNumberId: `fixture-${randomUUID()}`, accountKind: "production",
    ownershipVerifiedAt: base, analyticsVerifiedAt: base, usageEnabled: true, wabaId: "1000000000000000", analyticsPhoneNumber: "5511999990000",
    accountTimezone: "UTC", ...patch }).returning();
  return row;
}

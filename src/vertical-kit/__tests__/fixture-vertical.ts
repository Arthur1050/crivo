import { defineVertical } from "../index";

export const testVertical = defineVertical({
  id: "test",
  brand: { name: "Acme", problemUrn: "acme", tenantHeader: "X-Acme-Tenant", alertTag: "acme" },
  resources: [],
  appointments: false,
  qualification: null,
  documentSegments: null,
});

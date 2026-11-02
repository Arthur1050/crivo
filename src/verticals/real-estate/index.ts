import { ROLE } from "../../lib/vocabulary";
import { defineVertical } from "../../vertical-kit";
import { MODALITY } from "./vocabulary";

const segments = Object.values(MODALITY);

export const realEstate = defineVertical({
  id: "real-estate",
  brand: { name: "Krivo", problemUrn: "krivo", tenantHeader: "X-Krivo-Tenant", alertTag: "krivo" },
  resources: [{
    name: "catalog",
    permissions: {
      [ROLE.admin]: ["read", "write"],
      [ROLE.manager]: ["read", "write"],
      [ROLE.attendant]: ["read"],
    },
  }],
  appointments: true,
  qualification: null,
  documentSegments: {
    values: segments,
    matches(documentSegment, querySegment) {
      if (!segments.some(segment => segment === documentSegment) || !segments.some(segment => segment === querySegment)) return false;
      return documentSegment === MODALITY.both || querySegment === MODALITY.both || documentSegment === querySegment;
    },
  },
});

import "server-only";

import { realEstate } from "../verticals/real-estate";
import { getDirectDocumentContext as readContext, type DirectContextQuery } from "../server/integration/context";
import { parseContextQuery as parseQuery } from "../server/integration/parsers";

export { DocumentContextBudgetExceeded } from "../server/integration/context";

export function parseContextQuery(json: unknown) {
  return parseQuery(json, realEstate.documentSegments);
}

export function getDirectDocumentContext(tenantId: string, query: DirectContextQuery, now?: Date) {
  return readContext(tenantId, query, now, realEstate.documentSegments);
}

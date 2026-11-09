"use server";

import { getActiveTenantId } from "../tenant";
import { denyIfForbidden } from "./permission";
import { saveStorefrontAction as saveStorefront } from "../../verticals/real-estate/storefront/action";
import type { SaveStorefrontActionResult } from "../../verticals/real-estate/storefront/action";
import type { StorefrontInput } from "../../verticals/real-estate/storefront/validation";

export type { SaveStorefrontActionResult, StorefrontFieldError } from "../../verticals/real-estate/storefront/action";

export async function saveStorefrontAction(input: StorefrontInput): Promise<SaveStorefrontActionResult> {
  return saveStorefront(input, {
    authorizeWrite: () => denyIfForbidden("settings", "write"),
    getActiveTenantId,
  });
}

"use server";

import { getActiveTenantId } from "../tenant";
import { denyIfForbidden } from "./permission";
import * as catalog from "../../verticals/real-estate/actions/properties";

export type {
  ActionResult,
  CreatePropertyInput,
  DeletePropertyInput,
  SetPropertyFeaturedInput,
  SetPropertyPublishedInput,
  SetPropertyStatusInput,
  UpdatePropertyInput,
} from "../../verticals/real-estate/actions/properties";

const context = {
  authorizeWrite: () => denyIfForbidden("catalog", "write"),
  getActiveTenantId,
};

export async function createPropertyAction(input: catalog.CreatePropertyInput): Promise<catalog.ActionResult> {
  return catalog.createPropertyAction(input, context);
}

export async function updatePropertyAction(input: catalog.UpdatePropertyInput): Promise<catalog.ActionResult> {
  return catalog.updatePropertyAction(input, context);
}

export async function deletePropertyAction(input: catalog.DeletePropertyInput): Promise<catalog.ActionResult> {
  return catalog.deletePropertyAction(input, context);
}

export async function setPropertyPublishedAction(input: catalog.SetPropertyPublishedInput): Promise<catalog.ActionResult> {
  return catalog.setPropertyPublishedAction(input, context);
}

export async function setPropertyStatusAction(input: catalog.SetPropertyStatusInput): Promise<catalog.ActionResult> {
  return catalog.setPropertyStatusAction(input, context);
}

export async function setPropertyFeaturedAction(input: catalog.SetPropertyFeaturedInput): Promise<catalog.ActionResult> {
  return catalog.setPropertyFeaturedAction(input, context);
}

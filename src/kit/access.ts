import { createAccess, permissionDeniedMessage } from "../lib/access";
import { realEstate } from "../verticals/real-estate";

export const access = {
  ...createAccess(realEstate),
  denialMessage(resource: string, action: "read" | "write") {
    return permissionDeniedMessage(resource, action, resource === "catalog" ? "imoveis" : undefined);
  },
};
export const { can, RESOURCES } = access;
export { ACTIONS, ROLES, parseRoles, type Action, type Resource, type Role } from "../lib/access";

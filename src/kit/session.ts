import "server-only";
import { createSessionKit } from "../server/auth/session";
import { auth } from "./auth";
import { access } from "./access";
export const { resolveAuthContext, verifySession, getLeadScope, requirePermission } = createSessionKit(auth, access);
export * from "../server/auth/session";

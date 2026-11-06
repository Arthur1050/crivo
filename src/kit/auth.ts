import "server-only";
import { createAuth } from "../server/auth/config";
import { sendResetPasswordEmail } from "./email";
export const auth = createAuth(sendResetPasswordEmail);

import "server-only";
import { createEmailSender } from "../server/auth/email";
import { realEstate } from "../verticals/real-estate";
export const { sendInvitationEmail, sendResetPasswordEmail, sendIntegrationAlertEmail } = createEmailSender(realEstate.brand);
export type { EmailResult, InvitationEmail, ResetPasswordEmail, IntegrationAlertEmail } from "../server/auth/email";

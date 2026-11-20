import { createIntegrationAlertFormatter } from "../lib/integration-alert";
import { realEstate } from "../verticals/real-estate";
export const formatIntegrationAlertEmail = createIntegrationAlertFormatter(realEstate.brand);
export { planIntegrationAlerts, type TenantHealthSnapshot } from "../lib/integration-alert";

import "server-only";

import { createPublishAgentState } from "../server/reengagement/agent-state";
import { createPrepareFrame } from "../server/reengagement/context";
import { realEstate } from "../verticals/real-estate";

export const prepareFrame = createPrepareFrame(realEstate.qualification);
export const publishAgentState = createPublishAgentState(realEstate.qualification);

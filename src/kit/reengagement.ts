import "server-only";

import { createPrepareFrame } from "../server/reengagement/context";
import { realEstate } from "../verticals/real-estate";

export const prepareFrame = createPrepareFrame(realEstate.qualification);

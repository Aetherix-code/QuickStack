import { z } from "zod";

export const staleNodeCleanupSettingsZodModel = z.object({
    enabled: z.boolean(),
    thresholdMinutes: z.coerce.number().min(1).max(1440),
});

export type StaleNodeCleanupSettingsModel = z.infer<typeof staleNodeCleanupSettingsZodModel>;

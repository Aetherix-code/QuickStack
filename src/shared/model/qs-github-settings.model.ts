import { z } from "zod";

export const qsGitHubSettingsZodModel = z.object({
  githubClientId: z.string().trim(),
  githubClientSecret: z.string().trim(),
})

export type QsGitHubSettingsModel = z.infer<typeof qsGitHubSettingsZodModel>;

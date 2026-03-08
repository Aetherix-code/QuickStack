import { stringToNumber, stringToOptionalNumber } from "@/shared/utils/zod.utils";
import { z } from "zod";

export const appRateLimitsZodModel = z.object({
  memoryReservation: stringToOptionalNumber,
  memoryLimit: stringToOptionalNumber,
  cpuReservation: stringToOptionalNumber,
  cpuLimit: stringToOptionalNumber,
  minReplicas: stringToNumber,
  maxReplicas: stringToNumber,
  currentReplicas: stringToNumber,
  autoScalingEnabled: z.boolean(),
  cpuThreshold: stringToNumber,
  memoryThreshold: stringToNumber,
})

export type AppRateLimitsModel = z.infer<typeof appRateLimitsZodModel>;
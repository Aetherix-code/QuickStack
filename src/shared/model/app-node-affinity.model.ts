import { z } from "zod";

export const nodeLabelSelectorZodModel = z.object({
  key: z.string().min(1, "Label key is required"),
  value: z.string().min(1, "Label value is required"),
  weight: z.number().min(1).max(100).optional(),
});

export const appNodeAffinityZodModel = z.object({
  nodeAffinityType: z.enum(['NONE', 'REQUIRED', 'PREFERRED']),
  nodeAffinityLabelSelector: z.array(nodeLabelSelectorZodModel).default([]),
});

export type NodeLabelSelectorModel = z.infer<typeof nodeLabelSelectorZodModel>;
export type AppNodeAffinityModel = z.infer<typeof appNodeAffinityZodModel>;

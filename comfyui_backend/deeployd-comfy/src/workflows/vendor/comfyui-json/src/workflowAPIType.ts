import { z } from "zod";

export const workflowType = z.object({
  last_node_id: z.number(),
  last_link_id: z.number(),
  nodes: z.array(
    z.object({
      id: z.number(),
      type: z.string(),
      widgets_values: z.array(z.any()),
    }),
  ),
});

export const snapshotType = z.object({
  comfyui: z.string(),
  git_custom_nodes: z.record(
    z.object({
      hash: z.string(),
      disabled: z.boolean(),
    }),
  ),
  file_custom_nodes: z.array(z.any()),
});
export type CustomNodesDeps = z.infer<typeof CustomNodesDepsType>;

export type FileDefs = z.infer<typeof FileReferencesType>;

export type FileReference = {
  value: string;
  type: string;
  hash: string | undefined;
  url: string | undefined;
};

export const workflowAPINodeType = z.object({
  inputs: z.record(z.any()),
  class_type: z.string().optional(),
});

export const CustomNodesDepsType = z.record(
  z.object({
    name: z.string(),
    node: z.array(workflowAPINodeType).optional(),
    hash: z.string().optional(),
    url: z.string(),
    files: z.array(z.string()).optional(),
    install_type: z.union([z.enum(["copy", "unzip", "git-clone"]), z.string()]).optional(), 
    warning: z.string().optional(),
    pip: z.array(z.string()).optional(),
  }),
);

export const FileReferenceType = z.object({
  name: z.string(),
  hash: z.string().optional(),
  url: z.string().optional(),
});

export const FileReferencesType = z.record(z.array(FileReferenceType));

export const workflowAPIType = z.record(workflowAPINodeType);

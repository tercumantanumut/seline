import { z } from "zod";

const NodeInput = z.object({
  name: z.string(),
  type: z.string(),
  link: z.number().nullable(),
  widget: z.object({
    name: z.string(),
  }).optional(),
});

const NodeOutput = z.object({
  name: z.string(),
  type: z.string(),
  links: z.array(z.number()).nullable(),
  shape: z.number().optional(),
  slot_index: z.number().optional(),
});

const Node = z.object({
  id: z.number(),
  type: z.string(),
  pos: z.array(z.number()),
  size: z.any(),
  flags: z.object({}),
  order: z.number(),
  mode: z.number(),
  inputs: z.array(NodeInput).optional(),
  outputs: z.array(NodeOutput).optional(),
  properties: z.record(z.string()),
  widgets_values: z.array(z.union([z.number(), z.string()])).optional(),
  color: z.string().optional(),
  bgcolor: z.string().optional(),
});

const Extra = z.object({
  ds: z.object({
    scale: z.number(),
    offset: z.union([
      z.tuple([z.number(), z.number()]),
      z.record(z.number())
    ]),
  }),
});

const Config = z.object({});

export const WorkflowJson = z.object({
  last_node_id: z.number(),
  last_link_id: z.number(),
  nodes: z.array(Node),
  links: z.array(z.any()),
  groups: z.array(z.any()),
  config: Config,
  extra: z.any(),
  version: z.number(),
});

export type WorkflowJsonType = z.infer<typeof WorkflowJson>;
export type NodeType = z.infer<typeof Node>;

// -----------------    
// type NodeInput = {
//   name: string;
//   type: string;
//   link: number | null;
//   widget?: {
//     name: string;
//   };
// };

// type NodeOutput = {
//   name: string;
//   type: string;
//   links: number[] | null;
//   shape?: number;
//   slot_index?: number;
// };

// type Node = {
//   id: number;
//   type: string;
//   pos: [number, number];
//   size: {
//     [key: string]: number;
//   };
//   flags: object;
//   order: number;
//   mode: number;
//   inputs?: NodeInput[];
//   outputs?: NodeOutput[];
//   properties: {
//     [key: string]: string;
//   };
//   widgets_values: (number | string)[];
//   color?: string;
//   bgcolor?: string;
// };

// type Extra = {
//   ds: {
//     scale: number;
//     offset: [number, number] | { [key: string]: number };
//   };
// };

// type Config = object;

// type WorkflowJson = {
//   last_node_id: number;
//   last_link_id: number;
//   nodes: Node[];
//   links: any[];
//   groups: any[];
//   config: any;
//   extra: any;
//   version: any;
// };

import { computeCustomModelsMap } from "./computeCustomModelsMap";
import { computeExternalFilesMap } from "./computeExternalFilesMap";
import {
  computeCustomNodesMap,
  computeCustomNodesMapJson,
  type ExtensionNodeMap,
  type SnapshotType,
  type WorkflowAPIType,
} from "./computeCustomNodesMap";
import { z } from "zod";
import { CustomNodesDepsType } from ".";
import { FileReferencesType } from "./workflowAPIType";
import type { WorkflowJsonType } from "./workflowJsonType";

export const DependencyGraphType = z.object({
  comfyui: z.string(),
  missing_nodes: z.array(z.string()),
  custom_nodes: CustomNodesDepsType,
  models: FileReferencesType,
  files: FileReferencesType,
});

export async function generateDependencyGraph({
  workflow_api,
  snapshot,
  computeFileHash,
  handleFileUpload,
  existingDependencies,
  cachedExtensionsMap,
  pullLatestHashIfMissing = true
}: {
  workflow_api: WorkflowAPIType;
  snapshot?: SnapshotType;
  computeFileHash?: (path: string) => Promise<string | undefined>;
  handleFileUpload?: (
    path: string,
    hash: string,
    prevHash?: string,
  ) => Promise<string>;
  existingDependencies?: z.infer<typeof DependencyGraphType>;
  cachedExtensionsMap?: ExtensionNodeMap,
  pullLatestHashIfMissing?: boolean;
}) {
  const {
    customNodes: deps, missingNodes
  } = await computeCustomNodesMap({
    workflow_api,
    snapshot,
    pullLatestHashIfMissing,
    extensionNodeMap: cachedExtensionsMap
  });
  const comfyuihash = deps["https://github.com/comfyanonymous/ComfyUI"]?.hash ?? snapshot?.comfyui;
  delete deps["https://github.com/comfyanonymous/ComfyUI"];

  return {
    comfyui: comfyuihash,
    custom_nodes: deps,
    missing_nodes: missingNodes,
    models: await computeCustomModelsMap({
      workflow_api,
      getFileHash: computeFileHash,
      // Skipping upload for models
      // handleFileUpload,
      // existingFiles: existingDependencies?.models,
    }),
    files: await computeExternalFilesMap({
      workflow_api,
      getFileHash: computeFileHash,
      handleFileUpload,
      existingFiles: existingDependencies?.files,
    }),
  };
}

export async function generateDependencyGraphJson({
  workflow_json,
  snapshot,
  computeFileHash,
  handleFileUpload,
  existingDependencies,
  cachedExtensionsMap,
  pullLatestHashIfMissing = true
}: {
  workflow_json: WorkflowJsonType;
  snapshot?: SnapshotType;
  computeFileHash?: (path: string) => Promise<string | undefined>;
  handleFileUpload?: (
    path: string,
    hash: string,
    prevHash?: string,
  ) => Promise<string>;
  existingDependencies?: z.infer<typeof DependencyGraphType>;
  cachedExtensionsMap?: ExtensionNodeMap,
  pullLatestHashIfMissing?: boolean;
}) {
  const {
    customNodes: deps, missingNodes, conflictNodes
  } = await computeCustomNodesMapJson({
    workflow_json,
    snapshot,
    pullLatestHashIfMissing,
    extensionNodeMap: cachedExtensionsMap
  });
  const comfyuihash = deps["https://github.com/comfyanonymous/ComfyUI"]?.hash ?? snapshot?.comfyui;
  delete deps["https://github.com/comfyanonymous/ComfyUI"];

  return {
    comfyui: comfyuihash,
    custom_nodes: deps,
    missing_nodes: missingNodes,
    conflicting_nodes: conflictNodes,
    // TODO:  compute the rest
    // models: await computeCustomModelsMap({
    //   workflow_json,
    //   getFileHash: computeFileHash,
    // }),
    // files: await computeExternalFilesMap({
    //   workflow_json,
    //   getFileHash: computeFileHash,
    //   handleFileUpload,
    //   existingFiles: existingDependencies?.files,
    // }),
  };
}
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser, getSession, updateSession } from "@/lib/db/queries";
import { getCharacter, updateCharacter } from "@/lib/characters/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { analyzeWorkflow } from "@/lib/comfyui/custom/analyzer";
import { createCustomComfyUIWorkflow, listCustomComfyUIWorkflows } from "@/lib/comfyui/custom/store";
import { getCustomComfyUIToolId } from "@/lib/comfyui/custom/chat-integration";
import {
  createWorkflowNameFromFileName,
  extractWorkflowFileName,
  looksLikeComfyUIWorkflow,
} from "@/lib/comfyui/custom/workflow-utils";

export const runtime = "nodejs";

const MAX_FILES_PER_IMPORT = 25;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function mergeUniqueValues(current: string[], additions: string[]): string[] {
  return Array.from(new Set([...current, ...additions]));
}

function nextWorkflowName(baseName: string, existingLowerNames: Set<string>): string {
  let candidate = baseName;
  let suffix = 2;

  while (existingLowerNames.has(candidate.toLowerCase())) {
    candidate = `${baseName} ${suffix}`;
    suffix += 1;
  }

  existingLowerNames.add(candidate.toLowerCase());
  return candidate;
}

function resolveWorkflowNameOverride(formData: FormData, fileName: string): string | null {
  const candidates = [fileName, extractWorkflowFileName(fileName)];

  for (const candidate of candidates) {
    const value = formData.get(`name:${candidate}`);
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const authUserId = await requireAuth(request);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(authUserId, settings.localUserEmail);

    const formData = await request.formData();
    const uploadFiles = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);

    if (uploadFiles.length === 0) {
      return NextResponse.json({ error: "No workflow files provided." }, { status: 400 });
    }

    if (uploadFiles.length > MAX_FILES_PER_IMPORT) {
      return NextResponse.json(
        { error: `Too many workflow files. Maximum is ${MAX_FILES_PER_IMPORT}.` },
        { status: 400 }
      );
    }

    const oversized = uploadFiles.find((file) => file.size > MAX_FILE_SIZE_BYTES);
    if (oversized) {
      return NextResponse.json(
        {
          error: `File exceeds 5MB limit: ${oversized.name}`,
        },
        { status: 400 }
      );
    }

    const characterId = (formData.get("characterId") as string | null)?.trim() || null;
    const sessionId = (formData.get("sessionId") as string | null)?.trim() || null;

    let existingCharacter: Awaited<ReturnType<typeof getCharacter>> | null = null;
    if (characterId) {
      const character = await getCharacter(characterId);
      if (!character || character.userId !== dbUser.id) {
        return NextResponse.json({ error: "Selected agent was not found." }, { status: 400 });
      }
      existingCharacter = character;
    }

    const existingWorkflows = await listCustomComfyUIWorkflows();
    const existingWorkflowNames = new Set(existingWorkflows.map((workflow) => workflow.name.toLowerCase()));

    const createdWorkflows: Array<{
      id: string;
      name: string;
      toolId: string;
      fileName: string;
      inputCount: number;
      outputCount: number;
    }> = [];
    const failedFiles: Array<{ fileName: string; error: string }> = [];

    for (let index = 0; index < uploadFiles.length; index += 1) {
      const file = uploadFiles[index];
      const rawFileName = file.name || `workflow-${index + 1}.json`;
      const displayFileName = extractWorkflowFileName(rawFileName);

      if (!displayFileName.toLowerCase().endsWith(".json")) {
        failedFiles.push({
          fileName: rawFileName,
          error: "Only .json files are supported.",
        });
        continue;
      }

      try {
        const rawText = await file.text();
        const parsed = JSON.parse(rawText) as unknown;

        if (!looksLikeComfyUIWorkflow(parsed)) {
          failedFiles.push({
            fileName: rawFileName,
            error: "File is not a valid ComfyUI workflow JSON.",
          });
          continue;
        }

        const analysis = analyzeWorkflow(parsed);
        const nameOverride = resolveWorkflowNameOverride(formData, rawFileName);
        const baseName = nameOverride || createWorkflowNameFromFileName(displayFileName, index + 1);
        const resolvedName = nextWorkflowName(baseName, existingWorkflowNames);

        const created = await createCustomComfyUIWorkflow({
          name: resolvedName,
          description: `Imported from ${displayFileName}`,
          workflow: parsed,
          format: analysis.format,
          inputs: analysis.inputs,
          outputs: analysis.outputs,
          enabled: true,
          loadingMode: "deferred",
          timeoutSeconds: 300,
        });

        const toolId = getCustomComfyUIToolId(created.id);
        createdWorkflows.push({
          id: created.id,
          name: created.name,
          toolId,
          fileName: rawFileName,
          inputCount: created.inputs.length,
          outputCount: created.outputs?.length || 0,
        });
      } catch (error) {
        failedFiles.push({
          fileName: rawFileName,
          error: error instanceof Error ? error.message : "Failed to import workflow.",
        });
      }
    }

    if (createdWorkflows.length === 0) {
      return NextResponse.json(
        {
          error: "No valid ComfyUI workflows were imported.",
          failedFiles,
        },
        { status: 400 }
      );
    }

    const createdToolIds = createdWorkflows.map((workflow) => workflow.toolId);

    let enabledToolCount = 0;
    if (existingCharacter) {
      const currentMetadata = (existingCharacter.metadata as Record<string, unknown> | null) ?? {};
      const currentEnabledTools = toStringArray(currentMetadata.enabledTools);
      const currentWorkflowIds = toStringArray(currentMetadata.customComfyUIWorkflowIds);

      const mergedWorkflowIds = mergeUniqueValues(
        currentWorkflowIds,
        createdWorkflows.map((workflow) => workflow.id)
      );

      const nextMetadata: Record<string, unknown> = {
        ...currentMetadata,
        customComfyUIWorkflowIds: mergedWorkflowIds,
      };

      if (Array.isArray(currentMetadata.enabledTools)) {
        const mergedEnabledTools = mergeUniqueValues(currentEnabledTools, createdToolIds);
        enabledToolCount = mergedEnabledTools.length - currentEnabledTools.length;
        nextMetadata.enabledTools = mergedEnabledTools;
      }

      await updateCharacter(existingCharacter.id, {
        metadata: nextMetadata,
      });
    }

    let discoveredToolCount = 0;
    if (sessionId) {
      const session = await getSession(sessionId);
      if (session && session.userId === dbUser.id) {
        const currentMetadata = (session.metadata as Record<string, unknown> | null) ?? {};
        const currentDiscovered =
          currentMetadata.discoveredTools && typeof currentMetadata.discoveredTools === "object"
            ? (currentMetadata.discoveredTools as Record<string, unknown>)
            : {};

        const currentDiscoveredToolNames = toStringArray(currentDiscovered.toolNames);
        const mergedDiscoveredToolNames = mergeUniqueValues(currentDiscoveredToolNames, createdToolIds);
        discoveredToolCount = mergedDiscoveredToolNames.length - currentDiscoveredToolNames.length;

        await updateSession(sessionId, {
          metadata: {
            ...currentMetadata,
            discoveredTools: {
              ...currentDiscovered,
              toolNames: mergedDiscoveredToolNames,
              lastUpdatedAt: new Date().toISOString(),
            },
          },
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        createdWorkflows,
        failedFiles,
        enabledToolCount,
        discoveredToolCount,
      },
      { status: failedFiles.length > 0 ? 207 : 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to import ComfyUI workflows.",
      },
      { status: 500 }
    );
  }
}

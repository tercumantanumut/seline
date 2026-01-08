import { z } from "zod";
import {
  workflowAPIType,
  type FileReference,
  FileReferenceType,
} from "./workflowAPIType";

export type FileGroup = Record<
  string,
  z.infer<typeof FileReferenceType>[]
>;

export type ComputeFileMapProps = {
  workflow_api: z.infer<typeof workflowAPIType>;
  getFileHash?: (path: string) => Promise<string | undefined>;
  handleFileUpload?: (
    path: string,
    hash: string,
    prevHash?: string,
  ) => Promise<string>;
  existingFiles?: FileGroup;
};

export async function computeFileMap({
  workflow_api,
  folder,
  map,
  includeTypeInPath,
  getFileHash,
  handleFileUpload,
  existingFiles,
}: {
  folder: string;
  includeTypeInPath?: boolean;
  map: Record<
    string,
    {
      inputs: {
        name: string;
        type: string;
      }[];
    }
  >;
} & ComputeFileMapProps) {
  const cross = await Promise.all(
    Object.entries(workflow_api).map(async ([_, value]) => {
      const classType = value.class_type;
      if (classType && map[classType]) {
        const a = map[classType].inputs.map(async (inputKey) => {
          console.log("map", map[classType].inputs)
          // If this is a external input, it will be array
          console.log("inputkey.name: ", inputKey.name)
          if (Array.isArray(value.inputs[inputKey.name]) || value.inputs[inputKey.name] === undefined) return null;

          const file_path = `${folder}${
            includeTypeInPath ? `/${inputKey.type}` : ""
          }/${value.inputs[inputKey.name]}`;
          console.log('file_path', file_path)
          const hash: string | undefined = await getFileHash?.(file_path);
          let url: string | undefined = undefined;

          // Match if there are existing files
          if (hash) {
            const existingFile = existingFiles?.[inputKey.type]?.find(
              (file) => file.name === value.inputs[inputKey.name],
            );

            // Set it to existing file url
            url = existingFile?.url;

            // If the existing file url is not present or the hash is different
            if (
              existingFile?.url === undefined ||
              (existingFile.hash !== hash && hash !== undefined)
            ) {
              // Handle the file upload
              if (handleFileUpload) {
                url = await handleFileUpload(
                  file_path,
                  hash,
                  existingFile?.hash,
                );
              }
            }
          }

          console.log(value.inputs[inputKey.name])

          return value.inputs[inputKey.name]
            ? ({
                value: value.inputs[inputKey.name],
                type: inputKey.type,
                hash: hash,
                url: url,
              } satisfies FileReference)
            : null;
        });
        console.log(await Promise.all(a))
        return (await Promise.all(a)).filter(
          (inputValue): inputValue is FileReference => inputValue !== null,
        );
      }
      return null;
    }),
  );

  const groupedByType = cross
    .flat()
    .filter((item): item is FileReference => item !== null)
    .reduce((acc, input) => {
      if (!acc[input.type]) {
        acc[input.type] = [];
      }
      acc[input.type].push({
        name: input.value,
        hash: input.hash,
        url: input.url,
      });
      return acc;
    }, {} as FileGroup);

  return groupedByType;
}

import { computeFileMap, type ComputeFileMapProps } from "./computeFileMap";

export async function computeExternalFilesMap(props: ComputeFileMapProps) {
  const fileInputMapping: Record<
    string,
    {
      inputs: {
        name: string;
        type: string;
      }[];
    }
  > = {
    LoadImage: {
      inputs: [
        {
          name: "image",
          type: "images",
        },
      ],
    },
  };

  return computeFileMap({
    folder: "input",
    map: fileInputMapping,
    ...props,
  });
}

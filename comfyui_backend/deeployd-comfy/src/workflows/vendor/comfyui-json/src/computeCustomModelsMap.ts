import { computeFileMap, type ComputeFileMapProps } from "./computeFileMap";

export async function computeCustomModelsMap(props: ComputeFileMapProps) {
  const resourcesMapping: Record<
    string,
    {
      inputs: {
        name: string;
        type: string;
      }[];
    }
  > = {
    CheckpointLoaderSimple: {
      inputs: [
        {
          name: "ckpt_name",
          type: "checkpoints",
        },
      ],
    },
    IPAdapterModelLoader: {
      inputs: [
        {
          name: "ipadapter_file",
          type: "ipadapter",
        },
      ],
    },
    CLIPVisionLoader: {
      inputs: [
        {
          name: "clip_name",
          type: "clip_vision",
        },
      ],
    },
    LoraLoader: {
      inputs: [
        {
          name: "lora_name",
          type: "loras",
        },
      ],
    },
    VAELoader: {
      inputs: [
        {
          name: "vae_name",
          type: "vae",
        },
      ],
    },
    UNETLoader: {
      inputs: [
        {
          name: "unet_name",
          type: "unet",
        },
      ],
    },
    CLIPLoader: {
      inputs: [
        {
          name: "clip_name",
          type: "clip",
        },
      ],
    },
    DualCLIPLoader: {
      inputs: [
        {
          name: "clip_name1",
          type: "clip",
        },
        {
          name: "clip_name2",
          type: "clip",
        },
      ],
    },
    unCLIPCheckpointLoader: {
      inputs: [
        {
          name: "ckpt_name",
          type: "checkpoints",
        },
      ],
    },
    ControlNetLoader: {
      inputs: [
        {
          name: "controlnet_name",
          type: "controlnet",
        },
      ],
    },
    DiffControlNetLoader: {
      inputs: [
        {
          name: "controlnet_name",
          type: "controlnet",
        },
      ],
    },
    StyleModelLoader: {
      inputs: [
        {
          name: "style_model_name",
          type: "style_models",
        },
      ],
    },
    GLIGENLoader: {
      inputs: [
        {
          name: "gligen_name",
          type: "gligen",
        },
      ],
    },
    DiffusersLoader: {
      inputs: [
        {
          name: "model_path",
          type: "diffusers",
        },
      ],
    },
    LoraLoaderModelOnly: {
      inputs: [
        {
          name: "lora_name",
          type: "loras",
        },
      ],
    },
    HypernetworkLoader: {
      inputs: [
        {
          name: "hypernetwork_name",
          type: "hypernetworks",
        },
      ],
    },
    PhotoMakerLoader: {
      inputs: [
        {
          name: "photomaker_model_name",
          type: "photomaker",
        },
      ],
    },
    ImageOnlyCheckpointLoader: {
      inputs: [
        {
          name: "ckpt_name",
          type: "checkpoints",
        },
      ],
    },


    ControlNetLoaderAdvanced: {
      inputs: [
        {
          name: "controlnet_name",
          type: "controlnet",
        },
      ],
    },
    ACN_SparseCtrlLoaderAdvanced: {
      inputs: [
        {
          name: "sparsectrl_name",
          type: "controlnet",
        },
      ],
    },
    ACN_SparseCtrlMergedLoaderAdvanced: {
      inputs: [
        {
          name: "sparsectrl_name",
          type: "controlnet",
        },
        {
          name: "control_net_name",
          type: "controlnet",
        },
      ],
    },

    UpscaleModelLoader: {
      inputs: [
        {
          name: "model_name",
          type: "upscale_models",
        },
      ],
    },

    ADE_LoadAnimateDiffModel: {
      inputs: [
        {
          name: "model_name",
          type: "animate_diff_model",
        },
      ],
    },
  };

  return computeFileMap({
    folder: "models",
    includeTypeInPath: true,
    map: resourcesMapping,
    ...props,
  });
}

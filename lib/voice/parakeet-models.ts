export interface ParakeetModel {
  id: string;
  name: string;
  description: string;
  language: string;
  supportedLanguages: string[];
  expectedSizeBytes: number;
  downloadUrl: string;
  extractDir: string;
}

const SHERPA_ONNX_VERSION = "1.12.23";

export const PARAKEET_MODELS: ParakeetModel[] = [
  {
    id: "parakeet-tdt-0.6b-v3",
    name: "Parakeet TDT 0.6B v3",
    description: "Fast multilingual local speech-to-text via sherpa-onnx.",
    language: "multilingual",
    supportedLanguages: [
      "ar",
      "ca",
      "cs",
      "cy",
      "da",
      "de",
      "el",
      "en",
      "es",
      "fa",
      "fi",
      "fr",
      "he",
      "hi",
      "hu",
      "id",
      "it",
      "ja",
      "ko",
      "nl",
      "no",
      "pl",
      "pt",
      "ro",
      "ru",
      "sl",
      "sv",
      "th",
      "tr",
      "uk",
      "vi",
      "zh",
    ],
    expectedSizeBytes: 1_200_000_000,
    downloadUrl:
      "https://huggingface.co/k2-fsa/sherpa-onnx-parakeet-tdt-0.6b-v3/resolve/main/sherpa-onnx-parakeet-tdt-0.6b-v3.tar.bz2",
    extractDir: "sherpa-onnx-parakeet-tdt-0.6b-v3",
  },
];

export function getParakeetModel(modelId: string): ParakeetModel | null {
  return PARAKEET_MODELS.find((model) => model.id === modelId) ?? null;
}

export function getParakeetModels(): ParakeetModel[] {
  return PARAKEET_MODELS;
}

export function getSherpaOnnxBinaryName(platform: NodeJS.Platform, arch: string): string | null {
  const key = `${platform}-${arch}`;
  switch (key) {
    case "darwin-arm64":
      return "sherpa-onnx-ws-darwin-arm64";
    case "darwin-x64":
      return "sherpa-onnx-ws-darwin-x64";
    case "linux-x64":
      return "sherpa-onnx-ws-linux-x64";
    case "win32-x64":
      return "sherpa-onnx-ws-win32-x64.exe";
    default:
      return null;
  }
}

export function getSherpaOnnxArchiveName(platform: NodeJS.Platform, arch: string): string | null {
  const key = `${platform}-${arch}`;
  switch (key) {
    case "darwin-arm64":
    case "darwin-x64":
      return `sherpa-onnx-v${SHERPA_ONNX_VERSION}-osx-universal2-shared.tar.bz2`;
    case "linux-x64":
      return `sherpa-onnx-v${SHERPA_ONNX_VERSION}-linux-x64-shared.tar.bz2`;
    case "win32-x64":
      return `sherpa-onnx-v${SHERPA_ONNX_VERSION}-win-x64-shared.tar.bz2`;
    default:
      return null;
  }
}

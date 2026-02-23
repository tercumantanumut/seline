export interface CustomWorkflowsManagerProps {
  connectionBaseUrl: string;
  connectionHost: string;
  connectionPort: number;
  connectionUseHttps: boolean;
  connectionAutoDetect: boolean;
  onConnectionBaseUrlChange: (value: string) => void;
  onConnectionHostChange: (value: string) => void;
  onConnectionPortChange: (value: number) => void;
  onConnectionUseHttpsChange: (value: boolean) => void;
  onConnectionAutoDetectChange: (value: boolean) => void;
}

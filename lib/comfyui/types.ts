/**
 * ComfyUI Local Backend - TypeScript Types
 */

// Status types
export interface ComfyUIStatus {
    dockerInstalled: boolean;
    imageBuilt: boolean;
    containerRunning: boolean;
    apiHealthy: boolean;
    modelsDownloaded: boolean;
    checkpointExists: boolean;
    loraExists: boolean;
}

export interface InstallProgress {
    stage: "checking" | "building" | "downloading-models" | "starting" | "complete" | "error";
    progress: number; // 0-100
    message: string;
    error?: string;
}

// Model definitions
export const ZIMAGE_MODELS = {
    checkpoint: {
        name: "z-image-turbo-fp8-aio.safetensors",
        url: "https://huggingface.co/SeeSee21/Z-Image-Turbo-AIO/resolve/main/z-image-turbo-fp8-aio.safetensors",
        path: "ComfyUI/models/checkpoints/",
        size: "~11GB",
        sizeBytes: 10345190658,
    },
    lora: {
        name: "z-image-detailer.safetensors",
        url: "https://huggingface.co/SeeSee21/Z-Image-Turbo-AIO/resolve/main/z-image-detailer.safetensors",
        path: "ComfyUI/models/loras/",
        size: "~1.2GB",
        sizeBytes: 1200000000,
    },
} as const;

// Generation request/response types
export interface GenerateImageRequest {
    positive_prompt: string;
    seed?: number;
    width?: number;
    height?: number;
    steps?: number;
    cfg?: number;
    lora_strength?: number;
    batch_size?: number;
    return_base64?: boolean;
}

export interface GenerateImageResponse {
    prompt_id: string;
    status: "queued" | "processing" | "completed" | "failed";
    images?: string[];
    images_base64?: string[];
    error?: string;
    seed?: number;
    task_id?: string;
}

// Queue status types
export interface QueueStatus {
    status: "active" | "paused";
    statistics: {
        total_enqueued: number;
        total_processed: number;
        total_failed: number;
        total_retried: number;
    };
    queue_sizes: {
        high_priority: number;
        normal_priority: number;
        low_priority: number;
        total: number;
    };
}

// Worker status types
export interface WorkerStatus {
    running: boolean;
    pool_status: {
        workers: Array<{
            worker_id: string;
            status: "idle" | "processing" | "paused" | "error";
            current_task: string | null;
            tasks_completed: number;
            tasks_failed: number;
            uptime: number;
        }>;
        worker_count: number;
        min_workers: number;
        max_workers: number;
        queue_size: number;
        resources: {
            cpu_percent: number;
            memory_percent: number;
            memory_available_mb: number;
        };
    };
}

// Settings related to ComfyUI
export interface ComfyUISettings {
    comfyuiEnabled: boolean;
    comfyuiInstalled: boolean;
    comfyuiAutoStart: boolean;
    comfyuiPort: number;
    comfyuiModelsDownloaded: boolean;
    comfyuiBackendPath: string;
    imageGenerationProvider: "openrouter" | "local-comfyui";
}

// Electron API extension for ComfyUI
export interface ComfyUIElectronAPI {
    checkStatus: (backendPath: string) => Promise<ComfyUIStatus>;
    install: (backendPath: string) => Promise<{ success: boolean; error?: string }>;
    downloadModels: (backendPath: string) => Promise<{ success: boolean; error?: string }>;
    start: (backendPath: string) => Promise<{ success: boolean; error?: string }>;
    stop: (backendPath: string) => Promise<{ success: boolean; error?: string }>;
    onInstallProgress: (callback: (data: InstallProgress) => void) => void;
    removeProgressListener: () => void;
}

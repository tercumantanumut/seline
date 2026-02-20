/**
 * Type declarations for Electron API exposed via preload script
 */

interface ElectronLogEntry {
    timestamp: string;
    level: string;
    message: string;
}

interface ElectronCriticalError {
    type: string;
    message: string;
}

interface ElectronAPI {
    platform: string;
    isElectron: boolean;

    window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        isMaximized: () => Promise<boolean>;
    };

    app: {
        getVersion: () => Promise<string>;
        getName: () => Promise<string>;
        getDataPath: () => Promise<string>;
        getMediaPath: () => Promise<string>;
    };

    shell: {
        openExternal: (url: string) => Promise<void>;
    };

    dialog: {
        selectFolder: () => Promise<string | null>;
    };

    settings: {
        get: () => Promise<Record<string, unknown> | null>;
        save: (settings: Record<string, unknown>) => Promise<boolean>;
    };

    file: {
        read: (filePath: string) => Promise<Buffer | null>;
        write: (filePath: string, data: Buffer | string) => Promise<boolean>;
        delete: (filePath: string) => Promise<boolean>;
        exists: (filePath: string) => Promise<boolean>;
    };

    model: {
        getModelsDir: () => Promise<string>;
        checkExists: (modelId: string) => Promise<boolean>;
        download: (modelId: string) => Promise<{ success: boolean; error?: string }>;
        onProgress: (callback: (data: { modelId: string; status: string; progress?: number; file?: string; error?: string }) => void) => void;
        removeProgressListener: () => void;
    };

    logs: {
        subscribe: () => void;
        unsubscribe: () => void;
        getBuffer: () => Promise<ElectronLogEntry[]>;
        clear: () => void;
        onEntry: (callback: (entry: ElectronLogEntry) => void) => void;
        onCritical: (callback: (data: ElectronCriticalError) => void) => void;
        removeListeners: () => void;
    };

    ipc: {
        send: (channel: string, ...args: unknown[]) => void;
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
        on: (channel: string, callback: (...args: unknown[]) => void) => void;
        removeAllListeners: (channel: string) => void;
    };
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

export { };

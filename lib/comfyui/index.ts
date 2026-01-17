/**
 * ComfyUI Local Backend - Index
 * Re-exports all ComfyUI utilities
 */

export * from "./types";
export { checkHealth, generateImage, checkStatus, getQueueStatus, cancelGeneration } from "./client";

// FLUX.2 Klein exports
export {
    checkFlux2KleinHealth,
    generateFlux2KleinSync,
    generateFlux2KleinAsync,
    checkFlux2KleinJobStatus,
    generateFlux2KleinWithPolling,
    base64ToDataUrl,
} from "./flux2-klein-client";

export type {
    Flux2KleinVariant,
    Flux2KleinGenerateRequest,
    Flux2KleinGenerateResponse,
    Flux2KleinAsyncResponse,
    Flux2KleinJobStatusResponse,
    Flux2KleinHealthResponse,
} from "./flux2-klein-client";


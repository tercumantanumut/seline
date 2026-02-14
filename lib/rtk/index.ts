/**
 * RTK (Rust Token Killer) Module
 * 
 * Token optimization for command execution through RTK proxy.
 */

export {
    checkRTKInstalled,
    initializeRTK,
    getRTKBinary,
    getRTKEnvironment,
    getRTKFlags,
    getRTKDbPath,
    shouldUseRTK,
    getRTKStats,
} from "./manager";

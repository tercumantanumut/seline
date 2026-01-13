/**
 * LanceDB Vector Database Integration
 *
 * This module provides embedded vector search capabilities using LanceDB,
 * an embedded vector database that runs locally without requiring an external server.
 *
 * @module lib/vectordb
 */

export { getLanceDB, isVectorDBEnabled, getVectorDBPath, testVectorDBConnection } from "./client";
export {
  ensureAgentTable,
  deleteAgentTable,
  getAgentTableName,
  listAgentTables
} from "./collections";
export {
  indexFileToVectorDB,
  removeFileFromVectorDB,
  indexTextToVectorDB,
  type IndexFileResult
} from "./indexing";
export {
  searchVectorDB,
  type VectorSearchHit,
  type VectorSearchOptions
} from "./search";
export {
  searchWithRouter,
} from "./search-router";
export {
  addSyncFolder,
  getSyncFolders,
  removeSyncFolder,
  syncFolder,
  syncAllFolders,
  reindexAllFolders,
  isSyncing,
  isSyncingPath,
  cancelSyncByPath,
  cancelSyncById,
  getSyncedFoldersNeedingWatch,
  getStaleFolders,
  restartAllWatchers,
  syncStaleFolders,
  type SyncFolderConfig,
  type SyncResult,
  type ParallelConfig,
} from "./sync-service";
export {
  startWatching,
  stopWatching,
  stopAllWatchers,
  getWatchedFolders,
  isWatching,
} from "./file-watcher";
export {
  startBackgroundSync,
  stopBackgroundSync,
  initializeVectorSync,
  isVectorSyncInitialized,
} from "./background-sync";

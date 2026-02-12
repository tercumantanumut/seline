// lib/documents/errors.ts

export enum DocumentErrorCode {
  MODEL_NOT_DOWNLOADED = "MODEL_NOT_DOWNLOADED",
  MODEL_DIR_NOT_FOUND = "MODEL_DIR_NOT_FOUND",
  PDF_RUNTIME_INCOMPATIBLE = "PDF_RUNTIME_INCOMPATIBLE",
  PDF_PARSE_FAILED = "PDF_PARSE_FAILED",
  EMBEDDING_FAILED = "EMBEDDING_FAILED",
  INDEXING_ABORTED = "INDEXING_ABORTED",
}

export class DocumentProcessingError extends Error {
  public readonly code: DocumentErrorCode;
  public readonly filePath?: string;
  public readonly suggestedAction?: string;

  constructor(
    code: DocumentErrorCode,
    message: string,
    filePath?: string,
    suggestedAction?: string,
  ) {
    super(message);
    this.name = "DocumentProcessingError";
    this.code = code;
    this.filePath = filePath;
    this.suggestedAction = suggestedAction;
  }
}

export interface MessageChunk {
  text: string;
  index: number;
  total: number;
  isFirst: boolean;
  isLast: boolean;
}

export interface ChunkOptions {
  maxLength?: number;
  preserveHeaders?: boolean;
  addChunkHeaders?: boolean;
}

const DEFAULT_MAX_LENGTH = 3800;

export function splitMessageIntoChunks(text: string, options: ChunkOptions = {}): MessageChunk[] {
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const preserveHeaders = options.preserveHeaders ?? true;
  const addChunkHeaders = options.addChunkHeaders ?? false;
  const content = text ?? "";

  if (maxLength <= 0) {
    return [buildChunk(content, 1, 1)];
  }

  if (content.length <= maxLength) {
    return [buildChunk(content, 1, 1)];
  }

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > maxLength) {
    const splitIndex = findSplitIndex(remaining, maxLength, preserveHeaders);
    const safeIndex = splitIndex > 0 ? splitIndex : maxLength;
    chunks.push(remaining.slice(0, safeIndex));
    remaining = remaining.slice(safeIndex);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  const total = chunks.length;
  return chunks.map((chunkText, index) => {
    let textValue = chunkText;
    if (addChunkHeaders && total > 1) {
      textValue = `(${index + 1}/${total}) ${textValue}`;
    }
    return buildChunk(textValue, index + 1, total);
  });
}

export function generateSummaryHeader(totalChunks: number, totalBytes: number): string {
  const sizeLabel = formatByteSize(totalBytes);
  return `Plan below is ${totalChunks} parts - total ${sizeLabel}`;
}

function buildChunk(text: string, index: number, total: number): MessageChunk {
  return {
    text,
    index,
    total,
    isFirst: index === 1,
    isLast: index === total,
  };
}

function findSplitIndex(text: string, maxLength: number, preserveHeaders: boolean): number {
  const slice = text.slice(0, maxLength);

  if (preserveHeaders) {
    const headerIndex = findHeaderBoundary(slice);
    if (headerIndex > 0) {
      return headerIndex;
    }
  }

  const sentenceIndex = findSentenceBoundary(slice);
  if (sentenceIndex > 0) {
    return sentenceIndex;
  }

  const newlineIndex = slice.lastIndexOf("\n");
  if (newlineIndex > 0) {
    return newlineIndex + 1;
  }

  const spaceIndex = slice.lastIndexOf(" ");
  if (spaceIndex > 0) {
    return spaceIndex + 1;
  }

  return maxLength;
}

function findHeaderBoundary(slice: string): number {
  const headerRegex = /\n#{1,6}\s/g;
  let match: RegExpExecArray | null;
  let lastIndex = -1;

  while ((match = headerRegex.exec(slice)) !== null) {
    lastIndex = match.index;
  }

  if (lastIndex <= 0) {
    return -1;
  }

  return lastIndex + 1;
}

function findSentenceBoundary(slice: string): number {
  const separators = [". ", "! ", "? "];
  let bestIndex = -1;

  for (const separator of separators) {
    const index = slice.lastIndexOf(separator);
    if (index > bestIndex) {
      bestIndex = index + separator.length;
    }
  }

  return bestIndex;
}

function formatByteSize(totalBytes: number): string {
  if (totalBytes < 1024) {
    return `${totalBytes} bytes`;
  }

  const kb = totalBytes / 1024;
  if (kb < 10) {
    return `${kb.toFixed(1)} kB`;
  }
  return `${Math.round(kb)} kB`;
}

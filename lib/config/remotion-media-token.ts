const REMOTION_MEDIA_TOKEN_ENV = "REMOTION_MEDIA_TOKEN";

export function readRemotionMediaToken(): string {
  const value = process.env[REMOTION_MEDIA_TOKEN_ENV]?.trim();
  if (!value) {
    throw new Error(
      `${REMOTION_MEDIA_TOKEN_ENV} is required for video assembly media authentication.`,
    );
  }
  return value;
}

export const REMOTION_MEDIA_TOKEN = readRemotionMediaToken();

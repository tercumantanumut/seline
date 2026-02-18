const INTERNAL_API_SECRET_ENV = "INTERNAL_API_SECRET";

function readInternalApiSecret(): string {
  const value = process.env[INTERNAL_API_SECRET_ENV]?.trim();
  if (!value) {
    throw new Error(
      `${INTERNAL_API_SECRET_ENV} is required. Configure it before starting the app.`,
    );
  }
  return value;
}

export const INTERNAL_API_SECRET = readInternalApiSecret();


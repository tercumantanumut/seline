import { config } from "dotenv";

// Load environment variables from .env.local for integration tests
config({ path: ".env.local" });

if (!process.env.INTERNAL_API_SECRET) {
  process.env.INTERNAL_API_SECRET = "test-internal-api-secret";
}

if (!process.env.REMOTION_MEDIA_TOKEN) {
  process.env.REMOTION_MEDIA_TOKEN = "test-remotion-media-token";
}

// Ensure required environment variables are set
const requiredEnvVars = ["STYLY_AI_API_KEY"];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`Warning: ${envVar} is not set. Some integration tests may fail.`);
  }
}


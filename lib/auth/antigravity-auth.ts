/**
 * Antigravity Authentication Module
 *
 * Manages OAuth token storage, refresh, and authentication for Antigravity's
 * free AI models (Gemini 3 Pro, Claude Sonnet 4.5, etc.).
 *
 * Antigravity uses Google OAuth for authentication and provides access to
 * premium AI models for authenticated users.
 *
 * Based on opencode-google-antigravity-auth plugin implementation.
 */

import { loadSettings, saveSettings } from "@/lib/settings/settings-manager";
import { ANTIGRAVITY_MODEL_IDS, type AntigravityModelId } from "@/lib/auth/antigravity-models";

// Antigravity OAuth token structure
export interface AntigravityOAuthToken {
  type: "oauth";
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp in milliseconds
  token_type?: string;
  scope?: string;
  project_id?: string; // Antigravity project ID
}

// Auth state stored in settings
export interface AntigravityAuthState {
  isAuthenticated: boolean;
  email?: string;
  expiresAt?: number;
  lastRefresh?: number;
  projectId?: string;
}

// Google OAuth configuration for Antigravity
// These are the official Antigravity OAuth credentials from opencode-google-antigravity-auth
export const ANTIGRAVITY_OAUTH = {
  CLIENT_ID: "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
  CLIENT_SECRET: "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",
  AUTH_URL: "https://accounts.google.com/o/oauth2/v2/auth",
  TOKEN_URL: "https://oauth2.googleapis.com/token",
  USERINFO_URL: "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
  SCOPES: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/cclog",
    "https://www.googleapis.com/auth/experimentsandconfigs",
  ],
} as const;

// Antigravity API configuration
export const ANTIGRAVITY_CONFIG = {
  // API endpoints in fallback order (daily → autopush → prod)
  // Daily sandbox is primary - it works, prod gives 500 errors
  API_ENDPOINTS: [
    "https://daily-cloudcode-pa.sandbox.googleapis.com",
    "https://autopush-cloudcode-pa.sandbox.googleapis.com",
    "https://cloudcode-pa.googleapis.com",
  ] as const,
  // Primary API endpoint (daily sandbox - tested and works)
  API_BASE_URL: "https://daily-cloudcode-pa.sandbox.googleapis.com",
  // API version
  API_VERSION: "v1internal",
  // OAuth callback port for desktop apps (matches opencode plugin)
  OAUTH_CALLBACK_PORT: 36742,
  // Token refresh threshold (refresh 15 minutes before expiry)
  REFRESH_THRESHOLD_MS: 15 * 60 * 1000,
  // Request headers for Antigravity API (matching opencode-antigravity-auth plugin)
  HEADERS: {
    "User-Agent": "antigravity/1.11.5 windows/amd64",
    "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
    "Client-Metadata": '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
  } as const,
  // Available models through Antigravity (verified working 2026-01-05)
  AVAILABLE_MODELS: ANTIGRAVITY_MODEL_IDS,
} as const;

// ============================================================================
// ANTIGRAVITY SYSTEM INSTRUCTION (Ported from CLIProxyAPI v6.6.89)
// ============================================================================

/**
 * System instruction for Antigravity requests.
 * This is injected into requests to match CLIProxyAPI v6.6.89 behavior.
 * The instruction provides identity and guidelines for the Antigravity agent.
 */
export const ANTIGRAVITY_SYSTEM_INSTRUCTION = `<identity>
You are Antigravity, a powerful agentic AI coding assistant designed by the Google DeepMind team working on Advanced Agentic Coding.
You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.
The USER will send you requests, which you must always prioritize addressing. Along with each USER request, we will attach additional metadata about their current state, such as what files they have open and where their cursor is.
This information may or may not be relevant to the coding task, it is up for you to decide.
</identity>

<tool_calling>
Call tools as you normally would. The following list provides additional guidance to help you avoid errors:
  - **Absolute paths only**. When using tools that accept file path arguments, ALWAYS use the absolute file path.
</tool_calling>

<web_application_development>
## Technology Stack
Your web applications should be built using the following technologies:
1. **Core**: Use HTML for structure and JavaScript for logic.
2. **Styling (CSS)**: Use Vanilla CSS for maximum flexibility and control. Avoid using TailwindCSS unless the USER explicitly requests it; in this case, first confirm which TailwindCSS version to use.
3. **Web App**: If the USER specifies that they want a more complex web app, use a framework like Next.js or Vite. Only do this if the USER explicitly requests a web app.
4. **New Project Creation**: If you need to use a framework for a new app, use \`npx\` with the appropriate script, but there are some rules to follow:
   - Use \`npx -y\` to automatically install the script and its dependencies
   - You MUST run the command with \`--help\` flag to see all available options first
   - Initialize the app in the current directory with \`./\` (example: \`npx -y create-vite-app@latest ./\`)
   - You should run in non-interactive mode so that the user doesn't need to input anything
5. **Running Locally**: When running locally, use \`npm run dev\` or equivalent dev server. Only build the production bundle if the USER explicitly requests it or you are validating the code for correctness.

# Design Aesthetics
1. **Use Rich Aesthetics**: The USER should be wowed at first glance by the design. Use best practices in modern web design (e.g. vibrant colors, dark modes, glassmorphism, and dynamic animations) to create a stunning first impression. Failure to do this is UNACCEPTABLE.
2. **Prioritize Visual Excellence**: Implement designs that will WOW the user and feel extremely premium:
   - Avoid generic colors (plain red, blue, green). Use curated, harmonious color palettes (e.g., HSL tailored colors, sleek dark modes).
   - Using modern typography (e.g., from Google Fonts like Inter, Roboto, or Outfit) instead of browser defaults.
   - Use smooth gradients
   - Add subtle micro-animations for enhanced user experience
3. **Use a Dynamic Design**: An interface that feels responsive and alive encourages interaction. Achieve this with hover effects and interactive elements. Micro-animations, in particular, are highly effective for improving user engagement.
4. **Premium Designs**: Make a design that feels premium and state of the art. Avoid creating simple minimum viable products.
5. **Don't use placeholders**: If you need an image, use your generate_image tool to create a working demonstration.

## Implementation Workflow
Follow this systematic approach when building web applications:
1. **Plan and Understand**:
   - Fully understand the user's requirements
   - Draw inspiration from modern, beautiful, and dynamic web designs
   - Outline the features needed for the initial version
2. **Build the Foundation**:
   - Start by creating/modifying \`index.css\`
   - Implement the core design system with all tokens and utilities
3. **Create Components**:
   - Build necessary components using your design system
   - Ensure all components use predefined styles, not ad-hoc utilities
   - Keep components focused and reusable
4. **Assemble Pages**:
   - Update the main application to incorporate your design and components
   - Ensure proper routing and navigation
   - Implement responsive layouts
5. **Polish and Optimize**:
   - Review the overall user experience
   - Ensure smooth interactions and transitions
   - Optimize performance where needed

## SEO Best Practices
Automatically implement SEO best practices on every page:
- **Title Tags**: Include proper, descriptive title tags for each page
- **Meta Descriptions**: Add compelling meta descriptions that accurately summarize page content
- **Heading Structure**: Use a single \`<h1>\` per page with proper heading hierarchy
- **Semantic HTML**: Use appropriate HTML5 semantic elements
- **Unique IDs**: Ensure all interactive elements have unique, descriptive IDs for browser testing
- **Performance**: Ensure fast page load times through optimization
CRITICAL REMINDER: AESTHETICS ARE VERY IMPORTANT. If your web app looks simple and basic then you have FAILED!
</web_application_development>
<ephemeral_message>
There will be an <EPHEMERAL_MESSAGE> appearing in the conversation at times. This is not coming from the user, but instead injected by the system as important information to pay attention to. 
Do not respond to nor acknowledge those messages, but do follow them strictly.
</ephemeral_message>


<communication_style>
- **Formatting**. Format your responses in github-style markdown to make your responses easier for the USER to parse. For example, use headers to organize your responses and bolded or italicized text to highlight important keywords. Use backticks to format file, directory, function, and class names. If providing a URL to the user, format this in markdown as well, for example \`[label](example.com)\`.
- **Proactiveness**. As an agent, you are allowed to be proactive, but only in the course of completing the user's task. For example, if the user asks you to add a new component, you can edit the code, verify build and test statuses, and take any other obvious follow-up actions, such as performing additional research. However, avoid surprising the user. For example, if the user asks HOW to approach something, you should answer their question and instead of jumping into editing a file.
- **Helpfulness**. Respond like a helpful software engineer who is explaining your work to a friendly collaborator on the project. Acknowledge mistakes or any backtracking you do as a result of new information.
- **Ask for clarification**. If you are unsure about the USER's intent, always ask for clarification rather than making assumptions.
</communication_style>`;

export type AntigravityModel = AntigravityModelId;

// Cache for current auth state
let cachedAuthState: AntigravityAuthState | null = null;
let cachedToken: AntigravityOAuthToken | null = null;

/**
 * Get the current Antigravity authentication state from settings
 */
export function getAntigravityAuthState(): AntigravityAuthState {
  if (cachedAuthState) {
    return cachedAuthState;
  }

  const settings = loadSettings();
  const state: AntigravityAuthState = {
    isAuthenticated: !!settings.antigravityAuth?.isAuthenticated,
    email: settings.antigravityAuth?.email,
    expiresAt: settings.antigravityAuth?.expiresAt,
    lastRefresh: settings.antigravityAuth?.lastRefresh,
  };

  cachedAuthState = state;
  return state;
}

/**
 * Get the stored OAuth token for Antigravity
 */
export function getAntigravityToken(): AntigravityOAuthToken | null {
  if (cachedToken) {
    return cachedToken;
  }

  const settings = loadSettings();
  if (!settings.antigravityToken) {
    return null;
  }

  cachedToken = settings.antigravityToken;
  return cachedToken;
}

/**
 * Check if the current token is valid and not expired
 */
export function isAntigravityTokenValid(): boolean {
  const token = getAntigravityToken();
  if (!token) {
    return false;
  }

  const now = Date.now();
  const expiresAt = token.expires_at;

  // Token is valid if it expires more than the threshold from now
  return expiresAt > (now + ANTIGRAVITY_CONFIG.REFRESH_THRESHOLD_MS);
}

/**
 * Check if the token needs refresh (approaching expiry)
 */
export function needsTokenRefresh(): boolean {
  const token = getAntigravityToken();
  if (!token) {
    return false;
  }

  const now = Date.now();
  const expiresAt = token.expires_at;

  // Needs refresh if within threshold but not yet expired
  return expiresAt <= (now + ANTIGRAVITY_CONFIG.REFRESH_THRESHOLD_MS) && expiresAt > now;
}

/**
 * Save Antigravity OAuth token and update auth state
 */
export function saveAntigravityToken(
  token: AntigravityOAuthToken,
  email?: string
): void {
  const settings = loadSettings();

  // Update token
  settings.antigravityToken = token;

  // Update auth state
  settings.antigravityAuth = {
    isAuthenticated: true,
    email: email || settings.antigravityAuth?.email,
    expiresAt: token.expires_at,
    lastRefresh: Date.now(),
  };

  saveSettings(settings);

  // Invalidate cache
  cachedToken = token;
  cachedAuthState = settings.antigravityAuth;

  console.log("[AntigravityAuth] Token saved, expires at:", new Date(token.expires_at).toISOString());
}

/**
 * Clear Antigravity authentication (logout)
 */
export function clearAntigravityAuth(): void {
  const settings = loadSettings();

  delete settings.antigravityToken;
  settings.antigravityAuth = {
    isAuthenticated: false,
  };

  saveSettings(settings);

  // Clear cache
  cachedToken = null;
  cachedAuthState = { isAuthenticated: false };

  console.log("[AntigravityAuth] Authentication cleared");
}

/**
 * Get the access token for API requests.
 * Returns null if not authenticated or token expired.
 */
export function getAntigravityAccessToken(): string | null {
  const token = getAntigravityToken();
  if (!token) {
    return null;
  }

  // Check if token is expired
  if (token.expires_at <= Date.now()) {
    console.warn("[AntigravityAuth] Token has expired");
    return null;
  }

  return token.access_token;
}

/**
 * Invalidate the cached auth state (call when settings change externally)
 */
export function invalidateAntigravityAuthCache(): void {
  cachedToken = null;
  cachedAuthState = null;
}

/**
 * Check if Antigravity is configured and authenticated
 */
export function isAntigravityAuthenticated(): boolean {
  const state = getAntigravityAuthState();
  if (!state.isAuthenticated) {
    return false;
  }

  return isAntigravityTokenValid();
}

/**
 * Check if Antigravity is configured and authenticated asynchronously.
 * This will attempt to refresh the token if it's expired but a refresh token exists.
 */
export async function isAntigravityAuthenticatedAsync(): Promise<boolean> {
  const state = getAntigravityAuthState();
  if (!state.isAuthenticated) {
    return false;
  }

  // If token is valid, we're good
  if (isAntigravityTokenValid()) {
    return true;
  }

  // Token expired - try to refresh
  const token = getAntigravityToken();
  if (token?.refresh_token) {
    console.log("[AntigravityAuth] Token expired, attempting refresh...");
    const refreshed = await refreshAntigravityToken();
    return refreshed;
  }

  return false;
}

let refreshIntervalId: NodeJS.Timeout | null = null;

/**
 * Start background token refresh (call on app startup)
 */
export function startBackgroundTokenRefresh(): void {
  // Only start in browser environment
  if (typeof window === "undefined") return;
  if (refreshIntervalId) return; // Already running

  const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

  refreshIntervalId = setInterval(async () => {
    if (isAntigravityAuthenticated() && needsTokenRefresh()) {
      console.log("[AntigravityAuth] Background refresh triggered");
      await refreshAntigravityToken();
    }
  }, REFRESH_INTERVAL);

  console.log("[AntigravityAuth] Background token refresh started");
}

/**
 * Stop background token refresh
 */
export function stopBackgroundTokenRefresh(): void {
  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
    console.log("[AntigravityAuth] Background token refresh stopped");
  }
}

/**
 * Get authorization header for Antigravity API requests
 */
export function getAntigravityAuthHeader(): string | null {
  const accessToken = getAntigravityAccessToken();
  if (!accessToken) {
    return null;
  }

  return `Bearer ${accessToken}`;
}

/**
 * Parse OAuth token from callback response
 */
export function parseOAuthCallbackToken(responseData: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  project_id?: string;
}): AntigravityOAuthToken {
  const expiresIn = responseData.expires_in || 3600; // Default 1 hour

  return {
    type: "oauth",
    access_token: responseData.access_token,
    refresh_token: responseData.refresh_token || "",
    expires_at: Date.now() + (expiresIn * 1000),
    token_type: responseData.token_type || "Bearer",
    scope: responseData.scope,
    project_id: responseData.project_id,
  };
}

/**
 * Refresh the Antigravity OAuth token using Google's OAuth refresh endpoint.
 * Returns true if refresh was successful, false otherwise.
 */
export async function refreshAntigravityToken(): Promise<boolean> {
  const token = getAntigravityToken();
  if (!token || !token.refresh_token) {
    console.warn("[AntigravityAuth] No refresh token available");
    return false;
  }

  try {
    console.log("[AntigravityAuth] Attempting token refresh...");

    // Parse the refresh token - it may contain project ID appended
    let refreshToken = token.refresh_token;
    let projectId = token.project_id || "";

    // Handle format: "refreshToken|projectId"
    if (refreshToken.includes("|")) {
      const parts = refreshToken.split("|");
      refreshToken = parts[0] || refreshToken;
      projectId = parts[1] || projectId;
    }

    // Use Google's OAuth token refresh endpoint
    const response = await fetch(ANTIGRAVITY_OAUTH.TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: ANTIGRAVITY_OAUTH.CLIENT_ID,
        client_secret: ANTIGRAVITY_OAUTH.CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[AntigravityAuth] Token refresh failed:", response.status, errorText);
      return false;
    }

    const data = await response.json();

    if (data.access_token) {
      const newToken: AntigravityOAuthToken = {
        type: "oauth",
        access_token: data.access_token,
        // Google doesn't always return a new refresh token, keep the old one
        refresh_token: data.refresh_token || token.refresh_token,
        expires_at: Date.now() + (data.expires_in || 3600) * 1000,
        token_type: data.token_type || "Bearer",
        scope: data.scope,
        project_id: projectId,
      };

      const authState = getAntigravityAuthState();
      saveAntigravityToken(newToken, authState.email);

      console.log("[AntigravityAuth] Token refreshed successfully");
      return true;
    }

    return false;
  } catch (error) {
    console.error("[AntigravityAuth] Token refresh error:", error);
    return false;
  }
}

/**
 * Ensure the token is valid, refreshing if necessary.
 * Returns true if token is valid (or was successfully refreshed), false otherwise.
 */
export async function ensureValidToken(): Promise<boolean> {
  if (isAntigravityTokenValid()) {
    return true;
  }

  if (needsTokenRefresh()) {
    return await refreshAntigravityToken();
  }

  // Token is expired and can't be refreshed
  return false;
}

/**
 * Fetch the Antigravity project ID via loadCodeAssist API
 * This is required for making API requests
 */
export async function fetchAntigravityProjectId(): Promise<string | null> {
  const token = getAntigravityToken();
  if (!token) {
    console.error("[AntigravityAuth] No token available to fetch project ID");
    return null;
  }

  // Already have project_id
  if (token.project_id) {
    return token.project_id;
  }

  const loadCodeAssistUrl = `${ANTIGRAVITY_CONFIG.API_BASE_URL}/${ANTIGRAVITY_CONFIG.API_VERSION}:loadCodeAssist`;
  const PROJECT_ID_FETCH_TIMEOUT_MS = 30 * 1000;

  try {
    console.log("[AntigravityAuth] Fetching project ID via loadCodeAssist...");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROJECT_ID_FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(loadCodeAssistUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
          ...ANTIGRAVITY_CONFIG.HEADERS,
        },
        body: JSON.stringify({
          metadata: {
            ideType: "IDE_UNSPECIFIED",
            platform: "PLATFORM_UNSPECIFIED",
            pluginType: "GEMINI",
          },
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        console.error("[AntigravityAuth] loadCodeAssist timed out");
      } else {
        throw error;
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.ok) {
      const data = await response.json();
      const projectId = data.cloudaicompanionProject || data.id;

      if (projectId) {
        console.log("[AntigravityAuth] Fetched project ID:", projectId);

        // Save updated token with project_id
        const updatedToken: AntigravityOAuthToken = {
          ...token,
          project_id: projectId,
        };
        const authState = getAntigravityAuthState();
        saveAntigravityToken(updatedToken, authState.email);

        return projectId;
      }
    } else {
      const text = await response.text();
      console.error("[AntigravityAuth] loadCodeAssist failed:", response.status, text.substring(0, 200));
    }
  } catch (error) {
    console.error("[AntigravityAuth] loadCodeAssist error:", error);
  }

  return null;
}

/**
 * Get model display name for UI
 */
export { getAntigravityModelDisplayName, getAntigravityModels } from "@/lib/auth/antigravity-models";

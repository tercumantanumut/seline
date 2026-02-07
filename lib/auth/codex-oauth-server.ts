import http from "node:http";
import {
  CODEX_OAUTH,
  decodeCodexJWT,
  exchangeCodexAuthorizationCode,
  saveCodexToken,
  type CodexOAuthToken,
} from "@/lib/auth/codex-auth";

type PendingAuth = {
  verifier: string;
  origin: string;
};

let server: http.Server | null = null;
let serverReady = false;
const pendingStates = new Map<string, PendingAuth>();

function buildCallbackHtml(success: boolean, message: string, origin: string): string {
  const bgColor = success ? "#10b981" : "#ef4444";
  const icon = success ? "OK" : "!";
  const safeOrigin = origin || "*";

  return `<!DOCTYPE html>
<html>
<head>
  <title>Codex Authentication</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #0f172a 0%, #111827 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: rgba(255,255,255,0.1);
      border-radius: 16px;
      backdrop-filter: blur(10px);
    }
    .icon {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: ${bgColor};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
      margin: 0 auto 20px;
    }
    h1 { margin: 0 0 10px; font-size: 24px; }
    p { margin: 0; opacity: 0.85; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${icon}</div>
    <h1>${success ? "Success!" : "Error"}</h1>
    <p>${message}</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: "codex-auth", success: ${success} }, ${JSON.stringify(safeOrigin)});
    }
    setTimeout(() => window.close(), 2000);
  </script>
</body>
</html>`;
}

async function handleCallback(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const url = new URL(req.url || "", "http://localhost");
    if (url.pathname !== "/auth/callback") {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      res.statusCode = 400;
      res.end("Missing authorization code or state");
      return;
    }

    const pending = pendingStates.get(state);
    pendingStates.delete(state);

    if (!pending) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(buildCallbackHtml(false, "State mismatch. Please retry.", ""));
      return;
    }

    const tokenResponse = await exchangeCodexAuthorizationCode(code, pending.verifier, CODEX_OAUTH.REDIRECT_URI);
    if (!tokenResponse) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(buildCallbackHtml(false, "Token exchange failed.", pending.origin));
      return;
    }

    const token: CodexOAuthToken = {
      type: "oauth",
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      expires_at: Date.now() + tokenResponse.expires_in * 1000,
    };

    const decoded = decodeCodexJWT(token.access_token);
    saveCodexToken(token, decoded?.email, decoded?.accountId, true);

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(buildCallbackHtml(true, "Authentication successful. You can close this window.", pending.origin));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(buildCallbackHtml(false, "Unexpected error during authentication.", ""));
    console.error("[CodexOAuthServer] Callback error:", error);
  }
}

export function registerCodexOAuthState(state: string, verifier: string, origin: string): void {
  pendingStates.set(state, { verifier, origin });
}

export function isCodexOAuthServerReady(): boolean {
  return serverReady;
}

export async function ensureCodexOAuthServer(): Promise<boolean> {
  if (serverReady) return true;

  if (!server) {
    server = http.createServer((req, res) => {
      void handleCallback(req, res);
    });
  }

  return new Promise((resolve) => {
    server!
      .listen(1455, "127.0.0.1", () => {
        serverReady = true;
        resolve(true);
      })
      .on("error", (err: NodeJS.ErrnoException) => {
        console.error("[CodexOAuthServer] Failed to bind http://127.0.0.1:1455:", err?.code || err);
        serverReady = false;
        resolve(false);
      });
  });
}

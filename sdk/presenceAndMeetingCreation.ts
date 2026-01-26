/**
 * Microsoft Graph Presence & Meeting Creation Client with Device Code Authentication
 * ==================================================================================
 *
 * This module provides a GraphPresenceAndMeetingClient for:
 * - **Checking presence/availability** via getSchedule() - see when people are free/busy
 * - **Creating meetings** via createEvent() - schedule meetings with attendees
 *
 * Note: For reading calendar events, a different method will be used.
 *
 * ## Authentication Flow Overview
 *
 * Uses OAuth 2.0 Device Code Flow, designed for LLM agents that cannot handle
 * interactive login flows directly.
 *
 * 1. **First API Call (No Tokens)**
 *    - Agent calls any API method (e.g., `getSchedule()`)
 *    - No tokens exist in `/workspace/.session/`
 *    - Client initiates device code flow with Microsoft
 *    - Microsoft returns a user code and verification URL
 *    - State is saved to `/workspace/.session/.device_code_state`
 *    - `DeviceCodeAuthRequiredError` is thrown with login instructions
 *
 * 2. **User Authentication**
 *    - User visits the verification URL (e.g., https://microsoft.com/devicelogin)
 *    - User enters the code (e.g., "ABCD1234")
 *    - User signs in and grants permissions
 *
 * 3. **Subsequent API Call (Pending Flow)**
 *    - Agent retries the API call
 *    - Client reads pending state from `.device_code_state`
 *    - Client polls Microsoft to check if user completed login
 *    - If still pending: throws `DeviceCodeAuthRequiredError` again
 *    - If completed: saves tokens, clears state, proceeds with API call
 *    - If expired/declined: clears state, starts new flow
 *
 * 4. **Normal Operation (Valid Tokens)**
 *    - Agent calls API methods
 *    - Client reads `.access_token` from disk
 *    - If valid (not expired), uses it directly
 *    - If expired, uses `.refresh_token` to get new access token
 *    - If refresh fails, starts new device code flow
 *
 * ## File Storage
 *
 * All authentication state is stored in `/workspace/.session/` (configurable):
 * - `.access_token` - The current access token (JWT, ~1 hour validity)
 * - `.refresh_token` - The refresh token (used to get new access tokens)
 * - `.device_code_state` - Pending device code flow state (JSON)
 *
 * ## Usage Example
 *
 * ```typescript
 * import { GraphPresenceAndMeetingClient, DeviceCodeAuthRequiredError } from "./presenceAndMeetingCreation";
 *
 * const client = new GraphPresenceAndMeetingClient({
 *   auth: {
 *     clientId: "your-app-client-id",
 *     tenantId: "your-tenant-id", // or "common" for multi-tenant
 *   },
 * });
 *
 * // Check availability/presence
 * try {
 *   const schedule = await client.getSchedule({
 *     schedules: ["user@example.com"],
 *     startTime: { dateTime: "2024-01-15T09:00:00", timeZone: "UTC" },
 *     endTime: { dateTime: "2024-01-15T17:00:00", timeZone: "UTC" },
 *   });
 *   console.log(schedule);
 * } catch (error) {
 *   if (error instanceof DeviceCodeAuthRequiredError) {
 *     // Display to user:
 *     console.log(`Please visit: ${error.verificationUri}`);
 *     console.log(`Enter code: ${error.userCode}`);
 *     console.log(`Code expires at: ${error.expiresAt}`);
 *     // Retry later after user completes login
 *   } else {
 *     throw error;
 *   }
 * }
 *
 * // Create a meeting
 * const meeting = await client.createEvent(undefined, {
 *   subject: "Team Sync",
 *   start: { dateTime: "2024-01-15T10:00:00", timeZone: "UTC" },
 *   end: { dateTime: "2024-01-15T11:00:00", timeZone: "UTC" },
 *   attendees: [{ emailAddress: { address: "colleague@example.com" }, type: "required" }],
 * });
 * ```
 */

export type GraphDeviceCodeAuthConfig = {
  /**
   * Microsoft Entra application (public client) ID.
   * This is the only credential required for device-code flow.
   */
  clientId: string;
  /**
   * Tenant to authenticate against. Defaults to "common".
   * Examples: "common", "organizations", "consumers", or a tenant GUID.
   */
  tenantId?: string;
  /**
   * Delegated scopes. MUST include "offline_access" if you want refresh tokens.
   * Defaults to calendar-friendly delegated scopes.
   */
  scopes?: string[];
};

export type GraphTokenStorageConfig = {
  /**
   * Directory where `.access_token`, `.refresh_token`, and `.device_code_state` will be stored.
   * Defaults to "/workspace/.session".
   */
  dir?: string;
  accessTokenFilename?: string; // default ".access_token"
  refreshTokenFilename?: string; // default ".refresh_token"
  deviceCodeStateFilename?: string; // default ".device_code_state"
};

export type GraphClientConfig = {
  baseUrl?: string;
  /**
   * Device-code auth config (public client). Tokens are stored in /workspace/.session/.
   * LLM agents should NOT provide accessToken directly - use this auth config instead.
   */
  auth: GraphDeviceCodeAuthConfig;
  tokenStorage?: GraphTokenStorageConfig;
  fetchImpl?: typeof fetch;
};

/**
 * Error thrown when device code authentication is required.
 * The LLM agent should catch this and display the login instructions to the user.
 */
export class DeviceCodeAuthRequiredError extends Error {
  constructor(
    public readonly userCode: string,
    public readonly verificationUri: string,
    public readonly verificationUriComplete: string | undefined,
    public readonly expiresAt: string,
    message?: string
  ) {
    super(
      message ??
        `Authentication required. Visit ${verificationUri} and enter code: ${userCode}`
    );
    this.name = "DeviceCodeAuthRequiredError";
  }
}

/**
 * State persisted to disk during an active device code flow.
 */
export type DeviceCodeState = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  intervalSeconds: number;
  expiresAt: string; // ISO date
};

export type DateTimeTimeZone = {
  dateTime: string;
  timeZone: string;
};

export type GraphCalendar = {
  id: string;
  name?: string;
  color?: string;
  isDefaultCalendar?: boolean;
  owner?: { name?: string; address?: string };
};

export type GraphAttendee = {
  emailAddress: { name?: string; address: string };
  type?: "required" | "optional" | "resource";
};

export type GraphEvent = {
  id?: string;
  subject?: string;
  body?: { contentType: "text" | "html"; content: string };
  start?: DateTimeTimeZone;
  end?: DateTimeTimeZone;
  attendees?: GraphAttendee[];
  location?: { displayName?: string };
  organizer?: { emailAddress?: { name?: string; address?: string } };
  isAllDay?: boolean;
};

export type CalendarViewQuery = {
  startDateTime: string;
  endDateTime: string;
  top?: number;
  skip?: number;
  orderby?: string;
};

export type ScheduleRequest = {
  schedules: string[];
  startTime: DateTimeTimeZone;
  endTime: DateTimeTimeZone;
  availabilityViewInterval?: number;
};

export type ScheduleResponse = {
  value: Array<{
    scheduleId: string;
    availabilityView?: string;
    scheduleItems?: Array<{
      status: string;
      start: DateTimeTimeZone;
      end: DateTimeTimeZone;
      subject?: string;
      location?: string;
    }>;
  }>;
};

const DEFAULT_BASE_URL = "https://graph.microsoft.com/v1.0";

const DEFAULT_DEVICE_CODE_SCOPES = [
  "offline_access",
  "https://graph.microsoft.com/.default"
];

const buildQuery = (query?: Record<string, unknown>): string => {
  if (!query) return "";
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

type GraphErrorResponse = {
  error?: {
    message?: string;
  };
};

const toErrorMessage = async (response: Response): Promise<string> => {
  try {
    const data = (await response.json()) as GraphErrorResponse;
    if (data?.error?.message) return String(data.error.message);
    if (data?.error) return JSON.stringify(data.error);
  } catch {
    // ignore
  }
  return `${response.status} ${response.statusText}`.trim();
};

type GraphDeviceCodeStartResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
  message?: string;
};

type GraphTokenResponse = {
  token_type?: string;
  scope?: string;
  expires_in?: number;
  ext_expires_in?: number;
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
  error_codes?: number[];
  timestamp?: string;
  trace_id?: string;
  correlation_id?: string;
  error_uri?: string;
};

type DeviceCodeCheckResult =
  | { status: "pending"; nextPollInSeconds: number; message?: string }
  | { status: "completed"; accessToken: string }
  | { status: "declined"; error: string }
  | { status: "expired"; error: string }
  | { status: "error"; error: string };

const nowSeconds = () => Math.floor(Date.now() / 1000);

const base64UrlDecodeToString = (input: string): string => {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  // Node and modern runtimes support atob; but Node may not in older versions.
  if (typeof atob === "function") return atob(padded);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
  const buf = Buffer.from(padded, "base64");
  return buf.toString("utf8");
};

const tryGetJwtExpSeconds = (token: string): number | undefined => {
  const parts = token.split(".");
  if (parts.length < 2) return undefined;
  try {
    const payload = JSON.parse(base64UrlDecodeToString(parts[1])) as { exp?: number };
    if (typeof payload?.exp === "number") return payload.exp;
  } catch {
    // ignore
  }
  return undefined;
};

const isLikelyValidAccessToken = (token: string, skewSeconds = 60): boolean => {
  const exp = tryGetJwtExpSeconds(token);
  if (!exp) return false;
  return exp > nowSeconds() + skewSeconds;
};

const formUrlEncode = (body: Record<string, string>): string => {
  const params = new URLSearchParams();
  Object.entries(body).forEach(([k, v]) => params.set(k, v));
  return params.toString();
};

const getAuthorityBase = (tenantId?: string) =>
  `https://login.microsoftonline.com/${tenantId ?? "common"}/oauth2/v2.0`;

const normalizeScopes = (scopes?: string[]) => (scopes?.length ? scopes : DEFAULT_DEVICE_CODE_SCOPES);

type TokenPair = { accessToken?: string; refreshToken?: string };

const DEFAULT_SESSION_DIR = "/workspace/.session";

const resolveTokenPaths = async (storage?: GraphTokenStorageConfig) => {
  const dir = storage?.dir ?? DEFAULT_SESSION_DIR;
  const accessName = storage?.accessTokenFilename ?? ".access_token";
  const refreshName = storage?.refreshTokenFilename ?? ".refresh_token";
  const stateName = storage?.deviceCodeStateFilename ?? ".device_code_state";

  // Dynamic import so this file stays usable in non-Node environments until token persistence is used.
  const pathMod = await import("node:path");
  return {
    dir,
    accessPath: pathMod.join(dir, accessName),
    refreshPath: pathMod.join(dir, refreshName),
    statePath: pathMod.join(dir, stateName),
  };
};

const ensureDirectoryExists = async (dir: string): Promise<void> => {
  const fs = await import("node:fs/promises");
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // ignore if exists
  }
};

const readTextFileIfExists = async (path: string): Promise<string | undefined> => {
  try {
    const fs = await import("node:fs/promises");
    const value = await fs.readFile(path, "utf8");
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  } catch {
    return undefined;
  }
};

const writeTextFile = async (path: string, value: string): Promise<void> => {
  const fs = await import("node:fs/promises");
  await fs.writeFile(path, `${value.trim()}\n`, "utf8");
};

const deleteFileIfExists = async (path: string): Promise<void> => {
  try {
    const fs = await import("node:fs/promises");
    await fs.unlink(path);
  } catch {
    // ignore
  }
};

/**
 * Internal class that handles the device code authentication flow.
 *
 * This class manages:
 * - Starting new device code flows
 * - Polling for completion
 * - Token refresh
 * - Persisting tokens and state to disk
 */
class GraphDeviceCodeAuth {
  private clientId: string;
  private tenantId?: string;
  private scopes: string[];
  private fetchImpl: typeof fetch;
  private tokenStorage?: GraphTokenStorageConfig;

  constructor(config: {
    auth: GraphDeviceCodeAuthConfig;
    fetchImpl: typeof fetch;
    tokenStorage?: GraphTokenStorageConfig;
  }) {
    this.clientId = config.auth.clientId;
    this.tenantId = config.auth.tenantId;
    this.scopes = normalizeScopes(config.auth.scopes);
    this.fetchImpl = config.fetchImpl;
    this.tokenStorage = config.tokenStorage;
  }

  private async tokenPaths() {
    return resolveTokenPaths(this.tokenStorage);
  }

  private scopeString() {
    return this.scopes.join(" ");
  }

  /**
   * Initiates a new device code flow with Microsoft.
   *
   * This method:
   * 1. Calls Microsoft's /devicecode endpoint
   * 2. Receives a user_code and verification_uri
   * 3. Persists the state to .device_code_state file
   * 4. Returns the state for the caller to throw DeviceCodeAuthRequiredError
   *
   * The user must then visit the verification_uri and enter the user_code
   * to complete authentication.
   */
  private async startDeviceCodeLogin(): Promise<DeviceCodeState> {
    const base = getAuthorityBase(this.tenantId);
    const response = await this.fetchImpl(`${base}/devicecode`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formUrlEncode({ client_id: this.clientId, scope: this.scopeString() }),
    });
    if (!response.ok) {
      throw new Error(await toErrorMessage(response));
    }
    const data = (await response.json()) as GraphDeviceCodeStartResponse;
    const intervalSeconds = typeof data.interval === "number" && data.interval > 0 ? data.interval : 5;
    const state: DeviceCodeState = {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      verificationUriComplete: data.verification_uri_complete,
      intervalSeconds,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
    await this.persistDeviceCodeState(state);
    return state;
  }

  /**
   * Polls Microsoft once to check if the user has completed the device code flow.
   *
   * This method does NOT actively poll in a loop. It checks once and returns:
   * - "completed": User authenticated, tokens saved to disk
   * - "pending": User hasn't completed yet, caller should retry later
   * - "expired": The device code expired (15 min timeout), need to start over
   * - "declined": User declined the authorization
   * - "error": Some other error occurred
   *
   * On "completed", tokens are saved to .access_token and .refresh_token,
   * and the .device_code_state file is deleted.
   */
  private async checkDeviceCodeResult(state: DeviceCodeState): Promise<DeviceCodeCheckResult> {
    const base = getAuthorityBase(this.tenantId);

    const response = await this.fetchImpl(`${base}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formUrlEncode({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: this.clientId,
        device_code: state.deviceCode,
      }),
    });

    const data = (await response.json()) as GraphTokenResponse;
    if (response.ok && data.access_token) {
      // Success! User completed the flow. Save tokens and clean up state.
      const { dir, accessPath, refreshPath } = await this.tokenPaths();
      await ensureDirectoryExists(dir);
      await writeTextFile(accessPath, data.access_token);
      if (data.refresh_token) await writeTextFile(refreshPath, data.refresh_token);
      await this.clearDeviceCodeState();
      return { status: "completed", accessToken: data.access_token };
    }

    const err = String(data.error ?? "unknown_error");
    if (err === "authorization_pending" || err === "slow_down") {
      // User hasn't completed the flow yet - this is expected
      return { status: "pending", nextPollInSeconds: err === "slow_down" ? state.intervalSeconds + 5 : state.intervalSeconds };
    }
    if (err === "expired_token") return { status: "expired", error: data.error_description ?? err };
    if (err === "authorization_declined") return { status: "declined", error: data.error_description ?? err };

    return { status: "error", error: data.error_description ?? err };
  }

  private async readTokensFromDisk(): Promise<TokenPair> {
    const { accessPath, refreshPath } = await this.tokenPaths();
    const [accessToken, refreshToken] = await Promise.all([
      readTextFileIfExists(accessPath),
      readTextFileIfExists(refreshPath),
    ]);
    return { accessToken, refreshToken };
  }

  private async persistTokensToDisk(tokens: TokenPair): Promise<void> {
    const { dir, accessPath, refreshPath } = await this.tokenPaths();
    await ensureDirectoryExists(dir);
    if (tokens.accessToken) await writeTextFile(accessPath, tokens.accessToken);
    if (tokens.refreshToken) await writeTextFile(refreshPath, tokens.refreshToken);
  }

  private async clearTokensOnDisk(): Promise<void> {
    const { accessPath, refreshPath } = await this.tokenPaths();
    await Promise.all([deleteFileIfExists(accessPath), deleteFileIfExists(refreshPath)]);
  }

  private async readDeviceCodeState(): Promise<DeviceCodeState | undefined> {
    const { statePath } = await this.tokenPaths();
    const content = await readTextFileIfExists(statePath);
    if (!content) return undefined;
    try {
      return JSON.parse(content) as DeviceCodeState;
    } catch {
      return undefined;
    }
  }

  private async persistDeviceCodeState(state: DeviceCodeState): Promise<void> {
    const { dir, statePath } = await this.tokenPaths();
    await ensureDirectoryExists(dir);
    await writeTextFile(statePath, JSON.stringify(state, null, 2));
  }

  private async clearDeviceCodeState(): Promise<void> {
    const { statePath } = await this.tokenPaths();
    await deleteFileIfExists(statePath);
  }

  private isDeviceCodeStateExpired(state: DeviceCodeState): boolean {
    return new Date(state.expiresAt).getTime() < Date.now();
  }

  private async refreshOnce(refreshToken: string): Promise<TokenPair> {
    const base = getAuthorityBase(this.tenantId);
    const response = await this.fetchImpl(`${base}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formUrlEncode({
        grant_type: "refresh_token",
        client_id: this.clientId,
        refresh_token: refreshToken,
        scope: this.scopeString(),
      }),
    });
    const data = (await response.json()) as GraphTokenResponse;
    if (!response.ok || !data.access_token) {
      const err = data.error_description ?? data.error ?? `${response.status} ${response.statusText}`.trim();
      throw new Error(String(err));
    }
    return { accessToken: data.access_token, refreshToken: data.refresh_token ?? refreshToken };
  }

  private throwDeviceCodeAuthRequired(state: DeviceCodeState): never {
    throw new DeviceCodeAuthRequiredError(
      state.userCode,
      state.verificationUri,
      state.verificationUriComplete,
      state.expiresAt,
      `Authentication required. Visit ${state.verificationUri} and enter code: ${state.userCode}`
    );
  }

  /**
   * Main entry point for getting a valid access token.
   *
   * This method implements the full authentication flow:
   *
   * ```
   * ┌─────────────────────────────────────────────────────────────────┐
   * │                    getValidAccessToken()                        │
   * └─────────────────────────────────────────────────────────────────┘
   *                              │
   *                              ▼
   *              ┌───────────────────────────────┐
   *              │ Step 1: Check .access_token   │
   *              │ Is it valid (not expired)?    │
   *              └───────────────────────────────┘
   *                     │              │
   *                    YES            NO
   *                     │              │
   *                     ▼              ▼
   *              ┌──────────┐  ┌───────────────────────────┐
   *              │ Return   │  │ Step 2: Check .refresh_token │
   *              │ token    │  │ Try to refresh access token  │
   *              └──────────┘  └───────────────────────────┘
   *                                   │              │
   *                               SUCCESS         FAILED
   *                                   │              │
   *                                   ▼              ▼
   *                            ┌──────────┐  ┌───────────────────────────┐
   *                            │ Return   │  │ Step 3: Check .device_code_state │
   *                            │ token    │  │ Is there a pending flow?         │
   *                            └──────────┘  └───────────────────────────┘
   *                                                 │              │
   *                                               YES             NO
   *                                                 │              │
   *                                                 ▼              │
   *                                   ┌─────────────────────┐      │
   *                                   │ Poll once: did user │      │
   *                                   │ complete the flow?  │      │
   *                                   └─────────────────────┘      │
   *                                      │       │       │         │
   *                                 COMPLETED  PENDING  FAILED     │
   *                                      │       │       │         │
   *                                      ▼       │       ▼         │
   *                               ┌──────────┐   │  ┌──────────┐   │
   *                               │ Return   │   │  │ Clear    │   │
   *                               │ token    │   │  │ state    │   │
   *                               └──────────┘   │  └──────────┘   │
   *                                              │       │         │
   *                                              ▼       ▼         ▼
   *                                   ┌─────────────────────────────────┐
   *                                   │ Step 4: Start new device code   │
   *                                   │ flow, save state, throw error   │
   *                                   │ with login instructions         │
   *                                   └─────────────────────────────────┘
   *                                                    │
   *                                                    ▼
   *                                   ┌─────────────────────────────────┐
   *                                   │ throw DeviceCodeAuthRequiredError │
   *                                   │ (userCode, verificationUri, ...)  │
   *                                   └─────────────────────────────────┘
   * ```
   *
   * @throws {DeviceCodeAuthRequiredError} When user authentication is required.
   *         The error contains `userCode` and `verificationUri` for the user.
   */
  async getValidAccessToken(): Promise<string> {
    // ══════════════════════════════════════════════════════════════════════
    // Step 1: Try existing access token from .access_token file
    // ══════════════════════════════════════════════════════════════════════
    const tokens = await this.readTokensFromDisk();
    if (tokens.accessToken && isLikelyValidAccessToken(tokens.accessToken)) {
      // Token exists and is not expired (with 60s buffer) - use it directly
      return tokens.accessToken;
    }

    // ══════════════════════════════════════════════════════════════════════
    // Step 2: Try to refresh using .refresh_token file
    // ══════════════════════════════════════════════════════════════════════
    if (tokens.refreshToken) {
      let currentRefresh = tokens.refreshToken;
      let lastError: unknown;
      // Try up to 2 times (tokens can rotate during refresh)
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const refreshed = await this.refreshOnce(currentRefresh);
          if (!refreshed.accessToken) throw new Error("Refresh did not return an access token.");
          await this.persistTokensToDisk(refreshed);
          if (isLikelyValidAccessToken(refreshed.accessToken)) return refreshed.accessToken;
          currentRefresh = refreshed.refreshToken ?? currentRefresh;
        } catch (e) {
          lastError = e;
          break;
        }
      }
      // Refresh failed (token revoked, expired, etc.) - clear and proceed to device code flow
      await this.clearTokensOnDisk();
    }

    // ══════════════════════════════════════════════════════════════════════
    // Step 3: Check for pending device code flow in .device_code_state file
    // ══════════════════════════════════════════════════════════════════════
    let state = await this.readDeviceCodeState();
    
    if (state) {
      // There's a pending flow - check if it's still valid
      if (this.isDeviceCodeStateExpired(state)) {
        // Device code expired (typically 15 min) - need to start fresh
        await this.clearDeviceCodeState();
        state = undefined;
      } else {
        // Poll Microsoft once to check if user completed the login
        const result = await this.checkDeviceCodeResult(state);
        
        if (result.status === "completed") {
          // User completed the flow! Tokens are now saved, return the access token
          return result.accessToken;
        }
        
        if (result.status === "pending") {
          // User hasn't completed yet - throw error so agent can show instructions again
          this.throwDeviceCodeAuthRequired(state);
        }
        
        // Flow failed (expired, declined, or error) - clear state and start over
        await this.clearDeviceCodeState();
        state = undefined;
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // Step 4: No valid tokens and no pending flow - start new device code flow
    // ══════════════════════════════════════════════════════════════════════
    const newState = await this.startDeviceCodeLogin();
    // Always throws - agent must catch and display login instructions to user
    this.throwDeviceCodeAuthRequired(newState);
  }
}

export class GraphPresenceAndMeetingClient {
  private baseUrl: string;
  private auth: GraphDeviceCodeAuth;
  private fetchImpl: typeof fetch;

  /**
   * Creates a new GraphPresenceAndMeetingClient.
   *
   * This client is designed for:
   * - **Checking presence/availability** - Use getSchedule() to see when people are free/busy
   * - **Creating meetings** - Use createEvent() to schedule meetings with attendees
   *
   * The client uses device code flow for authentication. Tokens are stored in
   * /workspace/.session/ (or custom path via tokenStorage.dir).
   *
   * When calling any API method, if no valid token is available:
   * - If a device code flow is pending, it will poll once and throw DeviceCodeAuthRequiredError if still pending
   * - If no flow is pending, it will start one and throw DeviceCodeAuthRequiredError
   *
   * The LLM agent should catch DeviceCodeAuthRequiredError and display the login
   * instructions to the user, then retry the operation.
   */
  constructor(config: GraphClientConfig) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.auth = new GraphDeviceCodeAuth({
      auth: config.auth,
      fetchImpl: this.fetchImpl,
      tokenStorage: config.tokenStorage,
    });
  }

  private async getAccessToken(): Promise<string> {
    return await this.auth.getValidAccessToken();
  }

  private async request<T>(
    path: string,
    options?: { method?: string; body?: unknown; query?: Record<string, unknown> }
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}${path}${buildQuery(options?.query)}`;
    const response = await this.fetchImpl(url, {
      method: options?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      throw new Error(await toErrorMessage(response));
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  listCalendars(): Promise<{ value: GraphCalendar[] }> {
    return this.request("/me/calendars");
  }

  listEvents(calendarId?: string, query?: { top?: number; skip?: number; filter?: string }) {
    const path = calendarId ? `/me/calendars/${calendarId}/events` : "/me/events";
    const graphQuery = {
      "$top": query?.top,
      "$skip": query?.skip,
      "$filter": query?.filter,
    };
    return this.request<{ value: GraphEvent[] }>(path, { query: graphQuery });
  }

  getCalendarView(calendarId: string, query: CalendarViewQuery) {
    return this.request<{ value: GraphEvent[] }>(`/me/calendars/${calendarId}/calendarView`, {
      query: {
        startDateTime: query.startDateTime,
        endDateTime: query.endDateTime,
        "$top": query.top,
        "$skip": query.skip,
        "$orderby": query.orderby,
      },
    });
  }

  createEvent(calendarId: string | undefined, event: GraphEvent) {
    const path = calendarId ? `/me/calendars/${calendarId}/events` : "/me/events";
    return this.request<GraphEvent>(path, { method: "POST", body: event });
  }

  updateEvent(calendarId: string | undefined, eventId: string, event: Partial<GraphEvent>) {
    const path = calendarId
      ? `/me/calendars/${calendarId}/events/${eventId}`
      : `/me/events/${eventId}`;
    return this.request<void>(path, { method: "PATCH", body: event });
  }

  deleteEvent(calendarId: string | undefined, eventId: string) {
    const path = calendarId
      ? `/me/calendars/${calendarId}/events/${eventId}`
      : `/me/events/${eventId}`;
    return this.request<void>(path, { method: "DELETE" });
  }

  getSchedule(request: ScheduleRequest): Promise<ScheduleResponse> {
    return this.request("/me/calendar/getSchedule", { method: "POST", body: request });
  }
}

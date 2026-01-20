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
   * Directory where `.access_token` and `.refresh_token` will be stored.
   * Defaults to process.cwd().
   */
  dir?: string;
  accessTokenFilename?: string; // default ".access_token"
  refreshTokenFilename?: string; // default ".refresh_token"
};

export type GraphClientConfig =
  | {
      baseUrl?: string;
      /**
       * If you already have an access token, you can still pass it directly.
       * (No persistence/refresh will happen in this mode.)
       */
      accessToken: string;
      fetchImpl?: typeof fetch;
    }
  | {
      baseUrl?: string;
      /**
       * Device-code auth config (public client). Tokens are stored in the working folder.
       */
      auth: GraphDeviceCodeAuthConfig;
      tokenStorage?: GraphTokenStorageConfig;
      fetchImpl?: typeof fetch;
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
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Calendars.ReadWrite",
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

export type DeviceCodeStartResult = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  /**
   * Suggested polling interval (seconds). Since polling is on-demand,
   * this is returned only as guidance.
   */
  intervalSeconds: number;
  expiresAt: string; // ISO date
  message?: string;
};

export type DeviceCodeCheckResult =
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

const resolveTokenPaths = async (storage?: GraphTokenStorageConfig) => {
  const dir = storage?.dir ?? (typeof process !== "undefined" && process.cwd ? process.cwd() : ".");
  const accessName = storage?.accessTokenFilename ?? ".access_token";
  const refreshName = storage?.refreshTokenFilename ?? ".refresh_token";

  // Dynamic import so this file stays usable in non-Node environments until token persistence is used.
  const pathMod = await import("node:path");
  return {
    accessPath: pathMod.join(dir, accessName),
    refreshPath: pathMod.join(dir, refreshName),
  };
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

class GraphDeviceCodeAuth {
  private clientId: string;
  private tenantId?: string;
  private scopes: string[];
  private fetchImpl: typeof fetch;
  private tokenStorage?: GraphTokenStorageConfig;
  private lastDeviceCode?: { deviceCode: string; intervalSeconds: number };

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

  async startDeviceCodeLogin(): Promise<DeviceCodeStartResult> {
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
    this.lastDeviceCode = { deviceCode: data.device_code, intervalSeconds };
    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      verificationUriComplete: data.verification_uri_complete,
      intervalSeconds,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      message: data.message,
    };
  }

  /**
   * Checks ONCE if the user completed the device-code flow.
   * This method does NOT actively poll; the developer must call it explicitly.
   */
  async checkDeviceCodeResult(deviceCode?: string): Promise<DeviceCodeCheckResult> {
    const base = getAuthorityBase(this.tenantId);
    const effectiveDeviceCode = deviceCode ?? this.lastDeviceCode?.deviceCode;
    const intervalSeconds = this.lastDeviceCode?.intervalSeconds ?? 5;
    if (!effectiveDeviceCode) {
      return { status: "error", error: "Missing device_code. Call startDeviceCodeLogin() first." };
    }

    const response = await this.fetchImpl(`${base}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formUrlEncode({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: this.clientId,
        device_code: effectiveDeviceCode,
      }),
    });

    const data = (await response.json()) as GraphTokenResponse;
    if (response.ok && data.access_token) {
      const { accessPath, refreshPath } = await this.tokenPaths();
      await writeTextFile(accessPath, data.access_token);
      if (data.refresh_token) await writeTextFile(refreshPath, data.refresh_token);
      return { status: "completed", accessToken: data.access_token };
    }

    const err = String(data.error ?? "unknown_error");
    if (err === "authorization_pending" || err === "slow_down") {
      return { status: "pending", nextPollInSeconds: err === "slow_down" ? intervalSeconds + 5 : intervalSeconds };
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
    const { accessPath, refreshPath } = await this.tokenPaths();
    if (tokens.accessToken) await writeTextFile(accessPath, tokens.accessToken);
    if (tokens.refreshToken) await writeTextFile(refreshPath, tokens.refreshToken);
  }

  private async clearTokensOnDisk(): Promise<void> {
    const { accessPath, refreshPath } = await this.tokenPaths();
    await Promise.all([deleteFileIfExists(accessPath), deleteFileIfExists(refreshPath)]);
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

  /**
   * Loads token from disk, validates it, refreshes if needed, and persists updates.
   */
  async getValidAccessToken(): Promise<string> {
    const tokens = await this.readTokensFromDisk();
    if (tokens.accessToken && isLikelyValidAccessToken(tokens.accessToken)) return tokens.accessToken;

    if (!tokens.refreshToken) {
      throw new Error(
        "No valid access token found. Call startDeviceCodeLogin(), then checkDeviceCodeResult() until completed."
      );
    }

    // "loop": refresh can rotate tokens; try a couple times defensively.
    let currentRefresh = tokens.refreshToken;
    let lastError: unknown;
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

    // If refresh fails, tokens are likely revoked/expired. Clear and require re-auth.
    await this.clearTokensOnDisk();
    const msg = lastError instanceof Error ? lastError.message : String(lastError ?? "Unknown refresh error");
    throw new Error(`Failed to refresh access token: ${msg}. Please re-authenticate with device code flow.`);
  }
}

export class GraphCalendarClient {
  private baseUrl: string;
  private accessToken?: string;
  private auth?: GraphDeviceCodeAuth;
  private fetchImpl: typeof fetch;

  constructor(config: GraphClientConfig) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = config.fetchImpl ?? fetch;
    if ("accessToken" in config) {
      this.accessToken = config.accessToken;
    } else {
      this.auth = new GraphDeviceCodeAuth({
        auth: config.auth,
        fetchImpl: this.fetchImpl,
        tokenStorage: config.tokenStorage,
      });
    }
  }

  /**
   * Starts a public device-code login. Returns the URL and code the user must enter.
   */
  startDeviceCodeLogin(): Promise<DeviceCodeStartResult> {
    if (!this.auth) {
      throw new Error("startDeviceCodeLogin() is only available when using { auth: { clientId } } config.");
    }
    return this.auth.startDeviceCodeLogin();
  }

  /**
   * Checks ONCE whether the device-code flow has completed.
   * No active polling is performed; call this explicitly as needed.
   */
  checkDeviceCodeResult(deviceCode?: string): Promise<DeviceCodeCheckResult> {
    if (!this.auth) {
      throw new Error("checkDeviceCodeResult() is only available when using { auth: { clientId } } config.");
    }
    return this.auth.checkDeviceCodeResult(deviceCode);
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    if (!this.auth) {
      throw new Error("Missing access token. Provide { accessToken } or configure { auth: { clientId } }.");
    }
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

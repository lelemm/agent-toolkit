/**
 * # Timesheet Allocator API Client
 *
 * A TypeScript client for the Timesheet Allocator API - a comprehensive system for managing
 * timesheets, time tracking, and ClickUp integration.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { TimeTrackingClient } from "./time_tracking";
 *
 * const client = new TimeTrackingClient({ apiKey: "tsa_your_api_key" });
 *
 * // Start tracking time on a ClickUp task
 * await client.startTracking({
 *   clickupTaskId: "86a0nby6d",
 *   clickupTaskName: "Implement feature X",
 *   workDescription: "Working on the backend API"
 * });
 *
 * // ... do work ...
 *
 * // Stop tracking (creates a time entry, optionally enriches with AI)
 * const result = await client.stopTracking();
 * console.log("Time entry created:", result.timeEntry.id);
 * ```
 *
 * ## Key Features
 *
 * ### 1. Real-time Time Tracking
 * - **Start/Stop tracking**: Track time against ClickUp tasks in real-time
 * - **Current session**: Check if tracking is active and get session details
 * - Use `startTracking()`, `stopTracking()`, `getCurrentTrackingSession()`, `getTrackingStatus()`
 *
 * ### 2. Time Entry Management (CRUD)
 * - **List entries**: Get all time entries for the user
 * - **Create/Update/Delete**: Full CRUD operations on time entries
 * - **Date range queries**: Filter entries by datetime range
 * - Use `listTimeEntries()`, `getTimeEntry()`, `createTimeEntry()`, `updateTimeEntry()`, `deleteTimeEntry()`
 * - Use `listTimeEntriesByRange()` for date-filtered queries
 *
 * ### 3. AI/LLM Enrichment
 * - **Auto-enrich**: Automatically generate executive-ready fields (businessValue, workPerformed, outcome)
 * - **Enrichment logs**: Track enrichment status and retry failed enrichments
 * - Enrichment uses OpenAI + ClickUp task context to generate professional descriptions
 * - Use `enrichTimeEntry()`, `listEnrichmentLogs()`, `getEnrichmentLog()`, `retryEnrichment()`
 *
 * ### 4. ClickUp Integration
 * - **Task search**: Search cached ClickUp tasks by name or ID
 * - **Task linking**: Link time entries to ClickUp tasks for context
 * - Use `searchClickUpTasks()`
 *
 * ### 5. Settings Management
 * - **App settings**: Global organization settings
 * - **User settings**: Per-user preferences (timezone, locale, OpenAI key)
 * - **ClickUp settings**: ClickUp view URL and API key configuration
 * - Use `getAppSettings()`, `getUserSettings()`, `getClickUpSettings()` and their update variants
 *
 * ## Common Workflows
 *
 * ### Track time on a task (recommended flow)
 * 1. Search for task: `searchClickUpTasks("task name")`
 * 2. Start tracking: `startTracking({ clickupTaskId, clickupTaskName, workDescription })`
 * 3. Stop tracking: `stopTracking()` - this creates a TimeEntry and may queue AI enrichment
 *
 * ### Create a manual time entry
 * ```typescript
 * await client.createTimeEntry({
 *   date: "2026-01-27T00:00:00.000Z",
 *   person: "John Doe",
 *   trigger: "Business Request",
 *   workPerformed: "Developed new authentication flow",
 *   timeSpent: 120, // minutes
 *   clickupTaskId: "86a0nby6d", // optional
 *   clickupTaskName: "Auth feature" // optional
 * });
 * ```
 *
 * ### Check tracking status
 * ```typescript
 * const { status, trackedEntry } = await client.getTrackingStatus();
 * if (status === "tracking") {
 *   console.log("Currently tracking:", trackedEntry.clickupTaskName);
 * }
 * ```
 *
 * ## Authentication
 *
 * The API supports two authentication methods:
 * - **API Key Header**: Use `x-api-key: tsa_...` header (default in this client)
 * - **Bearer Token**: Use `Authorization: Bearer tsa_...` header
 *
 * @module time_tracking
 */

/**
 * Configuration options for the TimeTrackingClient.
 */
export type TimeTrackingClientConfig = {
  /**
   * Base URL of the Timesheet Allocator API.
   * @default "https://dev-stack-timesheet-allocator.svqdye.easypanel.host"
   */
  baseUrl?: string;
  /**
   * API key for authentication. Starts with "tsa_".
   * Obtain from the Timesheet Allocator web UI under Settings → API Keys.
   */
  apiKey?: string;
  /**
   * Custom fetch implementation (useful for testing or non-browser environments).
   * @default globalThis.fetch
   */
  fetchImpl?: typeof fetch;
};

/**
 * The type of work trigger for a time entry. Used for categorization and reporting.
 *
 * - `"Business Request"` - Work initiated by a business stakeholder request
 * - `"Incident"` - Work to resolve an incident or production issue
 * - `"System Change"` - Scheduled system maintenance or changes
 * - `"Planned Work"` - Pre-planned development or project work
 */
export type TriggerType = "Business Request" | "Incident" | "System Change" | "Planned Work";

/**
 * A ClickUp task cached in the Timesheet Allocator system.
 * Tasks are fetched from ClickUp and cached locally for fast searching.
 */
export type TimeTrackingClickUpTask = {
  /** ClickUp task ID (e.g., "86a0nby6d") */
  taskId: string;
  /** Task name/title */
  name: string;
  /** Full URL to the task in ClickUp (e.g., "https://app.clickup.com/t/86a0nby6d") */
  url?: string;
  /** Current task status (e.g., "in progress", "done") */
  status?: string;
  /**
   * Whether the task can be selected for tracking.
   * False when task is cached (fetched by ID) but not part of the configured ClickUp view.
   */
  isSelectable?: boolean | null;
  /** Custom fields from ClickUp (e.g., Customer, Project, etc.) */
  customFields?: Record<string, unknown> | null;
  /** When the task was last fetched from ClickUp */
  fetchedAt?: string;
  /** When the task was last used for time tracking */
  lastUsedAt?: string | null;
};

/**
 * A completed time entry in the timesheet system.
 *
 * Time entries can be created:
 * 1. Automatically when stopping a tracking session (`stopTracking()`)
 * 2. Manually via `createTimeEntry()`
 * 3. Via bulk import
 *
 * Fields like `businessValue`, `workPerformed`, and `outcome` can be:
 * - Entered manually
 * - Auto-generated by AI enrichment (if the entry is linked to a tracked session)
 */
export type TimeEntry = {
  /** Unique identifier (UUID) */
  id: string;
  /** User ID who owns this entry */
  userId: string;
  /** Date of the work (ISO 8601 datetime, e.g., "2026-01-27T00:00:00.000Z") */
  date: string;
  /** Name of the person who performed the work */
  person: string;
  /** Integration/project name (e.g., "D365 ↔ Salesforce Integration") - can be AI-generated */
  integration?: string | null;
  /** Linked ClickUp task ID */
  clickupTaskId?: string | null;
  /** Linked ClickUp task name */
  clickupTaskName?: string | null;
  /** Short description of work being done (from tracking session) */
  workDescription?: string | null;
  /** When work started (ISO 8601 datetime) - for tracked entries */
  startedAt?: string | null;
  /** When work ended (ISO 8601 datetime) - for tracked entries */
  endedAt?: string | null;
  /** Joined ClickUp task details when available */
  clickupTask?: TimeTrackingClickUpTask | null;
  /** Category of work trigger */
  trigger: TriggerType;
  /** Who requested this work (e.g., "Jane Smith", "Business sponsor") */
  requester?: string;
  /** Who approved/signed off on this work */
  signOff?: string;
  /** Executive-friendly description of business value delivered - can be AI-generated */
  businessValue: string;
  /** Executive-friendly description of work performed - can be AI-generated */
  workPerformed: string;
  /** Executive-friendly description of the outcome/results - can be AI-generated */
  outcome: string;
  /** Time spent in MINUTES (e.g., 120 = 2 hours) */
  timeSpent: number;
  /** When the entry was created */
  createdAt: string;
  /** When the entry was last updated */
  updatedAt: string;
  /**
   * Whether this entry can be enriched by AI.
   * True when the linked ClickUp task's Customer field is in the enrichable allowlist.
   */
  isEnrichable?: boolean;
};

/**
 * Payload for creating a new time entry manually.
 *
 * @example
 * ```typescript
 * const entry = await client.createTimeEntry({
 *   date: "2026-01-27T00:00:00.000Z",
 *   person: "John Doe",
 *   trigger: "Business Request",
 *   workPerformed: "Implemented OAuth2 authentication flow",
 *   timeSpent: 120, // 2 hours in minutes
 *   businessValue: "Improved security for customer data",
 *   outcome: "Successfully deployed, all tests passing"
 * });
 * ```
 */
export type CreateTimeEntry = {
  /** Date of the work (ISO 8601 datetime) */
  date: string;
  /** Name of the person who performed the work */
  person: string;
  /** Integration/project name */
  integration?: string | null;
  /** ClickUp task ID to link */
  clickupTaskId?: string | null;
  /** ClickUp task name */
  clickupTaskName?: string | null;
  /** Short work description */
  workDescription?: string | null;
  /** Work start time (ISO 8601 datetime) */
  startedAt?: string | null;
  /** Work end time (ISO 8601 datetime) */
  endedAt?: string | null;
  /** Category of work trigger (required) */
  trigger: TriggerType;
  /** Who requested this work */
  requester?: string;
  /** Who approved this work */
  signOff?: string;
  /** Business value description */
  businessValue?: string;
  /** Work performed description (required) */
  workPerformed: string;
  /** Outcome description */
  outcome?: string;
  /** Time spent in MINUTES (required) */
  timeSpent: number;
};

/**
 * Payload for updating an existing time entry.
 * All fields are optional - only provided fields will be updated.
 */
export type UpdateTimeEntry = Partial<CreateTimeEntry>;

/**
 * Fields generated by AI enrichment.
 * These are executive-ready descriptions suitable for client reports.
 */
export type EnrichedFields = {
  /** Integration/project name derived from ClickUp task context */
  integration: string;
  /** Work trigger category inferred from task and description */
  trigger: TriggerType;
  /** Executive-friendly business value statement */
  businessValue: string;
  /** Executive-friendly work performed description */
  workPerformed: string;
  /** Executive-friendly outcome statement */
  outcome: string;
};

/**
 * A real-time time tracking session.
 *
 * Created when calling `startTracking()` and completed when calling `stopTracking()`.
 * When stopped, a corresponding TimeEntry is automatically created.
 */
export type TrackedTimeEntry = {
  /** Unique identifier (UUID) */
  id: string;
  /** User ID who owns this tracking session */
  userId: string;
  /** ClickUp task ID being tracked */
  clickupTaskId: string;
  /** ClickUp task name */
  clickupTaskName: string;
  /** What the user is working on */
  workDescription: string;
  /** When tracking started (ISO 8601 datetime) */
  startedAt: string;
  /** When tracking ended (ISO 8601 datetime) - null if still tracking */
  endedAt?: string | null;
  /** When the record was created */
  createdAt: string;
  /** When the record was last updated */
  updatedAt: string;
};

/**
 * Log entry for AI enrichment processing.
 *
 * When a tracking session is stopped, an enrichment job may be queued (if the task is enrichable).
 * This log tracks the enrichment process including prompts, responses, and validation results.
 */
export type EnrichmentLog = {
  /** Unique identifier (UUID) */
  id: string;
  /** User ID */
  userId: string;
  /** ID of the tracked entry that triggered this enrichment */
  trackedEntryId: string;
  /** ID of the created time entry (after enrichment completes) */
  timeEntryId?: string | null;
  /**
   * Current status of enrichment:
   * - `pending` - Queued for processing
   * - `processing` - Currently being enriched by AI
   * - `completed` - Successfully enriched
   * - `failed` - Enrichment failed (check errorMessage)
   * - `needs_user_intervention` - AI validation rejected, needs manual review
   */
  status: "pending" | "processing" | "completed" | "failed" | "needs_user_intervention";
  /** ClickUp task ID */
  clickupTaskId: string;
  /** ClickUp task name */
  clickupTaskName: string;
  /** Work description from the tracking session */
  workDescription: string;
  /** Time spent in minutes */
  timeSpentMinutes: number;
  /** System prompt sent to the LLM */
  systemPrompt?: string | null;
  /** User prompt sent to the LLM */
  userPrompt?: string | null;
  /** Raw LLM response (JSON stringified) */
  llmResponse?: string | null;
  /** Generated integration name */
  integration?: string | null;
  /** Generated trigger type */
  trigger?: TriggerType | null;
  /** Generated business value */
  businessValue?: string | null;
  /** Generated work performed description */
  workPerformed?: string | null;
  /** Generated outcome */
  outcome?: string | null;
  /** Executive readiness score (0-100) from validation */
  validationScore?: number | null;
  /** Validation verdict: Accepted or Rejected */
  validationVerdict?: "Accepted" | "Rejected" | null;
  /** JSON array of rejection reasons */
  validationRejectionReasonsJson?: string | null;
  /** JSON array of governance risk signals */
  validationRiskSignalsJson?: string | null;
  /** JSON array of user intervention needed */
  validationUserInterventionJson?: string | null;
  /** Number of enrichment/validation attempts (max 3) */
  validationAttempts?: number | null;
  /** Error message if enrichment failed */
  errorMessage?: string | null;
  /** Error stack trace if enrichment failed */
  errorStack?: string | null;
  /** When enrichment processing started */
  startedAt?: string | null;
  /** When enrichment completed */
  completedAt?: string | null;
  /** Record creation timestamp */
  createdAt: string;
  /** Record update timestamp */
  updatedAt: string;
};

/**
 * Payload for starting a new time tracking session.
 *
 * @example
 * ```typescript
 * // First, find a task to track
 * const { tasks } = await client.searchClickUpTasks("authentication");
 * const task = tasks[0];
 *
 * // Start tracking
 * await client.startTracking({
 *   clickupTaskId: task.taskId,
 *   clickupTaskName: task.name,
 *   workDescription: "Implementing OAuth2 login flow"
 * });
 * ```
 */
export type StartTrackingRequest = {
  /** ClickUp task ID to track time against */
  clickupTaskId: string;
  /** ClickUp task name (for display purposes) */
  clickupTaskName: string;
  /** What you're working on (used for AI enrichment context) */
  workDescription: string;
};

/**
 * Response from stopping a tracking session.
 */
export type StopTrackingResponse = {
  /** Whether the operation succeeded */
  ok: boolean;
  /** The completed tracked entry */
  entry: TrackedTimeEntry;
  /** The newly created time entry */
  timeEntry: TimeEntry;
  /** Whether AI enrichment was queued (depends on task's Customer field) */
  enrichmentQueued: boolean;
  /** ID of the enrichment log (if enrichment was queued) */
  enrichmentLogId: string | null;
};

/**
 * An API key for programmatic access.
 * The full token is only returned once at creation time.
 */
export type ApiKey = {
  /** Unique identifier (UUID) */
  id: string;
  /** User-provided name for the key */
  name: string | null;
  /** Prefix of the key (e.g., "tsa_abc123...") for identification */
  keyPrefix: string;
  /** When the key was last used */
  lastUsedAt?: string | null;
  /** When the key was revoked (null if active) */
  revokedAt?: string | null;
  /** When the key was created */
  createdAt: string;
  /** When the key record was last updated */
  updatedAt: string;
};

/**
 * Global application settings.
 *
 * Fields include:
 * - `organizationName` - Name of the organization
 * - `defaultIntegrations` - List of default integration names
 * - `defaultRequesterRole` - Fallback requester role for reports
 * - `defaultSignOffRole` - Fallback sign-off role for reports
 */
export type AppSettings = Record<string, unknown>;

/**
 * Per-user settings.
 *
 * Fields include:
 * - `defaultPerson` - Default person name for time entries
 * - `locale` - User's locale (e.g., "en-US")
 * - `timezone` - User's timezone (e.g., "America/New_York")
 * - `hasOpenAiKey` - Whether OpenAI API key is configured (read-only)
 * - `openaiApiKey` - OpenAI API key (write-only, not returned in responses)
 * - `enrichableCustomerOptionIds` - ClickUp Customer option IDs that should be enriched
 */
export type UserSettings = Record<string, unknown>;

/**
 * ClickUp integration settings.
 *
 * Fields include:
 * - `viewUrl` - ClickUp view URL (e.g., "https://app.clickup.com/12345/v/li/67890")
 * - `teamId` - ClickUp team ID (extracted from viewUrl)
 * - `viewId` - ClickUp view ID (extracted from viewUrl)
 * - `listId` - ClickUp list ID (inferred)
 * - `hasApiKey` - Whether ClickUp API key is configured (read-only)
 * - `apiKey` - ClickUp API key (write-only, not returned in responses)
 */
export type ClickUpSettings = Record<string, unknown>;

const DEFAULT_BASE_URL = "https://dev-stack-timesheet-allocator.svqdye.easypanel.host";

const buildQuery = (query?: Record<string, unknown>): string => {
  if (!query) return "";
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)));
    } else {
      params.set(key, String(value));
    }
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

type TimeTrackingErrorResponse = {
  error?: string;
  message?: string;
};

const toErrorMessage = async (response: Response): Promise<string> => {
  try {
    const data = (await response.json()) as TimeTrackingErrorResponse;
    if (data?.error) return String(data.error);
    if (data?.message) return String(data.message);
  } catch {
    // ignore
  }
  return `${response.status} ${response.statusText}`.trim();
};

/**
 * Client for the Timesheet Allocator API.
 *
 * Provides methods for:
 * - Real-time time tracking (start/stop)
 * - Time entry CRUD operations
 * - AI enrichment of time entries
 * - ClickUp task integration
 * - Settings management
 *
 * @example
 * ```typescript
 * const client = new TimeTrackingClient({ apiKey: "tsa_your_key" });
 *
 * // Check if currently tracking
 * const { status, trackedEntry } = await client.getTrackingStatus();
 *
 * // Start tracking a task
 * await client.startTracking({
 *   clickupTaskId: "abc123",
 *   clickupTaskName: "My Task",
 *   workDescription: "Working on feature X"
 * });
 *
 * // Stop and create time entry
 * const result = await client.stopTracking();
 * ```
 */
export class TimeTrackingClient {
  private baseUrl: string;
  private apiKey?: string;
  private fetchImpl: typeof fetch;

  /**
   * Creates a new TimeTrackingClient instance.
   *
   * @param config - Configuration options
   * @param config.apiKey - API key starting with "tsa_" (required for most operations)
   * @param config.baseUrl - Override the default API base URL
   * @param config.fetchImpl - Custom fetch implementation for testing
   */
  constructor(config: TimeTrackingClientConfig) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private async request<T>(
    path: string,
    options?: {
      method?: string;
      body?: unknown;
      query?: Record<string, unknown>;
      authMode?: "apiKey";
    }
  ): Promise<T> {
    const url = `${this.baseUrl}${path}${buildQuery(options?.query)}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const authMode = options?.authMode ?? "apiKey";
    if (this.apiKey && (authMode === "apiKey")) {
      // The time-tracking API expects an API key header (not a bearer token).
      headers["x-api-key"] = this.apiKey;
    }
    const response = await this.fetchImpl(url, {
      method: options?.method ?? "GET",
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      throw new Error(await toErrorMessage(response));
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  // ============================================================================
  // TIME ENTRIES - CRUD operations for timesheet entries
  // ============================================================================

  /**
   * Lists all time entries for the authenticated user.
   *
   * @returns All time entries (not paginated)
   *
   * @example
   * ```typescript
   * const { entries } = await client.listTimeEntries();
   * console.log(`Found ${entries.length} time entries`);
   * ```
   */
  listTimeEntries(): Promise<{ entries: TimeEntry[] }> {
    return this.request("/api/time-entries");
  }

  /**
   * Lists time entries within a datetime range.
   *
   * Uses `startedAt`/`endedAt` for tracked entries; falls back to entry date for manual entries.
   *
   * @param datetimeFrom - Range start (inclusive), ISO 8601 datetime
   * @param datetimeTo - Range end (inclusive), ISO 8601 datetime
   * @returns Time entries overlapping the given range
   *
   * @example
   * ```typescript
   * const { entries } = await client.listTimeEntriesByRange(
   *   "2026-01-01T00:00:00.000Z",
   *   "2026-01-31T23:59:59.999Z"
   * );
   * ```
   */
  listTimeEntriesByRange(datetimeFrom: string, datetimeTo: string): Promise<{ entries: TimeEntry[] }> {
    return this.request("/api/time-entries/range", {
      query: { datetimeFrom, datetimeTo },
    });
  }

  /**
   * Lists ClickUp task IDs that have time entries on a specific day.
   *
   * Useful for checking which tasks already have time logged for a given day.
   *
   * @param day - Day in YYYY-MM-DD format (e.g., "2026-01-27")
   * @returns Object with the day and array of task IDs
   *
   * @example
   * ```typescript
   * const { taskIds } = await client.listTaskIdsForDay("2026-01-27");
   * console.log("Tasks with time logged today:", taskIds);
   * ```
   */
  listTaskIdsForDay(day: string): Promise<{ day: string; taskIds: string[] }> {
    return this.request("/api/time-entries/task-ids", { query: { day } });
  }

  /**
   * Gets a single time entry by ID.
   *
   * Includes joined ClickUp task details when available.
   *
   * @param id - Time entry UUID
   * @returns The time entry with full details
   * @throws Error if not found (404)
   */
  getTimeEntry(id: string): Promise<{ entry: TimeEntry }> {
    return this.request(`/api/time-entries/${id}`);
  }

  /**
   * Creates a new time entry manually.
   *
   * Use this for manual time entry (not real-time tracking).
   * For real-time tracking, use `startTracking()` and `stopTracking()` instead.
   *
   * @param payload - Time entry data
   * @returns The created time entry
   *
   * @example
   * ```typescript
   * const { entry } = await client.createTimeEntry({
   *   date: "2026-01-27T00:00:00.000Z",
   *   person: "John Doe",
   *   trigger: "Business Request",
   *   workPerformed: "Implemented new feature",
   *   timeSpent: 120, // 2 hours in minutes
   *   clickupTaskId: "abc123",
   *   clickupTaskName: "Feature task"
   * });
   * ```
   */
  createTimeEntry(payload: CreateTimeEntry): Promise<{ entry: TimeEntry }> {
    return this.request("/api/time-entries", { method: "POST", body: payload });
  }

  /**
   * Updates an existing time entry.
   *
   * Only provided fields will be updated.
   *
   * @param id - Time entry UUID
   * @param payload - Fields to update
   * @returns Success status
   */
  updateTimeEntry(id: string, payload: UpdateTimeEntry): Promise<{ ok: boolean; result: unknown }> {
    return this.request(`/api/time-entries/${id}`, { method: "PUT", body: payload });
  }

  /**
   * Deletes a time entry.
   *
   * @param id - Time entry UUID
   */
  deleteTimeEntry(id: string): Promise<void> {
    return this.request(`/api/time-entries/${id}`, { method: "DELETE" });
  }

  /**
   * Bulk operations on time entries.
   *
   * Perform create, update, and delete operations in a single request.
   *
   * @param operations - Object with create, update, and delete arrays
   * @returns Success status
   *
   * @example
   * ```typescript
   * await client.bulkTimeEntries({
   *   create: [{ date: "...", person: "...", ... }],
   *   update: [{ id: "uuid", timeSpent: 180 }],
   *   delete: ["uuid-to-delete"]
   * });
   * ```
   */
  bulkTimeEntries(operations: {
    create?: CreateTimeEntry[];
    update?: (UpdateTimeEntry & { id: string })[];
    delete?: string[];
  }): Promise<{ ok: boolean }> {
    return this.request("/api/time-entries/bulk", { method: "POST", body: operations });
  }

  // ============================================================================
  // AI ENRICHMENT - Auto-generate executive-ready descriptions
  // ============================================================================

  /**
   * Enriches a time entry with AI-generated fields.
   *
   * Uses OpenAI to generate executive-ready descriptions for:
   * - `integration` - Project/integration name
   * - `trigger` - Work category
   * - `businessValue` - Business value statement
   * - `workPerformed` - Work description
   * - `outcome` - Results/outcome
   *
   * **Requirements:**
   * - OpenAI API key must be configured in user settings
   * - ClickUp API key must be configured
   * - Time entry must be linked to a tracked entry (created via stopTracking)
   *
   * @param id - Time entry UUID
   * @returns The generated fields
   * @throws Error if missing API keys or not a tracked entry
   *
   * @example
   * ```typescript
   * const { fields } = await client.enrichTimeEntry("uuid");
   * console.log("Generated:", fields.businessValue);
   * ```
   */
  enrichTimeEntry(id: string): Promise<{ ok: boolean; fields: EnrichedFields }> {
    return this.request(`/api/time-entries/${id}/enrich`, { method: "POST" });
  }

  // ============================================================================
  // REAL-TIME TRACKING - Start/stop time tracking sessions
  // ============================================================================

  /**
   * Starts a new real-time time tracking session.
   *
   * Only one session can be active at a time. If already tracking,
   * returns 409 Conflict with the current session.
   *
   * **Typical workflow:**
   * 1. Search for task: `searchClickUpTasks("task name")`
   * 2. Start tracking: `startTracking({ ... })`
   * 3. Do work...
   * 4. Stop tracking: `stopTracking()` → creates TimeEntry
   *
   * @param payload - Task and work description
   * @returns The created tracking session
   * @throws Error with code "already_tracking" if session already active
   *
   * @example
   * ```typescript
   * const { entry } = await client.startTracking({
   *   clickupTaskId: "86a0nby6d",
   *   clickupTaskName: "Implement auth",
   *   workDescription: "Setting up OAuth2 flow"
   * });
   * console.log("Started tracking at:", entry.startedAt);
   * ```
   */
  startTracking(payload: StartTrackingRequest): Promise<{ entry: TrackedTimeEntry }> {
    return this.request("/api/tracker/start", { method: "POST", body: payload });
  }

  /**
   * Stops the current time tracking session.
   *
   * This:
   * 1. Ends the active tracking session
   * 2. Creates a new TimeEntry with the tracked duration
   * 3. Optionally queues AI enrichment (based on task's Customer field allowlist)
   *
   * @param body - Optional override for enrichment behavior
   * @param body.enrich - `true` to force enrichment, `false` to skip, omit for auto-decide
   * @returns The completed session, created time entry, and enrichment status
   * @throws Error with code "not_tracking" if no active session
   *
   * @example
   * ```typescript
   * const result = await client.stopTracking();
   * console.log("Time entry created:", result.timeEntry.id);
   * console.log("Duration:", result.timeEntry.timeSpent, "minutes");
   * if (result.enrichmentQueued) {
   *   console.log("AI enrichment queued:", result.enrichmentLogId);
   * }
   * ```
   */
  stopTracking(body?: { enrich?: boolean }): Promise<StopTrackingResponse> {
    return this.request("/api/tracker/stop", { method: "POST", body });
  }

  /**
   * Gets the currently active tracking session (if any).
   *
   * @returns The active session or null if not tracking
   *
   * @example
   * ```typescript
   * const { entry } = await client.getCurrentTrackingSession();
   * if (entry) {
   *   console.log("Currently tracking:", entry.clickupTaskName);
   * }
   * ```
   */
  getCurrentTrackingSession(): Promise<{ entry: TrackedTimeEntry | null }> {
    return this.request("/api/tracker/current");
  }

  /**
   * Gets the current tracking status in a convenient format.
   *
   * This is a helper method that wraps `getCurrentTrackingSession()`.
   *
   * @returns Status string and optional tracked entry
   *
   * @example
   * ```typescript
   * const { status, trackedEntry } = await client.getTrackingStatus();
   * if (status === "tracking") {
   *   console.log("Tracking:", trackedEntry.clickupTaskName);
   *   console.log("Since:", trackedEntry.startedAt);
   * } else {
   *   console.log("Not currently tracking any task");
   * }
   * ```
   */
  async getTrackingStatus(): Promise<{ status: "tracking" | "not_tracking"; trackedEntry?: TrackedTimeEntry }> {
    const { entry } = await this.getCurrentTrackingSession();
    if (entry) return { status: "tracking", trackedEntry: entry };
    return { status: "not_tracking" };
  }

  /**
   * Lists all tracked time entries (completed and in-progress).
   *
   * @returns All tracking sessions for the user
   */
  listTrackedEntries(): Promise<{ entries: TrackedTimeEntry[] }> {
    return this.request("/api/tracker/entries");
  }

  // ============================================================================
  // ENRICHMENT LOGS - Monitor AI enrichment status
  // ============================================================================

  /**
   * Lists enrichment logs (max 100, newest first).
   *
   * Use this to monitor the status of AI enrichment jobs.
   *
   * @returns List of enrichment logs
   *
   * @example
   * ```typescript
   * const { logs } = await client.listEnrichmentLogs();
   * const pending = logs.filter(l => l.status === "pending");
   * const failed = logs.filter(l => l.status === "failed");
   * ```
   */
  listEnrichmentLogs(): Promise<{ logs: EnrichmentLog[] }> {
    return this.request("/api/enrichment-logs");
  }

  /**
   * Gets a specific enrichment log with full details.
   *
   * Includes prompts and LLM responses for debugging.
   *
   * @param id - Enrichment log UUID
   * @returns Full enrichment log details
   */
  getEnrichmentLog(id: string): Promise<{ log: EnrichmentLog }> {
    return this.request(`/api/enrichment-logs/${id}`);
  }

  /**
   * Retries a failed or completed enrichment.
   *
   * Resets the log to "pending" and queues it for reprocessing.
   * Also resets the associated time entry to show enriching status.
   *
   * @param id - Enrichment log UUID
   * @returns Success status
   *
   * @example
   * ```typescript
   * // Find failed enrichments and retry them
   * const { logs } = await client.listEnrichmentLogs();
   * for (const log of logs.filter(l => l.status === "failed")) {
   *   await client.retryEnrichment(log.id);
   *   console.log("Retrying:", log.clickupTaskName);
   * }
   * ```
   */
  retryEnrichment(id: string): Promise<{ ok: boolean }> {
    return this.request(`/api/enrichment-logs/${id}/retry`, { method: "POST" });
  }

  // ============================================================================
  // CLICKUP INTEGRATION - Search cached ClickUp tasks
  // ============================================================================

  /**
   * Searches cached ClickUp tasks by name or ID.
   *
   * Tasks are cached from the configured ClickUp view. Use this to find
   * tasks before starting time tracking.
   *
   * @param query - Search query (matches task name or ID)
   * @returns Matching tasks (max 50 results)
   *
   * @example
   * ```typescript
   * const { tasks } = await client.searchClickUpTasks("authentication");
   * for (const task of tasks) {
   *   console.log(`${task.taskId}: ${task.name} (${task.status})`);
   * }
   *
   * // Start tracking the first matching task
   * if (tasks.length > 0) {
   *   await client.startTracking({
   *     clickupTaskId: tasks[0].taskId,
   *     clickupTaskName: tasks[0].name,
   *     workDescription: "Working on this task"
   *   });
   * }
   * ```
   */
  searchClickUpTasks(query: string): Promise<{ tasks: TimeTrackingClickUpTask[] }> {
    return this.request("/api/clickup/tasks", { query: { q: query } });
  }

  // ============================================================================
  // SETTINGS - App, user, and ClickUp configuration
  // ============================================================================

  /**
   * Gets global application settings.
   *
   * Includes organization name, default integrations, default roles.
   *
   * @returns App settings or null if not configured
   */
  getAppSettings(): Promise<{ settings: AppSettings | null }> {
    return this.request("/api/settings/app");
  }

  /**
   * Updates global application settings.
   *
   * @param settings - Settings to update
   * @returns Success status
   */
  updateAppSettings(settings: AppSettings): Promise<{ ok: boolean }> {
    return this.request("/api/settings/app", { method: "PUT", body: settings });
  }

  /**
   * Gets settings for the authenticated user.
   *
   * Includes default person, locale, timezone, OpenAI key status,
   * and enrichable customer IDs.
   *
   * @returns User settings or null if not configured
   */
  getUserSettings(): Promise<{ settings: UserSettings | null }> {
    return this.request("/api/settings/me");
  }

  /**
   * Updates settings for the authenticated user.
   *
   * Use this to set the OpenAI API key (required for AI enrichment):
   * ```typescript
   * await client.updateUserSettings({ openaiApiKey: "sk-..." });
   * ```
   *
   * @param settings - Settings to update
   * @returns Success status
   */
  updateUserSettings(settings: UserSettings): Promise<{ ok: boolean }> {
    return this.request("/api/settings/me", { method: "PUT", body: settings });
  }

  /**
   * Gets ClickUp integration settings.
   *
   * Includes configured view URL, team/view/list IDs, and API key status.
   *
   * @returns ClickUp settings
   */
  getClickUpSettings(): Promise<{ settings: ClickUpSettings }> {
    return this.request("/api/settings/clickup");
  }

  /**
   * Updates ClickUp integration settings.
   *
   * Use this to configure the ClickUp view URL and API key:
   * ```typescript
   * await client.updateClickUpSettings({
   *   viewUrl: "https://app.clickup.com/12345/v/li/67890",
   *   apiKey: "pk_..."
   * });
   * ```
   *
   * @param settings - Settings to update
   * @returns Success status
   * @throws Error if invalid ClickUp view URL
   */
  updateClickUpSettings(settings: ClickUpSettings): Promise<{ ok: boolean }> {
    return this.request("/api/settings/clickup", { method: "PUT", body: settings });
  }

}

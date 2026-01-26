export type TimeTrackingClientConfig = {
  baseUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

export type TriggerType = "Business Request" | "Incident" | "System Change" | "Planned Work";

export type TimeTrackingClickUpTask = {
  taskId: string;
  name: string;
  url?: string;
  status?: string;
  isSelectable?: boolean | null;
  customFields?: Record<string, unknown> | null;
  fetchedAt?: string;
  lastUsedAt?: string | null;
};

export type TimeEntry = {
  id: string;
  userId: string;
  date: string;
  person: string;
  integration?: string | null;
  clickupTaskId?: string | null;
  clickupTaskName?: string | null;
  workDescription?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  trigger: TriggerType;
  requester?: string;
  signOff?: string;
  businessValue: string;
  workPerformed: string;
  outcome: string;
  timeSpent: number;
  createdAt: string;
  updatedAt: string;
  isEnrichable?: boolean;
};

export type CreateTimeEntry = {
  date: string;
  person: string;
  integration?: string | null;
  clickupTaskId?: string | null;
  clickupTaskName?: string | null;
  workDescription?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  trigger: TriggerType;
  requester?: string;
  signOff?: string;
  businessValue?: string;
  workPerformed: string;
  outcome?: string;
  timeSpent: number;
};

export type UpdateTimeEntry = Partial<CreateTimeEntry>;

export type EnrichedFields = {
  integration: string;
  trigger: TriggerType;
  businessValue: string;
  workPerformed: string;
  outcome: string;
};

export type TrackedTimeEntry = {
  id: string;
  userId: string;
  clickupTaskId: string;
  clickupTaskName: string;
  workDescription: string;
  startedAt: string;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EnrichmentLog = {
  id: string;
  userId: string;
  trackedEntryId: string;
  timeEntryId?: string | null;
  status: "pending" | "processing" | "completed" | "failed" | "needs_user_intervention";
  clickupTaskId: string;
  clickupTaskName: string;
  workDescription: string;
  timeSpentMinutes: number;
  systemPrompt?: string | null;
  userPrompt?: string | null;
  llmResponse?: string | null;
  integration?: string | null;
  trigger?: TriggerType | null;
  businessValue?: string | null;
  workPerformed?: string | null;
  outcome?: string | null;
  validationScore?: number | null;
  validationVerdict?: "Accepted" | "Rejected" | null;
  validationRejectionReasonsJson?: string | null;
  validationRiskSignalsJson?: string | null;
  validationUserInterventionJson?: string | null;
  validationAttempts?: number | null;
  errorMessage?: string | null;
  errorStack?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StartTrackingRequest = {
  clickupTaskId: string;
  clickupTaskName: string;
  workDescription: string;
};

export type StopTrackingResponse = {
  ok: boolean;
  entry: TrackedTimeEntry;
  timeEntry: TimeEntry;
  enrichmentQueued: boolean;
  enrichmentLogId: string | null;
};

export type ApiKey = {
  id: string;
  name: string | null;
  keyPrefix: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppSettings = Record<string, unknown>;
export type UserSettings = Record<string, unknown>;
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

export class TimeTrackingClient {
  private baseUrl: string;
  private apiKey?: string;
  private fetchImpl: typeof fetch;

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

  listTimeEntries(): Promise<{ entries: TimeEntry[] }> {
    return this.request("/api/time-entries");
  }

  getTimeEntry(id: string): Promise<{ entry: TimeEntry }> {
    return this.request(`/api/time-entries/${id}`);
  }

  createTimeEntry(payload: CreateTimeEntry): Promise<{ entry: TimeEntry }> {
    return this.request("/api/time-entries", { method: "POST", body: payload });
  }

  updateTimeEntry(id: string, payload: UpdateTimeEntry): Promise<{ ok: boolean; result: unknown }> {
    return this.request(`/api/time-entries/${id}`, { method: "PUT", body: payload });
  }

  deleteTimeEntry(id: string): Promise<void> {
    return this.request(`/api/time-entries/${id}`, { method: "DELETE" });
  }

  enrichTimeEntry(id: string): Promise<{ ok: boolean; fields: EnrichedFields }> {
    return this.request(`/api/time-entries/${id}/enrich`, { method: "POST" });
  }

  startTracking(payload: StartTrackingRequest): Promise<{ entry: TrackedTimeEntry }> {
    return this.request("/api/tracker/start", { method: "POST", body: payload });
  }

  stopTracking(body?: { enrich?: boolean }): Promise<StopTrackingResponse> {
    return this.request("/api/tracker/stop", { method: "POST", body });
  }

  getCurrentTrackingSession(): Promise<{ entry: TrackedTimeEntry | null }> {
    return this.request("/api/tracker/current");
  }

  async getTrackingStatus(): Promise<{ status: "tracking" | "not_tracking"; trackedEntry?: TrackedTimeEntry }> {
    const { entry } = await this.getCurrentTrackingSession();
    if (entry) return { status: "tracking", trackedEntry: entry };
    return { status: "not_tracking" };
  }

  listTrackedEntries(): Promise<{ entries: TrackedTimeEntry[] }> {
    return this.request("/api/tracker/entries");
  }

  listEnrichmentLogs(): Promise<{ logs: EnrichmentLog[] }> {
    return this.request("/api/enrichment-logs");
  }

  getEnrichmentLog(id: string): Promise<{ log: EnrichmentLog }> {
    return this.request(`/api/enrichment-logs/${id}`);
  }

  retryEnrichment(id: string): Promise<{ ok: boolean }> {
    return this.request(`/api/enrichment-logs/${id}/retry`, { method: "POST" });
  }

  searchClickUpTasks(query: string): Promise<{ tasks: TimeTrackingClickUpTask[] }> {
    return this.request("/api/clickup/tasks", { query: { q: query } });
  }

  getAppSettings(): Promise<{ settings: AppSettings | null }> {
    return this.request("/api/settings/app");
  }

  updateAppSettings(settings: AppSettings): Promise<{ ok: boolean }> {
    return this.request("/api/settings/app", { method: "PUT", body: settings });
  }

  getUserSettings(): Promise<{ settings: UserSettings | null }> {
    return this.request("/api/settings/me");
  }

  updateUserSettings(settings: UserSettings): Promise<{ ok: boolean }> {
    return this.request("/api/settings/me", { method: "PUT", body: settings });
  }

  getClickUpSettings(): Promise<{ settings: ClickUpSettings }> {
    return this.request("/api/settings/clickup");
  }

  updateClickUpSettings(settings: ClickUpSettings): Promise<{ ok: boolean }> {
    return this.request("/api/settings/clickup", { method: "PUT", body: settings });
  }

}

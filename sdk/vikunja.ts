export type VikunjaClientConfig = {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
};

export type VikunjaUser = {
  id: number;
  username: string;
  name?: string;
  email?: string;
};

export type VikunjaProject = {
  id: number;
  title: string;
  description?: string;
  created: string;
  updated: string;
};

/**
 * The relation type for relative reminders.
 * Specifies which date field the reminder is relative to.
 */
export type ReminderRelation = "due_date" | "start_date" | "end_date";

/**
 * A task reminder. Can be either absolute (specific datetime) or relative (relative to a date field).
 */
export type VikunjaTaskReminder = {
  /**
   * The absolute time when the user wants to be reminded of the task.
   * Use this for absolute reminders.
   */
  reminder?: string;
  /**
   * A period in seconds relative to another date argument.
   * Negative values mean the reminder triggers before the date.
   * Default: 0, triggers when RelativeTo is due.
   */
  relative_period?: number;
  /**
   * The name of the date field to which the relative period refers to.
   * Required when using relative_period.
   */
  relative_to?: ReminderRelation;
};

export type VikunjaTask = {
  id: number;
  title: string;
  description?: string;
  done?: boolean;
  due_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  project_id?: number;
  priority?: number;
  /** An array of reminders that are associated with this task. */
  reminders?: VikunjaTaskReminder[];
  created: string;
  updated: string;
};

export type VikunjaLabel = {
  id: number;
  title: string;
  description?: string;
  created: string;
  updated: string;
};

/**
 * Input type for creating a task with reminders.
 * Extends Partial<VikunjaTask> with explicit reminder support.
 */
export type CreateTaskInput = Omit<Partial<VikunjaTask>, "id" | "created" | "updated"> & {
  title: string;
  reminders?: VikunjaTaskReminder[];
};

/**
 * Helper to create an absolute reminder (at a specific time).
 * @param datetime ISO 8601 datetime string
 */
export function absoluteReminder(datetime: string): VikunjaTaskReminder {
  return { reminder: datetime };
}

/**
 * Helper to create a relative reminder (relative to a date field).
 * @param relativeTo The date field to be relative to ("due_date", "start_date", or "end_date")
 * @param offsetSeconds Offset in seconds (negative = before, positive = after, 0 = at the time)
 */
export function relativeReminder(
  relativeTo: ReminderRelation,
  offsetSeconds: number
): VikunjaTaskReminder {
  return { relative_to: relativeTo, relative_period: offsetSeconds };
}

/**
 * Helper to create a reminder relative to a date field with human-readable units.
 * @param relativeTo The date field to be relative to
 * @param amount Amount of time units
 * @param unit Time unit: "minutes", "hours", "days", or "weeks"
 * @param when "before" or "after" the reference date
 */
export function relativeReminderWithUnit(
  relativeTo: ReminderRelation,
  amount: number,
  unit: "minutes" | "hours" | "days" | "weeks",
  when: "before" | "after" = "before"
): VikunjaTaskReminder {
  const multipliers = {
    minutes: 60,
    hours: 3600,
    days: 86400,
    weeks: 604800,
  };
  const seconds = amount * multipliers[unit];
  const offsetSeconds = when === "before" ? -seconds : seconds;
  return relativeReminder(relativeTo, offsetSeconds);
}

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

type VikunjaErrorResponse = {
  message?: string;
  error?: string;
};

const toErrorMessage = async (response: Response): Promise<string> => {
  try {
    const data = (await response.json()) as VikunjaErrorResponse;
    if (data?.message) return String(data.message);
    if (data?.error) return String(data.error);
  } catch {
    // ignore
  }
  return `${response.status} ${response.statusText}`.trim();
};

export class VikunjaClient {
  private baseUrl: string;
  private token?: string;
  private fetchImpl: typeof fetch;

  constructor(config: VikunjaClientConfig) {
    this.baseUrl = config.baseUrl;
    this.token = config.token;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  setToken(token: string) {
    this.token = token;
  }

  private async request<T>(
    path: string,
    options?: { method?: string; body?: unknown; query?: Record<string, unknown> }
  ): Promise<T> {
    const url = `${this.baseUrl}${path}${buildQuery(options?.query)}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
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

  login(username: string, password: string): Promise<{ token: string; user: VikunjaUser }> {
    return this.request("/api/v1/login", { method: "POST", body: { username, password } });
  }

  getCurrentUser(): Promise<VikunjaUser> {
    return this.request("/api/v1/user");
  }

  listProjects(): Promise<VikunjaProject[]> {
    return this.request("/api/v1/projects");
  }

  createProject(payload: { title: string; description?: string }): Promise<VikunjaProject> {
    return this.request("/api/v1/projects", { method: "POST", body: payload });
  }

  updateProject(id: number, payload: Partial<VikunjaProject>): Promise<VikunjaProject> {
    return this.request(`/api/v1/projects/${id}`, { method: "PUT", body: payload });
  }

  deleteProject(id: number): Promise<void> {
    return this.request(`/api/v1/projects/${id}`, { method: "DELETE" });
  }

  listTasks(query?: { project_id?: number; search?: string; done?: boolean }) {
    return this.request<VikunjaTask[]>("/api/v1/tasks", { query });
  }

  createTask(projectId: number, payload: Partial<VikunjaTask>): Promise<VikunjaTask> {
    return this.request(`/api/v1/projects/${projectId}/tasks`, { method: "POST", body: payload });
  }

  /**
   * Get a single task by ID, including its reminders.
   */
  getTask(id: number): Promise<VikunjaTask> {
    return this.request(`/api/v1/tasks/${id}`);
  }

  updateTask(id: number, payload: Partial<VikunjaTask>): Promise<VikunjaTask> {
    return this.request(`/api/v1/tasks/${id}`, { method: "POST", body: payload });
  }

  deleteTask(id: number): Promise<void> {
    return this.request(`/api/v1/tasks/${id}`, { method: "DELETE" });
  }

  /**
   * Get the reminders for a task.
   * @param taskId The task ID
   * @returns The array of reminders for the task
   */
  async getTaskReminders(taskId: number): Promise<VikunjaTaskReminder[]> {
    const task = await this.getTask(taskId);
    return task.reminders ?? [];
  }

  /**
   * Set reminders for a task (replaces all existing reminders).
   * @param taskId The task ID
   * @param reminders The new reminders array
   * @returns The updated task
   */
  setTaskReminders(taskId: number, reminders: VikunjaTaskReminder[]): Promise<VikunjaTask> {
    return this.updateTask(taskId, { reminders });
  }

  /**
   * Add reminders to a task (appends to existing reminders).
   * @param taskId The task ID
   * @param reminders The reminders to add
   * @returns The updated task
   */
  async addTaskReminders(taskId: number, reminders: VikunjaTaskReminder[]): Promise<VikunjaTask> {
    const existingReminders = await this.getTaskReminders(taskId);
    return this.setTaskReminders(taskId, [...existingReminders, ...reminders]);
  }

  /**
   * Remove all reminders from a task.
   * @param taskId The task ID
   * @returns The updated task
   */
  clearTaskReminders(taskId: number): Promise<VikunjaTask> {
    return this.setTaskReminders(taskId, []);
  }

  listLabels(): Promise<VikunjaLabel[]> {
    return this.request("/api/v1/labels");
  }

  createLabel(payload: { title: string; description?: string }): Promise<VikunjaLabel> {
    return this.request("/api/v1/labels", { method: "POST", body: payload });
  }

  addLabelToTask(taskId: number, labelId: number): Promise<void> {
    return this.request(`/api/v1/tasks/${taskId}/labels/${labelId}`, { method: "PUT" });
  }
}

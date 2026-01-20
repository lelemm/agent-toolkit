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

export type VikunjaTask = {
  id: number;
  title: string;
  description?: string;
  done?: boolean;
  due_date?: string | null;
  project_id?: number;
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

  updateTask(id: number, payload: Partial<VikunjaTask>): Promise<VikunjaTask> {
    return this.request(`/api/v1/tasks/${id}`, { method: "PUT", body: payload });
  }

  deleteTask(id: number): Promise<void> {
    return this.request(`/api/v1/tasks/${id}`, { method: "DELETE" });
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

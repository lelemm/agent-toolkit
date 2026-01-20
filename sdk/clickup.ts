export type ClickUpClientConfig = {
  baseUrl?: string;
  token: string;
  fetchImpl?: typeof fetch;
};

export type ClickUpView = {
  id: string;
  name: string;
  type?: string;
};

export type ClickUpTask = {
  id: string;
  name: string;
  description?: string;
  status?: { status: string; color?: string; type?: string };
  url?: string;
  custom_fields?: ClickUpCustomFieldValue[];
};

export type ClickUpCustomFieldValue = {
  id: string;
  name?: string;
  type?: string;
  value?: unknown;
};

export type ClickUpCustomField = {
  id: string;
  name: string;
  type: string;
  type_config?: Record<string, unknown>;
};

export type ClickUpCustomTaskType = {
  id: string;
  name: string;
  color?: string;
  orderindex?: number;
};

export type ListTasksQuery = {
  archived?: boolean;
  page?: number;
  order_by?: string;
  reverse?: boolean;
  subtasks?: boolean;
  statuses?: string[];
  include_closed?: boolean;
  assignees?: number[];
  tags?: string[];
  due_date_gt?: number;
  due_date_lt?: number;
};

const DEFAULT_BASE_URL = "https://api.clickup.com/api/v2";

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

type ClickUpErrorResponse = {
  err?: string;
  error?: string;
};

const toErrorMessage = async (response: Response): Promise<string> => {
  try {
    const data = (await response.json()) as ClickUpErrorResponse;
    if (data?.err) return String(data.err);
    if (data?.error) return String(data.error);
  } catch {
    // ignore
  }
  return `${response.status} ${response.statusText}`.trim();
};

export class ClickUpClient {
  private baseUrl: string;
  private token: string;
  private fetchImpl: typeof fetch;

  constructor(config: ClickUpClientConfig) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.token = config.token;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private async request<T>(
    path: string,
    options?: { method?: string; body?: unknown; query?: Record<string, unknown> }
  ): Promise<T> {
    const url = `${this.baseUrl}${path}${buildQuery(options?.query)}`;
    const response = await this.fetchImpl(url, {
      method: options?.method ?? "GET",
      headers: {
        Authorization: this.token,
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

  listViews(listId: string): Promise<{ views: ClickUpView[] }> {
    return this.request(`/list/${listId}/view`);
  }

  getView(viewId: string): Promise<{ view: ClickUpView }> {
    return this.request(`/view/${viewId}`);
  }

  listTasks(listId: string, query?: ListTasksQuery): Promise<{ tasks: ClickUpTask[] }> {
    return this.request(`/list/${listId}/task`, { query });
  }

  getTask(taskId: string): Promise<ClickUpTask> {
    return this.request(`/task/${taskId}`);
  }

  listCustomFields(listId: string): Promise<{ fields: ClickUpCustomField[] }> {
    return this.request(`/list/${listId}/field`);
  }

  listCustomTaskTypes(teamId: string): Promise<{ custom_task_types: ClickUpCustomTaskType[] }> {
    return this.request(`/team/${teamId}/custom_task_type`);
  }
}

import { describe, expect, it } from "vitest";
import {
  VikunjaClient,
  absoluteReminder,
  relativeReminder,
  relativeReminderWithUnit,
} from "../vikunja";
import { createMockFetch, jsonResponse } from "./test_utils";

describe("VikunjaClient", () => {
  it("omits Authorization header when no token is set", async () => {
    const { fetchImpl, calls } = createMockFetch(() => jsonResponse({ id: 1, username: "u" }, { status: 200 }));

    const client = new VikunjaClient({ baseUrl: "https://vikunja.test", fetchImpl });
    await client.getCurrentUser();

    const headers = (calls[0]!.init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("adds Bearer Authorization after setToken()", async () => {
    const { fetchImpl, calls } = createMockFetch(() => jsonResponse([], { status: 200 }));

    const client = new VikunjaClient({ baseUrl: "https://vikunja.test", fetchImpl });
    client.setToken("tok");
    await client.listProjects();

    const headers = (calls[0]!.init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
  });

  it("posts login credentials to /api/v1/login", async () => {
    const { fetchImpl, calls } = createMockFetch(() =>
      jsonResponse({ token: "t", user: { id: 1, username: "u" } }, { status: 200 })
    );

    const client = new VikunjaClient({ baseUrl: "https://vikunja.test", fetchImpl });
    const res = await client.login("u", "p");

    expect(res.token).toBe("t");
    const req = calls[0]!;
    expect(req.url).toBe("https://vikunja.test/api/v1/login");
    expect(req.init?.method).toBe("POST");
    expect(req.init?.body).toBe(JSON.stringify({ username: "u", password: "p" }));
  });

  it("creates a task with reminders", async () => {
    const mockTask = {
      id: 1,
      title: "Test task",
      reminders: [{ reminder: "2024-01-15T10:00:00Z" }],
      created: "2024-01-01T00:00:00Z",
      updated: "2024-01-01T00:00:00Z",
    };
    const { fetchImpl, calls } = createMockFetch(() => jsonResponse(mockTask, { status: 201 }));

    const client = new VikunjaClient({ baseUrl: "https://vikunja.test", fetchImpl });
    client.setToken("tok");
    const task = await client.createTask(1, {
      title: "Test task",
      reminders: [absoluteReminder("2024-01-15T10:00:00Z")],
    });

    expect(task.reminders).toHaveLength(1);
    expect(task.reminders![0].reminder).toBe("2024-01-15T10:00:00Z");

    const req = calls[0]!;
    expect(req.url).toBe("https://vikunja.test/api/v1/projects/1/tasks");
    expect(req.init?.method).toBe("POST");
    const body = JSON.parse(req.init?.body as string);
    expect(body.reminders).toHaveLength(1);
  });

  it("gets a single task with reminders", async () => {
    const mockTask = {
      id: 42,
      title: "Task with reminders",
      reminders: [
        { reminder: "2024-01-15T10:00:00Z" },
        { relative_to: "due_date", relative_period: -3600 },
      ],
      created: "2024-01-01T00:00:00Z",
      updated: "2024-01-01T00:00:00Z",
    };
    const { fetchImpl, calls } = createMockFetch(() => jsonResponse(mockTask, { status: 200 }));

    const client = new VikunjaClient({ baseUrl: "https://vikunja.test", fetchImpl });
    client.setToken("tok");
    const task = await client.getTask(42);

    expect(task.reminders).toHaveLength(2);
    expect(calls[0]!.url).toBe("https://vikunja.test/api/v1/tasks/42");
    expect(calls[0]!.init?.method).toBe("GET");
  });

  it("gets task reminders", async () => {
    const mockTask = {
      id: 42,
      title: "Task with reminders",
      reminders: [{ relative_to: "due_date", relative_period: -3600 }],
      created: "2024-01-01T00:00:00Z",
      updated: "2024-01-01T00:00:00Z",
    };
    const { fetchImpl } = createMockFetch(() => jsonResponse(mockTask, { status: 200 }));

    const client = new VikunjaClient({ baseUrl: "https://vikunja.test", fetchImpl });
    client.setToken("tok");
    const reminders = await client.getTaskReminders(42);

    expect(reminders).toHaveLength(1);
    expect(reminders[0].relative_to).toBe("due_date");
    expect(reminders[0].relative_period).toBe(-3600);
  });

  it("sets task reminders", async () => {
    const mockTask = {
      id: 42,
      title: "Task",
      reminders: [{ reminder: "2024-02-01T08:00:00Z" }],
      created: "2024-01-01T00:00:00Z",
      updated: "2024-01-01T00:00:00Z",
    };
    const { fetchImpl, calls } = createMockFetch(() => jsonResponse(mockTask, { status: 200 }));

    const client = new VikunjaClient({ baseUrl: "https://vikunja.test", fetchImpl });
    client.setToken("tok");
    const task = await client.setTaskReminders(42, [absoluteReminder("2024-02-01T08:00:00Z")]);

    expect(task.reminders).toHaveLength(1);
    const req = calls[0]!;
    expect(req.url).toBe("https://vikunja.test/api/v1/tasks/42");
    expect(req.init?.method).toBe("POST");
    const body = JSON.parse(req.init?.body as string);
    expect(body.reminders).toHaveLength(1);
  });

  it("adds reminders to existing task", async () => {
    let callCount = 0;
    const mockTaskGet = {
      id: 42,
      title: "Task",
      reminders: [{ reminder: "2024-01-15T10:00:00Z" }],
      created: "2024-01-01T00:00:00Z",
      updated: "2024-01-01T00:00:00Z",
    };
    const mockTaskUpdate = {
      ...mockTaskGet,
      reminders: [
        { reminder: "2024-01-15T10:00:00Z" },
        { relative_to: "due_date", relative_period: -1800 },
      ],
    };
    const { fetchImpl, calls } = createMockFetch(() => {
      callCount++;
      return jsonResponse(callCount === 1 ? mockTaskGet : mockTaskUpdate, { status: 200 });
    });

    const client = new VikunjaClient({ baseUrl: "https://vikunja.test", fetchImpl });
    client.setToken("tok");
    const task = await client.addTaskReminders(42, [relativeReminder("due_date", -1800)]);

    expect(task.reminders).toHaveLength(2);
    expect(calls).toHaveLength(2);
    // First call is GET to fetch existing reminders
    expect(calls[0]!.init?.method).toBe("GET");
    // Second call is POST to update with combined reminders
    expect(calls[1]!.init?.method).toBe("POST");
    const body = JSON.parse(calls[1]!.init?.body as string);
    expect(body.reminders).toHaveLength(2);
  });

  it("clears task reminders", async () => {
    const mockTask = {
      id: 42,
      title: "Task",
      reminders: [],
      created: "2024-01-01T00:00:00Z",
      updated: "2024-01-01T00:00:00Z",
    };
    const { fetchImpl, calls } = createMockFetch(() => jsonResponse(mockTask, { status: 200 }));

    const client = new VikunjaClient({ baseUrl: "https://vikunja.test", fetchImpl });
    client.setToken("tok");
    const task = await client.clearTaskReminders(42);

    expect(task.reminders).toHaveLength(0);
    const body = JSON.parse(calls[0]!.init?.body as string);
    expect(body.reminders).toEqual([]);
  });
});

describe("Reminder helpers", () => {
  it("absoluteReminder creates an absolute reminder", () => {
    const reminder = absoluteReminder("2024-01-15T10:00:00Z");
    expect(reminder).toEqual({ reminder: "2024-01-15T10:00:00Z" });
  });

  it("relativeReminder creates a relative reminder", () => {
    const reminder = relativeReminder("due_date", -3600);
    expect(reminder).toEqual({ relative_to: "due_date", relative_period: -3600 });
  });

  it("relativeReminderWithUnit creates reminder with minutes before", () => {
    const reminder = relativeReminderWithUnit("due_date", 30, "minutes", "before");
    expect(reminder).toEqual({ relative_to: "due_date", relative_period: -1800 });
  });

  it("relativeReminderWithUnit creates reminder with hours before", () => {
    const reminder = relativeReminderWithUnit("due_date", 2, "hours", "before");
    expect(reminder).toEqual({ relative_to: "due_date", relative_period: -7200 });
  });

  it("relativeReminderWithUnit creates reminder with days before", () => {
    const reminder = relativeReminderWithUnit("start_date", 1, "days", "before");
    expect(reminder).toEqual({ relative_to: "start_date", relative_period: -86400 });
  });

  it("relativeReminderWithUnit creates reminder with weeks after", () => {
    const reminder = relativeReminderWithUnit("end_date", 1, "weeks", "after");
    expect(reminder).toEqual({ relative_to: "end_date", relative_period: 604800 });
  });

  it("relativeReminderWithUnit defaults to before", () => {
    const reminder = relativeReminderWithUnit("due_date", 15, "minutes");
    expect(reminder).toEqual({ relative_to: "due_date", relative_period: -900 });
  });
});


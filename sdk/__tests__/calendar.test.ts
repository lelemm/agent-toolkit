import { describe, expect, it } from "vitest";
import { GraphCalendarQueryClient } from "../calendar";
import { createMockFetch, jsonResponse } from "./test_utils";

describe("GraphCalendarQueryClient", () => {
  it("sends POST request to webhook with Graph URL", async () => {
    const { fetchImpl, calls } = createMockFetch(() =>
      jsonResponse({ value: [{ id: "e1", subject: "Test Event" }] }, { status: 200 })
    );

    const client = new GraphCalendarQueryClient({
      webhookUrl: "https://webhook.test/calendar",
      fetchImpl,
    });

    const result = await client.listEvents();

    expect(calls).toHaveLength(1);
    const req = calls[0]!;
    expect(req.url).toBe("https://webhook.test/calendar");
    expect(req.init?.method).toBe("POST");
    expect(req.init?.headers).toEqual({ "Content-Type": "application/json" });

    const body = JSON.parse(req.init?.body as string);
    expect(body.url).toBe("https://graph.microsoft.com/v1.0/me/events");

    expect(result.value).toHaveLength(1);
    expect(result.value[0].subject).toBe("Test Event");
  });

  it("builds correct URL for getEventsByDateRange", async () => {
    const { fetchImpl, calls } = createMockFetch(() =>
      jsonResponse({ value: [] }, { status: 200 })
    );

    const client = new GraphCalendarQueryClient({
      webhookUrl: "https://webhook.test/calendar",
      fetchImpl,
    });

    await client.getEventsByDateRange(
      "2024-01-15T00:00:00Z",
      "2024-01-16T23:59:59Z",
      { top: 10, orderBy: "start/dateTime asc" }
    );

    const body = JSON.parse(calls[0]!.init?.body as string);
    const url = new URL(body.url);

    expect(url.pathname).toBe("/v1.0/me/calendarView");
    expect(url.searchParams.get("startDateTime")).toBe("2024-01-15T00:00:00Z");
    expect(url.searchParams.get("endDateTime")).toBe("2024-01-16T23:59:59Z");
    expect(url.searchParams.get("$top")).toBe("10");
    expect(url.searchParams.get("$orderby")).toBe("start/dateTime asc");
  });

  it("builds correct URL for getEventsBySubject", async () => {
    const { fetchImpl, calls } = createMockFetch(() =>
      jsonResponse({ value: [] }, { status: 200 })
    );

    const client = new GraphCalendarQueryClient({
      webhookUrl: "https://webhook.test/calendar",
      fetchImpl,
    });

    await client.getEventsBySubject("Team Sync");

    const body = JSON.parse(calls[0]!.init?.body as string);
    const url = new URL(body.url);

    expect(url.searchParams.get("$filter")).toBe("contains(subject, 'Team Sync')");
  });

  it("escapes special characters in OData filter", async () => {
    const { fetchImpl, calls } = createMockFetch(() =>
      jsonResponse({ value: [] }, { status: 200 })
    );

    const client = new GraphCalendarQueryClient({
      webhookUrl: "https://webhook.test/calendar",
      fetchImpl,
    });

    // Subject with apostrophe
    await client.getEventsBySubject("John's Meeting");

    const body = JSON.parse(calls[0]!.init?.body as string);
    const url = new URL(body.url);

    // Apostrophe should be escaped as ''
    expect(url.searchParams.get("$filter")).toBe("contains(subject, 'John''s Meeting')");
  });

  it("builds correct URL for getEventById", async () => {
    const { fetchImpl, calls } = createMockFetch(() =>
      jsonResponse({ id: "event-123", subject: "My Event" }, { status: 200 })
    );

    const client = new GraphCalendarQueryClient({
      webhookUrl: "https://webhook.test/calendar",
      fetchImpl,
    });

    const event = await client.getEventById("event-123");

    const body = JSON.parse(calls[0]!.init?.body as string);
    expect(body.url).toBe("https://graph.microsoft.com/v1.0/me/events/event-123");
    expect(event.subject).toBe("My Event");
  });

  it("builds correct URL for listCalendars", async () => {
    const { fetchImpl, calls } = createMockFetch(() =>
      jsonResponse({ value: [{ id: "cal-1", name: "Calendar" }] }, { status: 200 })
    );

    const client = new GraphCalendarQueryClient({
      webhookUrl: "https://webhook.test/calendar",
      fetchImpl,
    });

    const calendars = await client.listCalendars();

    const body = JSON.parse(calls[0]!.init?.body as string);
    expect(body.url).toBe("https://graph.microsoft.com/v1.0/me/calendars");
    expect(calendars.value[0].name).toBe("Calendar");
  });

  it("builds correct URL for getOnlineMeetings", async () => {
    const { fetchImpl, calls } = createMockFetch(() =>
      jsonResponse({ value: [] }, { status: 200 })
    );

    const client = new GraphCalendarQueryClient({
      webhookUrl: "https://webhook.test/calendar",
      fetchImpl,
    });

    await client.getOnlineMeetings();

    const body = JSON.parse(calls[0]!.init?.body as string);
    const url = new URL(body.url);

    expect(url.searchParams.get("$filter")).toBe("isOnlineMeeting eq true");
  });

  it("supports specific calendar ID", async () => {
    const { fetchImpl, calls } = createMockFetch(() =>
      jsonResponse({ value: [] }, { status: 200 })
    );

    const client = new GraphCalendarQueryClient({
      webhookUrl: "https://webhook.test/calendar",
      fetchImpl,
    });

    await client.listEvents("calendar-123", { top: 5 });

    const body = JSON.parse(calls[0]!.init?.body as string);
    const url = new URL(body.url);

    expect(url.pathname).toBe("/v1.0/me/calendars/calendar-123/events");
    expect(url.searchParams.get("$top")).toBe("5");
  });
});

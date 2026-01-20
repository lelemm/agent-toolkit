import { describe, expect, it } from "vitest";
import { VikunjaClient } from "../vikunja";
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
});


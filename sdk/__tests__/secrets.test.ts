import { describe, expect, it } from "vitest";
import { ENV_KEYS, getClickUpSecrets, getVikunjaSecrets } from "../secrets";

describe("secrets helpers", () => {
  it("throws when required env vars are missing", () => {
    const readEnv = () => undefined;
    expect(() => getClickUpSecrets(readEnv)).toThrow(`Missing required environment variable: ${ENV_KEYS.CLICKUP_TOKEN}`);
    expect(() => getVikunjaSecrets(readEnv)).toThrow(`Missing required environment variable: ${ENV_KEYS.VIKUNJA_BASE_URL}`);
  });

  it("reads optional values when present", () => {
    const readEnv = (key: string) => {
      if (key === ENV_KEYS.CLICKUP_TOKEN) return "tok";
      if (key === ENV_KEYS.CLICKUP_BASE_URL) return "https://c.test";
      return undefined;
    };
    expect(getClickUpSecrets(readEnv)).toEqual({ token: "tok", baseUrl: "https://c.test" });
  });
});


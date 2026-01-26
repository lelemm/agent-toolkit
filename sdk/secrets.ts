type EnvReader = (key: string) => string | undefined;

const defaultEnvReader: EnvReader = (key) => {
  if (typeof process !== "undefined" && process.env) {
    return process.env[key];
  }
  return undefined;
};

const requireEnv = (key: string, readEnv: EnvReader): string => {
  const value = readEnv(key);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const optionalEnv = (key: string, readEnv: EnvReader): string | undefined => readEnv(key);

export const ENV_KEYS = {
  CLICKUP_TOKEN: "CLICKUP_TOKEN",
  CLICKUP_BASE_URL: "CLICKUP_BASE_URL",
  GRAPH_BASE_URL: "GRAPH_BASE_URL",
  GRAPH_TENANT_ID: "GRAPH_TENANT_ID",
  GRAPH_CLIENT_ID: "GRAPH_CLIENT_ID",
  TIME_TRACKING_BASE_URL: "TIME_TRACKING_BASE_URL",
  TIME_TRACKING_API_KEY: "TIME_TRACKING_API_KEY",
  VIKUNJA_BASE_URL: "VIKUNJA_BASE_URL",
  VIKUNJA_TOKEN: "VIKUNJA_TOKEN",
  VIKUNJA_USERNAME: "VIKUNJA_USERNAME",
  VIKUNJA_PASSWORD: "VIKUNJA_PASSWORD",
} as const;

export type ClickUpSecrets = {
  token: string;
  baseUrl?: string;
};

export type GraphSecrets = {
  baseUrl?: string;
  tenantId?: string;
  clientId?: string;
};

export type TimeTrackingSecrets = {
  baseUrl?: string;
  apiKey?: string;
};

export type VikunjaSecrets = {
  baseUrl: string;
  token?: string;
};

export type VikunjaLoginSecrets = {
  username: string;
  password: string;
};

export const getClickUpSecrets = (readEnv: EnvReader = defaultEnvReader): ClickUpSecrets => ({
  token: requireEnv(ENV_KEYS.CLICKUP_TOKEN, readEnv),
  baseUrl: optionalEnv(ENV_KEYS.CLICKUP_BASE_URL, readEnv),
});

export const getGraphSecrets = (readEnv: EnvReader = defaultEnvReader): GraphSecrets => ({
  baseUrl: optionalEnv(ENV_KEYS.GRAPH_BASE_URL, readEnv),
  tenantId: optionalEnv(ENV_KEYS.GRAPH_TENANT_ID, readEnv),
  clientId: optionalEnv(ENV_KEYS.GRAPH_CLIENT_ID, readEnv),
});

export const getTimeTrackingSecrets = (
  readEnv: EnvReader = defaultEnvReader
): TimeTrackingSecrets => ({
  baseUrl: optionalEnv(ENV_KEYS.TIME_TRACKING_BASE_URL, readEnv),
  apiKey: optionalEnv(ENV_KEYS.TIME_TRACKING_API_KEY, readEnv),
});

export const getVikunjaSecrets = (readEnv: EnvReader = defaultEnvReader): VikunjaSecrets => ({
  baseUrl: requireEnv(ENV_KEYS.VIKUNJA_BASE_URL, readEnv),
  token: optionalEnv(ENV_KEYS.VIKUNJA_TOKEN, readEnv),
});

export const getVikunjaLoginSecrets = (
  readEnv: EnvReader = defaultEnvReader
): VikunjaLoginSecrets => ({
  username: requireEnv(ENV_KEYS.VIKUNJA_USERNAME, readEnv),
  password: requireEnv(ENV_KEYS.VIKUNJA_PASSWORD, readEnv),
});

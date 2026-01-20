export type FetchCall = {
  url: string;
  init?: RequestInit;
};

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function textResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, init);
}

export function createMockFetch(resolver: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
    const call: FetchCall = { url, init };
    calls.push(call);
    return await resolver(call);
  }) as unknown as typeof fetch;

  return { fetchImpl, calls };
}


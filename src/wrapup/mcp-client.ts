export interface McpCall {
  server: string;
  tool: string;
  input: Record<string, unknown>;
}

export type McpResponse = Record<string, unknown>;

/** Minimal MCP client surface the wrap-up depends on (real or mock). */
export interface McpClient {
  call(call: McpCall): McpResponse;
}

type Handler = (input: Record<string, unknown>) => McpResponse;

/**
 * In-memory MCP client for CI-safe wrap-up tests and the smoke gate — no live
 * credentials, no network. Handlers are keyed by `${server}/${tool}`.
 */
export class MockMcpClient implements McpClient {
  private readonly handlers = new Map<string, Handler>();
  readonly calls: McpCall[] = [];

  on(server: string, tool: string, handler: Handler): this {
    this.handlers.set(`${server}/${tool}`, handler);
    return this;
  }

  call(call: McpCall): McpResponse {
    this.calls.push(call);
    const handler = this.handlers.get(`${call.server}/${call.tool}`);
    if (!handler) {
      throw new Error(`MockMcpClient: no handler for ${call.server}/${call.tool}`);
    }
    return handler(call.input);
  }
}

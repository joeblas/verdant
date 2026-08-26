/**
 * WebMCP imperative API (W3C Web Machine Learning CG draft, July 2026).
 * The API lives on `document.modelContext`; tools are registered with an
 * AbortSignal for lifecycle management. Declared here until the types ship
 * with TypeScript's DOM lib.
 */

interface ModelContextToolExecuteOptions {
  signal: AbortSignal;
}

interface ModelContextTool {
  name: string;
  description: string;
  inputSchema?: object;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (
    input: Record<string, unknown>,
    options?: ModelContextToolExecuteOptions,
  ) => Promise<unknown>;
}

interface ModelContextRegisterToolOptions {
  signal?: AbortSignal;
  exposedTo?: string[];
}

interface ModelContextGetToolOptions {
  fromOrigins?: string[];
}

interface ModelContextExecuteToolOptions {
  signal?: AbortSignal;
}

interface RegisteredTool {
  name: string;
  description: string;
  inputSchema?: object;
  origin: string;
}

interface ModelContext extends EventTarget {
  registerTool(
    tool: ModelContextTool,
    options?: ModelContextRegisterToolOptions,
  ): Promise<undefined>;
  getTools(options?: ModelContextGetToolOptions): Promise<RegisteredTool[]>;
  executeTool(
    tool: RegisteredTool,
    inputObject?: object,
    options?: ModelContextExecuteToolOptions,
  ): Promise<string>;
  ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null;
}

interface Document {
  readonly modelContext?: ModelContext;
}

import { create } from 'zustand';
import { gardenTools } from './tools';

export type WebMCPStatus = 'checking' | 'unsupported' | 'registered' | 'error';

interface WebMCPStatusState {
  status: WebMCPStatus;
  toolCount: number;
}

export const useWebMCPStatus = create<WebMCPStatusState>()(() => ({
  status: 'checking',
  toolCount: 0,
}));

let controller: AbortController | null = null;

/**
 * Registers the garden's tools on `document.modelContext` so WebMCP-capable
 * agents (ChatGPT in-app browser, Chrome 146+) can discover and invoke them.
 * The game is fully playable without WebMCP — this layer is additive.
 */
export async function registerWebMCPTools(): Promise<void> {
  if (typeof document === 'undefined' || !document.modelContext) {
    useWebMCPStatus.setState({ status: 'unsupported', toolCount: 0 });
    return;
  }

  controller?.abort();
  controller = new AbortController();

  let registered = 0;
  for (const tool of gardenTools) {
    try {
      await document.modelContext.registerTool(
        {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          execute: (input) => tool.execute(input ?? {}),
        },
        { signal: controller.signal },
      );
      registered++;
    } catch (err) {
      console.warn(`[webmcp] failed to register "${tool.name}":`, err);
    }
  }

  useWebMCPStatus.setState({
    status: registered === gardenTools.length ? 'registered' : registered > 0 ? 'registered' : 'error',
    toolCount: registered,
  });
}

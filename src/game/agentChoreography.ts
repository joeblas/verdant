export const BOT_TRAVEL_MS = 720;
export const BOT_ACTION_MS = 780;

export function waitForBot(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

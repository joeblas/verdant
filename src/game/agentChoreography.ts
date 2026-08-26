export const BOT_ACTION_MS = 780;
export const BOT_WALK_SPEED = 5.2;

const MIN_TRAVEL_MS = 350;
const ARRIVAL_TIMEOUT_MS = 12_000;
const arrivedEvents = new Set<number>();
const expiredEvents = new Set<number>();
const arrivalWaiters = new Map<number, () => void>();

export function botTravelMs(distance: number): number {
  return Math.max(MIN_TRAVEL_MS, (distance / BOT_WALK_SPEED) * 1000);
}

export function signalBotArrival(eventId: number): void {
  if (expiredEvents.delete(eventId)) return;
  const resolve = arrivalWaiters.get(eventId);
  if (resolve) {
    arrivalWaiters.delete(eventId);
    resolve();
    return;
  }
  arrivedEvents.add(eventId);
}

export function waitForBotArrival(eventId: number): Promise<void> {
  if (arrivedEvents.delete(eventId)) return Promise.resolve();

  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timeout);
      arrivedEvents.delete(eventId);
      resolve();
    };
    const timeout = window.setTimeout(() => {
      arrivalWaiters.delete(eventId);
      expiredEvents.add(eventId);
      finish();
    }, ARRIVAL_TIMEOUT_MS);
    arrivalWaiters.set(eventId, finish);
  });
}

export function waitForBot(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

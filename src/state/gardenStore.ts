import { create } from 'zustand';
import { PLANT_TYPES, isPlantTypeId, type PlantTypeId } from '../game/plants';
import { advancePlant } from '../game/tick';
import type {
  ActionResult,
  ActivityEntry,
  Actor,
  GardenEvent,
  Plant,
} from '../game/types';

export const PLOT_COUNT = 16;
const STORAGE_KEY = 'verdant-garden-v1';
const MAX_ACTIVITY = 40;

interface PersistedState {
  plants: Record<string, Plant>;
  basket: Partial<Record<PlantTypeId, number>>;
}

interface GardenState extends PersistedState {
  selectedPlot: number | null;
  selectedSeed: PlantTypeId;
  activity: ActivityEntry[];
  lastEvents: GardenEvent[];

  selectPlot: (plotIndex: number | null) => void;
  selectSeed: (type: PlantTypeId) => void;
  plantSeed: (type: PlantTypeId, plotIndex: number | null, actor: Actor) => ActionResult;
  waterPlant: (plantId: string, actor: Actor) => ActionResult;
  waterAllThirsty: (actor: Actor) => ActionResult;
  harvestPlant: (plantId: string, actor: Actor) => ActionResult;
  harvestAllReady: (actor: Actor) => ActionResult;
  removePlant: (plantId: string, actor: Actor) => ActionResult;
  signalAgentAction: (kind: GardenEvent['kind'], plotIndex: number | null) => number;
  signalAgentInspection: () => void;
  tickAll: () => void;
}

function makePlantId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `plant-${Date.now().toString(36)}-${rand}`;
}

function emptyPlots(plants: Record<string, Plant>): number[] {
  const occupied = new Set(Object.values(plants).map((p) => p.plotIndex));
  const free: number[] = [];
  for (let i = 0; i < PLOT_COUNT; i++) {
    if (!occupied.has(i)) free.push(i);
  }
  return free;
}

function tickPlants(plants: Record<string, Plant>, now: number): Record<string, Plant> {
  let changed = false;
  const next: Record<string, Plant> = {};
  for (const [id, plant] of Object.entries(plants)) {
    const advanced = advancePlant(plant, now);
    if (advanced !== plant) changed = true;
    next[id] = advanced;
  }
  return changed ? next : plants;
}

function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { plants: {}, basket: {} };
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const plants: Record<string, Plant> = {};
    for (const [id, plant] of Object.entries(parsed.plants ?? {})) {
      if (plant && isPlantTypeId(plant.type)) plants[id] = plant;
    }
    return { plants, basket: parsed.basket ?? {} };
  } catch {
    return { plants: {}, basket: {} };
  }
}

let eventCounter = 0;

export const useGardenStore = create<GardenState>()((set, get) => {
  const log = (actor: Actor, message: string) => {
    set((state) => ({
      activity: [
        {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          at: Date.now(),
          actor,
          message,
        },
        ...state.activity,
      ].slice(0, MAX_ACTIVITY),
    }));
  };

  const emitEvent = (
    kind: GardenEvent['kind'],
    plotIndex: number | null,
    actor: Actor,
    phase: GardenEvent['phase'] = 'effect',
  ) => {
    const event: GardenEvent = {
      id: ++eventCounter,
      kind,
      plotIndex,
      actor,
      phase,
      at: Date.now(),
    };
    set((state) => ({
      lastEvents: [
        ...state.lastEvents.slice(-19),
        event,
      ],
    }));
    return event.id;
  };

  const fail = (message: string): ActionResult => ({ ok: false, message });

  return {
    ...loadPersisted(),
    selectedPlot: null,
    selectedSeed: 'lettuce',
    activity: [],
    lastEvents: [],

    selectPlot: (plotIndex) => set({ selectedPlot: plotIndex }),
    selectSeed: (type) => set({ selectedSeed: type }),

    plantSeed: (type, plotIndex, actor) => {
      get().tickAll();
      const { plants } = get();
      const plantType = PLANT_TYPES[type];

      let target = plotIndex;
      if (target === null) {
        target = emptyPlots(plants)[0] ?? null;
        if (target === null) return fail('The garden is full — no empty plots left.');
      }
      if (target < 0 || target >= PLOT_COUNT) {
        return fail(`Plot ${target} is out of range. Plots are numbered 0 to ${PLOT_COUNT - 1}.`);
      }
      if (Object.values(plants).some((p) => p.plotIndex === target)) {
        return fail(`Plot ${target} is already occupied.`);
      }

      const now = Date.now();
      const plant: Plant = {
        id: makePlantId(),
        type,
        plotIndex: target,
        growth: 0,
        health: 100,
        water: 60,
        stage: 'seed',
        readyToHarvest: false,
        plantedAt: now,
        lastTickAt: now,
      };
      set({ plants: { ...plants, [plant.id]: plant } });
      emitEvent('plant', target, actor);
      const message = `Planted ${plantType.name} in plot ${target} (id: ${plant.id}).`;
      log(actor, message);
      return { ok: true, message };
    },

    waterPlant: (plantId, actor) => {
      get().tickAll();
      const plant = get().plants[plantId];
      if (!plant) return fail(`No plant with id "${plantId}".`);
      if (plant.stage === 'withered') {
        return fail(`${PLANT_TYPES[plant.type].name} (${plantId}) has withered and can't be watered — remove it instead.`);
      }
      const type = PLANT_TYPES[plant.type];
      const water = Math.min(100, plant.water + type.waterPerWatering);
      set({
        plants: { ...get().plants, [plantId]: { ...plant, water } },
      });
      emitEvent('water', plant.plotIndex, actor);
      const message = `Watered ${type.name} (${plantId}) — water ${Math.round(plant.water)} → ${Math.round(water)}.`;
      log(actor, message);
      return { ok: true, message };
    },

    waterAllThirsty: (actor) => {
      get().tickAll();
      const thirsty = Object.values(get().plants).filter(
        (p) => p.stage !== 'withered' && p.water < 35,
      );
      if (thirsty.length === 0) {
        return { ok: true, message: 'No thirsty plants right now — everything has enough water.' };
      }
      const plants = { ...get().plants };
      for (const plant of thirsty) {
        const type = PLANT_TYPES[plant.type];
        plants[plant.id] = { ...plant, water: Math.min(100, plant.water + type.waterPerWatering) };
        emitEvent('water', plant.plotIndex, actor);
      }
      set({ plants });
      const names = thirsty.map((p) => `${PLANT_TYPES[p.type].name} (${p.id})`).join(', ');
      const message = `Watered ${thirsty.length} thirsty plant${thirsty.length === 1 ? '' : 's'}: ${names}.`;
      log(actor, message);
      return { ok: true, message };
    },

    harvestPlant: (plantId, actor) => {
      get().tickAll();
      const plant = get().plants[plantId];
      if (!plant) return fail(`No plant with id "${plantId}".`);
      const type = PLANT_TYPES[plant.type];
      if (plant.stage === 'withered') {
        return fail(`${type.name} (${plantId}) has withered — there is nothing to harvest.`);
      }
      if (!plant.readyToHarvest) {
        const pct = Math.round(plant.growth * 100);
        return fail(`${type.name} (${plantId}) is still ${plant.stage} (${pct}% grown) — not ready to harvest yet.`);
      }
      const plants = { ...get().plants };
      delete plants[plantId];
      const basket = { ...get().basket, [plant.type]: (get().basket[plant.type] ?? 0) + type.harvestYield };
      set({ plants, basket });
      emitEvent('harvest', plant.plotIndex, actor);
      const message = `Harvested ${type.harvestYield}× ${type.name} from plot ${plant.plotIndex}.`;
      log(actor, message);
      return { ok: true, message };
    },

    harvestAllReady: (actor) => {
      get().tickAll();
      const ready = Object.values(get().plants).filter((p) => p.readyToHarvest);
      if (ready.length === 0) {
        return { ok: true, message: 'Nothing is ready to harvest yet.' };
      }
      const plants = { ...get().plants };
      const basket = { ...get().basket };
      const names: string[] = [];
      for (const plant of ready) {
        const type = PLANT_TYPES[plant.type];
        delete plants[plant.id];
        basket[plant.type] = (basket[plant.type] ?? 0) + type.harvestYield;
        names.push(`${type.name} (${plant.id})`);
        emitEvent('harvest', plant.plotIndex, actor);
      }
      set({ plants, basket });
      const message = `Harvested ${ready.length} plant${ready.length === 1 ? '' : 's'}: ${names.join(', ')}.`;
      log(actor, message);
      return { ok: true, message };
    },

    removePlant: (plantId, actor) => {
      const plant = get().plants[plantId];
      if (!plant) return fail(`No plant with id "${plantId}".`);
      const type = PLANT_TYPES[plant.type];
      if (plant.stage !== 'withered') {
        return fail(`${type.name} (${plantId}) is still alive — only withered plants can be removed.`);
      }
      const plants = { ...get().plants };
      delete plants[plantId];
      set({ plants });
      emitEvent('remove', plant.plotIndex, actor);
      const message = `Cleared the withered ${type.name} from plot ${plant.plotIndex}.`;
      log(actor, message);
      return { ok: true, message };
    },

    signalAgentAction: (kind, plotIndex) => emitEvent(kind, plotIndex, 'agent', 'intent'),
    signalAgentInspection: () => emitEvent('inspect', null, 'agent', 'intent'),

    tickAll: () => {
      const now = Date.now();
      const plants = tickPlants(get().plants, now);
      if (plants !== get().plants) set({ plants });
    },
  };
});

// Persist plants + basket (debounced) so the garden survives reloads.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
useGardenStore.subscribe((state, prev) => {
  if (state.plants === prev.plants && state.basket === prev.basket) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { plants, basket } = useGardenStore.getState();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ plants, basket }));
    } catch {
      // storage full or unavailable — the garden simply won't persist
    }
  }, 400);
});

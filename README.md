# verdant

**A relaxing 3D garden you tend together with an AI agent.**

Live: https://verdant.joebgallegos.workers.dev

verdant is a calm, low-poly garden. You plant seeds, keep them watered, and
harvest them when they're ready. The twist: the garden is **agent-ready** via
[WebMCP](https://github.com/webmachinelearning/webmcp) — open it in ChatGPT's
in-app browser or Chrome with WebMCP enabled, and an AI agent can discover the
garden's tools and co-tend the same live garden alongside you. Ask it to
"water anything thirsty" or "plant tomatoes in the empty plots" and watch the
garden — and the garden log — update in real time.

Built for the [OpenAI WebMCP Challenge](https://openai.com/webmcp-challenge/).

## Quickstart

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # simulation, aisle-routing, and agent-progress checks
npm run build    # type-check + production build to dist/
npm run deploy   # deploys dist/ to Cloudflare Workers Static Assets
```

## Co-tending with an agent

1. Open the live URL in ChatGPT's in-app browser or Chrome 146+ with WebMCP
   enabled.
2. The badge in the top-left turns green: **"Agent-ready · 12 tools"**.
3. Ask the agent things like:
   - "What's the state of my garden?"
   - "What needs attention right now?"
   - "Plant a sunflower in an empty plot."
   - "Water everything that's thirsty, then harvest whatever's ready."

Every agent action runs through the same validated store actions as your own
clicks, appears in the garden log tagged `agent`, and plays the same
animations. A little garden robot springs to life for WebMCP calls, scanning
on read-only tools and walking through the widened aisles to plant, water,
harvest, or clear each affected plot — the agent is a fellow gardener, not a
macro. Bulk chores return immediately as observable background jobs with live
progress, and complete planting layouts can be previewed as glowing ghost
plants for human approval before the robot begins. A preview can also include
one accelerated demo-day of aftercare; once approved, that care is owned by the
browser job and continues after the agent's turn ends.

### WebMCP tools

Registered on `document.modelContext` (imperative API, July 2026 CG draft),
with `AbortSignal` lifecycle management and `readOnlyHint` annotations where
applicable:

| Tool | Description |
| --- | --- |
| `get_garden_state` | Full live snapshot: every plot, plant id, stage, health, water, readiness, basket. *(read-only)* |
| `list_plant_types` | Seed catalog: growth times, water needs, yields. *(read-only)* |
| `get_care_recommendations` | Prioritized "what needs attention now" — thirsty, harvest-ready, withered, empty plots. *(read-only)* |
| `plant_seed` | Plant a seed (`plantType`, optional `plotIndex`; auto-picks an empty plot). |
| `water_plant` | Water one plant by id. |
| `water_all_thirsty` | Water every plant below 35% water in one call. |
| `harvest_plant` | Harvest one ready plant by id. |
| `harvest_all_ready` | Harvest everything ready. |
| `remove_plant` | Clear a withered plant (living plants are never destroyed). |
| `preview_garden_plan` | Render a proposed multi-plot layout without changing garden state. |
| `run_garden_plan` | Execute the visible plan after human approval as a background job. |
| `get_agent_job` | Read live progress and results for an asynchronous robot job. *(read-only)* |

## The game

- **Six plant types** — lettuce, carrot, tomato, lavender, sunflower, pumpkin —
  each with its own growth time, thirst rate, and harvest yield.
- **Every plant is an entity**: unique id, health (0–100), water (0–100),
  growth stage (`seed → sprout → growing → mature`), and a `readyToHarvest`
  flag. Neglect a thirsty plant and it withers; overwatering slowly hurts too.
- **Wall-clock simulation**: the garden keeps growing while the tab is closed
  (state persists in `localStorage` and catches up on return).
- **A bright low-poly daylight scene** with widened walkable aisles, swaying
  plants, harvest sparkles, and optional synthesized wind + birdsong.
- **A balanced demo season** with 12× growth and 6× care needs, so planting,
  tending, withering, and harvesting fit a short judging session while remaining
  physically achievable by the on-screen robot.

## How it works

```
Human ──clicks──► React UI ─┐
                            ├──► shared garden actions ──► Zustand store ──► 3D scene
Agent ──WebMCP──► tool layer ┘         │                     │
                                       └── same validation,  ├──► localStorage
                                           same results      └──► garden log (you / agent)
```

- `src/state/gardenStore.ts` — single source of truth. UI handlers and WebMCP
  tool handlers call the *same* actions, so behavior is identical no matter
  who acts.
- `src/game/tick.ts` — pure, wall-clock-based plant simulation.
- `src/webmcp/tools.ts` — the 12 tool definitions (JSON Schema inputs, MCP-style
  content results).
- `src/webmcp/register.ts` — feature-detects `document.modelContext` and
  registers all tools; the game is fully playable without WebMCP.
- `src/components/` — React Three Fiber scene: procedural low-poly plants per
  growth stage, bright daylight, particle effects, plan ghosts, and job HUD.

## Tech

Vite · React 19 · TypeScript · React Three Fiber · drei · Zustand · Cloudflare
Workers Static Assets. No image or audio assets — everything is procedural.

## License

MIT — see [LICENSE](./LICENSE).

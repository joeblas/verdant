# WebMCP Challenge — submission notes

Draft text for the Devpost submission form. (Video link to be added after
recording — see the checklist at the bottom.)

## Tagline

verdant — a relaxing 3D garden that you and an AI agent tend together, live in
the same page.

## What it is

verdant is a calm, low-poly 3D garden. You plant seeds, keep them watered, and
harvest them when they're ready. Because the garden is agent-ready via WebMCP,
an AI agent in ChatGPT's in-app browser (or Chrome with WebMCP) can discover
the garden's nine tools and garden alongside you — watering what's thirsty,
harvesting what's ready, and planting whatever you ask for — while you watch
the scene, the plants, and the garden log respond in real time. A garden robot
scans on read-only calls, then hops between plots with the right tool in hand
whenever the agent plants, waters, harvests, or clears something.

## Why this is a strong fit for WebMCP

Most WebMCP demos will be productivity flows — search this, book that, fill
this form. verdant shows a different shape for the agentic web: **a shared,
living space that people and agents inhabit together**. A garden is stateful,
visual, and continuous; it exists whether or not anyone is looking at it. That
makes it a natural fit for tools rather than clicks:

- The state is structured and meaningful (plants with ids, health, water,
  growth stages) — exactly what tool schemas are good at.
- Care is recurring and judgment-based, so a planning primitive
  (`get_care_recommendations`) lets an agent be genuinely helpful instead of
  mechanically clicking.
- The feedback loop is the product: watching an agent's watering can appear in
  your garden is the moment WebMCP stops being plumbing and becomes presence.

## What people and agents can do together that was difficult before

Without WebMCP, an agent could only "garden" by screenshotting the page and
guessing at pixels — slow, brittle, and blind to the simulation underneath.
With WebMCP, the agent gets the garden's actual state and real, validated
actions:

- **Hand off the chores**: "keep everything watered for the next ten minutes"
  while you relax and watch.
- **Collaborate on design**: "fill the back row with flowers and put pumpkins
  in the corners" — the agent plans placements across the 16 plots.
- **Learn the game**: ask "why did my lettuce wither?" and the agent can read
  real health/water history semantics from the tools and explain.

Because UI clicks and tool calls run through the exact same store actions, the
agent can never do anything you couldn't do — it's a fellow gardener with the
same hands, not a cheat code.

## How WebMCP is implemented

- Imperative API on `document.modelContext` (July 2026 CG draft), with feature
  detection, one `AbortController` for the whole tool set, and
  `annotations.readOnlyHint` on the three query tools.
- Nine tools: `get_garden_state`, `list_plant_types`,
  `get_care_recommendations` (all read-only), plus `plant_seed`,
  `water_plant`, `water_all_thirsty`, `harvest_plant`, `harvest_all_ready`,
  `remove_plant`.
- Every tool has a tight JSON Schema (`additionalProperties: false`, enums for
  plant types, plot index bounds) and returns MCP-style text content with
  structured JSON for the agent to reason over.
- Tool handlers call the same Zustand store actions as the React UI, so
  validation, error messages, animations, and the activity log are identical
  for both actors. Agent actions are tagged `agent` in the garden log and feed
  a queued event stream that drives the garden robot's plot-by-plot actions.
- The simulation is wall-clock based and persisted to `localStorage`, so the
  garden keeps growing between visits — for you and for the agent.

## Links

- Live URL: https://verdant.joebgallegos.workers.dev
- Repo: https://github.com/joeblas/verdant (MIT)
- Demo video: TODO — <3 min YouTube, with audio

## Submission checklist

- [x] Live URL accessible in ChatGPT in-app browser / Chrome with WebMCP
- [x] Public repo with source, README, and MIT license
- [x] Text description (above)
- [ ] Demo video (<3 min, public YouTube, audio narration):
  suggested arc — (1) 10s: tend the garden by hand; (2) 20s: open in ChatGPT,
  badge turns green, "agent-ready · 9 tools"; (3) 60s: agent reads state,
  waters the thirsty, harvests the ready, plants a requested layout;
  (4) 20s: the garden log showing `you` and `agent` side by side.
- [ ] Submit on Devpost before **Sept 3, 2026, 1:00 pm PDT**

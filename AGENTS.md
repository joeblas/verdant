# Agent guide — verdant

Local coding agents (Cursor and similar) should run this app themselves and
talk to it through **WebMCP in Chrome**, not through ChatGPT, Codex, or
Cursor's built-in browser.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # simulation, aisle-routing, and agent-progress checks
```

`localhost` is a secure context, so WebMCP works without HTTPS.

## Chrome DevTools MCP

Project config is `.cursor/mcp.json`. It starts **Chrome stable** with:

- `--category-experimental-webmcp`
- `--chrome-arg=--enable-features=WebMCP`

That exposes `list_webmcp_tools` and `execute_webmcp_tool`.

Cursor's embedded browser cannot turn this flag on. If those two tools are
missing from your tool list, ask the human to enable the
`chrome-devtools-webmcp` MCP server, or use the CLI fallback below.

## Verify a change

1. Confirm `npm run dev` is serving http://localhost:5173
2. Navigate there with Chrome DevTools MCP
3. `list_webmcp_tools` — expect all 12 garden tools
4. Call real tools with `execute_webmcp_tool` (start with `get_garden_state`)
5. Confirm the page badge reads **Agent-ready · 12 tools**
6. Confirm the garden log tags your calls as `agent`
7. Screenshot or snapshot the robot / scene if the change is visual

Do **not** treat `evaluate_script` into the Zustand store as WebMCP
verification. That bypasses `document.modelContext`.

## Garden tools

Registered on `document.modelContext` by `src/webmcp/register.ts`.

| Tool | Notes |
| --- | --- |
| `get_garden_state` | Full live snapshot. Call first. *(read-only)* |
| `list_plant_types` | Seed catalog. *(read-only)* |
| `get_care_recommendations` | Thirsty, harvest-ready, withered, empty. *(read-only)* |
| `plant_seed` | `plantType`, optional `plotIndex` 0–15 |
| `water_plant` | One plant by `plantId` |
| `water_all_thirsty` | Every plant below 35% water |
| `harvest_plant` | One ready plant by `plantId` |
| `harvest_all_ready` | Every ready plant |
| `remove_plant` | Withered plants only |
| `preview_garden_plan` | Ghost layout; does not plant |
| `run_garden_plan` | Execute an approved preview as a background job |
| `get_agent_job` | Poll job progress. *(read-only)* |

## CLI fallback

Use this only when the MCP server is not loaded in the current session:

```bash
npx -y --package=chrome-devtools-mcp@latest chrome-devtools start \
  --no-headless \
  --categoryExperimentalWebmcp \
  --chrome-arg=--enable-features=WebMCP \
  --userDataDir="$HOME/.cache/verdant-webmcp-chrome"

npx -y --package=chrome-devtools-mcp@latest chrome-devtools navigate_page 1 \
  --type url --url http://localhost:5173/

npx -y --package=chrome-devtools-mcp@latest chrome-devtools list_webmcp_tools 1

npx -y --package=chrome-devtools-mcp@latest chrome-devtools execute_webmcp_tool 1 \
  get_garden_state
```

## Code map

- `src/webmcp/tools.ts` — tool definitions
- `src/webmcp/register.ts` — `document.modelContext` registration
- `src/state/gardenStore.ts` — shared store used by UI and tools
- `src/game/tick.ts` — wall-clock simulation

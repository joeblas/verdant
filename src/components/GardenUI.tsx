import { useState } from 'react';
import { PLANT_TYPES, PLANT_TYPE_LIST } from '../game/plants';
import { useGardenStore } from '../state/gardenStore';
import { gardenTools } from '../webmcp/tools';
import { useWebMCPStatus } from '../webmcp/register';
import { AmbientAudio } from './AmbientAudio';

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${Math.round(value)}%`, background: color }} />
      </div>
      <span className="bar-value">{Math.round(value)}</span>
    </div>
  );
}

function WebMCPBadge() {
  const { status, toolCount } = useWebMCPStatus();
  const [open, setOpen] = useState(false);

  const label =
    status === 'registered'
      ? `Agent-ready · ${toolCount} tools`
      : status === 'checking'
        ? 'Checking for WebMCP…'
        : status === 'error'
          ? 'WebMCP error'
          : 'WebMCP not detected';

  return (
    <>
      <button className={`webmcp-badge ${status}`} onClick={() => setOpen((v) => !v)}>
        <span className="webmcp-dot" />
        {label}
      </button>
      {open && (
        <div className="tools-panel">
          <h3>Garden tools</h3>
          {status === 'registered' ? (
            <p className="tools-note">
              Live on <code>document.modelContext</code> — an agent in ChatGPT or Chrome with
              WebMCP can discover and call these right now.
            </p>
          ) : (
            <p className="tools-note">
              WebMCP isn't available in this browser, so these tools are dormant. Open this page in
              ChatGPT's in-app browser or Chrome 146+ with WebMCP enabled and an agent can co-tend
              the garden with you.
            </p>
          )}
          <ul>
            {gardenTools.map((tool) => (
              <li key={tool.name}>
                <code>{tool.name}</code>
                {tool.annotations?.readOnlyHint && <span className="tag">read-only</span>}
                <p>{tool.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function SeedTray() {
  const selectedSeed = useGardenStore((s) => s.selectedSeed);
  const selectSeed = useGardenStore((s) => s.selectSeed);

  return (
    <div className="seed-tray">
      {PLANT_TYPE_LIST.map((type) => (
        <button
          key={type.id}
          className={`seed-chip ${selectedSeed === type.id ? 'selected' : ''}`}
          onClick={() => selectSeed(type.id)}
          title={type.description}
        >
          <span className="seed-dot" style={{ background: type.color }} />
          <span className="seed-name">{type.name}</span>
          <span className="seed-time">{Math.round(type.growthMs / 1000)}s</span>
        </button>
      ))}
    </div>
  );
}

function PlantCard() {
  const selectedPlot = useGardenStore((s) => s.selectedPlot);
  const plant = useGardenStore((s) =>
    Object.values(s.plants).find((p) => p.plotIndex === s.selectedPlot),
  );
  const selectPlot = useGardenStore((s) => s.selectPlot);
  const waterPlant = useGardenStore((s) => s.waterPlant);
  const harvestPlant = useGardenStore((s) => s.harvestPlant);
  const removePlant = useGardenStore((s) => s.removePlant);

  if (selectedPlot === null || !plant) return null;
  const type = PLANT_TYPES[plant.type];
  const withered = plant.stage === 'withered';

  return (
    <div className="plant-card">
      <div className="plant-card-header">
        <span className="seed-dot" style={{ background: type.color }} />
        <strong>{type.name}</strong>
        <span className={`stage-tag ${plant.readyToHarvest ? 'ready' : ''}`}>
          {plant.readyToHarvest ? 'ready to harvest' : plant.stage}
        </span>
        <button className="close-btn" onClick={() => selectPlot(null)} aria-label="Close">
          ×
        </button>
      </div>
      {!withered && (
        <>
          <Bar label="Health" value={plant.health} color="#9fe870" />
          <Bar label="Water" value={plant.water} color="#6cb8ff" />
          <Bar label="Growth" value={plant.growth * 100} color="#ffd66e" />
        </>
      )}
      {withered && <p className="withered-note">This plant has withered. Clear it to reuse the plot.</p>}
      <div className="plant-card-actions">
        {!withered && (
          <button className="btn" onClick={() => waterPlant(plant.id, 'you')}>
            Water
          </button>
        )}
        {plant.readyToHarvest && (
          <button className="btn primary" onClick={() => harvestPlant(plant.id, 'you')}>
            Harvest
          </button>
        )}
        {withered && (
          <button className="btn" onClick={() => removePlant(plant.id, 'you')}>
            Clear
          </button>
        )}
      </div>
      <p className="plant-id">id: {plant.id} · plot {plant.plotIndex}</p>
    </div>
  );
}

function Basket() {
  const basket = useGardenStore((s) => s.basket);
  const entries = PLANT_TYPE_LIST.filter((t) => (basket[t.id] ?? 0) > 0);
  if (entries.length === 0) return null;

  return (
    <div className="basket">
      <span className="basket-title">Basket</span>
      {entries.map((t) => (
        <span key={t.id} className="basket-chip">
          <span className="seed-dot" style={{ background: t.color }} />
          {basket[t.id]}
        </span>
      ))}
    </div>
  );
}

function ActivityFeed() {
  const activity = useGardenStore((s) => s.activity);
  if (activity.length === 0) return null;

  return (
    <div className="activity-feed">
      <span className="activity-title">Garden log</span>
      {activity.slice(0, 8).map((entry) => (
        <div key={entry.id} className="activity-entry">
          <span className={`actor-tag ${entry.actor}`}>{entry.actor}</span>
          <span className="activity-message">{entry.message}</span>
          <span className="activity-time">{formatTime(entry.at)}</span>
        </div>
      ))}
    </div>
  );
}

export function GardenUI() {
  return (
    <div className="overlay">
      <div className="hud-top-left">
        <h1 className="title">verdant</h1>
        <p className="subtitle">a garden you keep together</p>
        <div className="hud-badges">
          <WebMCPBadge />
          <AmbientAudio />
        </div>
      </div>
      <div className="hud-top-right">
        <Basket />
        <ActivityFeed />
      </div>
      <PlantCard />
      <SeedTray />
    </div>
  );
}

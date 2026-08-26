import { useState } from 'react';
import { startGardenPlan } from '../game/agentJobs';
import { PLANT_TYPES, PLANT_TYPE_LIST } from '../game/plants';
import { useAgentStore } from '../state/agentStore';
import { DEMO_TIME_SCALE, useGardenStore } from '../state/gardenStore';
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
  const demoMode = useGardenStore((s) => s.demoMode);

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
          <span className="seed-time">
            {Math.round(type.growthMs / 1000 / (demoMode ? DEMO_TIME_SCALE : 1))}s
          </span>
        </button>
      ))}
    </div>
  );
}

function DemoControls() {
  const demoMode = useGardenStore((state) => state.demoMode);
  const plantCount = useGardenStore((state) => Object.keys(state.plants).length);
  const setDemoMode = useGardenStore((state) => state.setDemoMode);
  const loadDemoGarden = useGardenStore((state) => state.loadDemoGarden);
  const resetGarden = useGardenStore((state) => state.resetGarden);
  const activeJobId = useAgentStore((state) => state.activeJobId);
  const clearPlanPreview = useAgentStore((state) => state.clearPlanPreview);
  const robotBusy = activeJobId !== null;

  return (
    <div className="demo-controls">
      <button
        className={`demo-toggle ${demoMode ? 'on' : ''}`}
        onClick={() => setDemoMode(!demoMode)}
        title="Accelerate plant growth and care for a short judge demo"
        disabled={robotBusy}
      >
        {demoMode ? `demo ${DEMO_TIME_SCALE}×` : 'demo off'}
      </button>
      {plantCount === 0 && (
        <button
          className="demo-toggle showcase"
          disabled={robotBusy}
          onClick={() => {
            clearPlanPreview();
            loadDemoGarden();
          }}
        >
          load showcase
        </button>
      )}
      {demoMode && (
        <button
          className="demo-toggle reset"
          disabled={robotBusy}
          onClick={() => {
            if (window.confirm('Reset every plot and clear the harvest basket?')) {
              clearPlanPreview();
              resetGarden();
            }
          }}
        >
          reset
        </button>
      )}
    </div>
  );
}

function PlanPreviewPanel() {
  const plan = useAgentStore((state) => state.planPreview);
  const clearPlanPreview = useAgentStore((state) => state.clearPlanPreview);
  if (!plan) return null;

  return (
    <div className="plan-preview-panel">
      <div className="panel-eyebrow">Agent proposal</div>
      <div className="plan-preview-header">
        <strong>{plan.name}</strong>
        <span>{plan.assignments.length} plots</span>
      </div>
      <p>{plan.rationale}</p>
      <div className="plan-assignment-list">
        {plan.assignments.map((assignment) => {
          const type = PLANT_TYPES[assignment.plantType];
          return (
            <span key={assignment.plotIndex} className="plan-assignment-chip">
              <span className="seed-dot" style={{ background: type.color }} />
              {assignment.plotIndex} · {type.name}
            </span>
          );
        })}
      </div>
      <div className="plan-preview-actions">
        <button className="btn" onClick={() => clearPlanPreview(plan.id)}>
          Dismiss
        </button>
        <button className="btn primary" onClick={() => startGardenPlan(plan.id)}>
          Approve & plant
        </button>
      </div>
    </div>
  );
}

function AgentJobPanel() {
  const activeJobId = useAgentStore((state) => state.activeJobId);
  const latestJobId = useAgentStore((state) => state.jobOrder[0] ?? null);
  const job = useAgentStore((state) => {
    const id = state.activeJobId ?? state.jobOrder[0];
    return id ? state.jobs[id] ?? null : null;
  });
  const dismissJob = useAgentStore((state) => state.dismissJob);
  if (!job) return null;

  const progress = job.totalActions === 0
    ? 100
    : Math.round((job.completedActions / job.totalActions) * 100);
  const visibleJobId = activeJobId ?? latestJobId;

  return (
    <div className={`agent-job-panel ${job.status}`}>
      <div className="agent-job-heading">
        <span className="agent-pulse" />
        <strong>{job.label}</strong>
        {job.status !== 'running' && job.status !== 'queued' && visibleJobId && (
          <button className="close-btn" onClick={() => dismissJob(visibleJobId)} aria-label="Dismiss job">
            ×
          </button>
        )}
      </div>
      <div className="agent-job-meta">
        <span>{job.status}</span>
        <span>{job.completedActions} / {job.totalActions}</span>
      </div>
      <div className="agent-progress-track">
        <div className="agent-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      {job.currentAction && <p>{job.currentAction}</p>}
      {job.error && <p className="agent-job-error">{job.error}</p>}
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
          <DemoControls />
        </div>
      </div>
      <div className="hud-top-right">
        <Basket />
        <ActivityFeed />
      </div>
      <PlantCard />
      <PlanPreviewPanel />
      <AgentJobPanel />
      <SeedTray />
    </div>
  );
}

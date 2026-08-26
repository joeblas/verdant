import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { useGardenStore } from './state/gardenStore';
import { registerWebMCPTools } from './webmcp/register';

// Catch up on wall-clock growth after a reload, then keep the simulation
// moving while the tab is open.
useGardenStore.getState().tickAll();
setInterval(() => useGardenStore.getState().tickAll(), 3000);

void registerWebMCPTools();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

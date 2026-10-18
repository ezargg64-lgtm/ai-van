import { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Experience } from './scene/Experience';
import { api } from './net/api';
import { initSocket } from './net/socket';
import { useHud } from './state/hudStore';
import { useVan } from './sim/vanStore';
import { setCycleMinutes } from './sim/timeOfDay';
import { TopBar } from './hud/TopBar';
import { TaskBar } from './hud/TaskBar';
import { ResultsPanel } from './hud/ResultsPanel';
import { ChatPanel } from './hud/ChatPanel';
import { SettingsPanel } from './hud/SettingsPanel';
import { Toasts } from './hud/Toasts';

export default function App() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [agentsRes, settingsRes] = await Promise.all([api.getAgents(), api.getSettings()]);
        if (cancelled) return;
        useHud.getState().setAgents(agentsRes.agents);
        useVan.getState().setRoster(agentsRes.agents);
        useHud.getState().setSettings(settingsRes.settings);
        setCycleMinutes(settingsRes.settings.dayCycleMinutes);
        if (settingsRes.settings.demoMode) {
          useHud
            .getState()
            .toast('info', 'Demo mode: set a Gemini key in Settings → Global for real agent brains.');
        }
      } catch (err) {
        useHud.getState().toast('error', `Could not reach the API: ${(err as Error).message}`);
      }
    })();
    initSocket();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="app">
      <div className="canvas-wrap">
        <Canvas
          flat
          shadows
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          camera={{ position: [3.2, 6.6, 5.4], fov: 42, near: 0.1, far: 400 }}
        >
          <Experience />
        </Canvas>
      </div>

      <TopBar />
      <TaskBar />
      <ResultsPanel />
      <ChatPanel />
      <SettingsPanel />
      <Toasts />

      <div className="hint">drag to orbit · scroll to zoom</div>
    </div>
  );
}

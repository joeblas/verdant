import { useEffect, useRef, useState } from 'react';

/**
 * Synthesized garden ambience — soft wind (looped brown noise through a
 * lowpass) plus occasional bird chirps. No audio assets; everything is
 * generated with WebAudio. Off by default; browsers require a user gesture.
 */
export function AmbientAudio() {
  const [enabled, setEnabled] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    const len = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 420;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.05;
    noise.connect(lowpass);
    lowpass.connect(windGain);
    windGain.connect(master);
    noise.start();

    let timer: number;
    const chirp = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = ctx.currentTime;
      const f0 = 2200 + Math.random() * 1400;
      osc.frequency.setValueAtTime(f0, t0);
      osc.frequency.exponentialRampToValueAtTime(f0 * (1.2 + Math.random() * 0.5), t0 + 0.08);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.9, t0 + 0.16);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.035, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.25);
      timer = window.setTimeout(chirp, 2500 + Math.random() * 7000);
    };
    chirp();

    const cleanup = () => {
      window.clearTimeout(timer);
      try {
        noise.stop();
      } catch {
        // already stopped
      }
      void ctx.close();
    };
    cleanupRef.current = cleanup;
    return () => {
      cleanup();
      cleanupRef.current = null;
    };
  }, [enabled]);

  return (
    <button
      className={`sound-toggle ${enabled ? 'on' : ''}`}
      onClick={() => setEnabled((v) => !v)}
      title="Toggle synthesized wind and birdsong"
    >
      {enabled ? 'sound on' : 'sound off'}
    </button>
  );
}

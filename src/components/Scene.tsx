import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { PLOT_COUNT } from '../state/gardenStore';
import { Plot } from './Plot';

export function plotPosition(index: number): [number, number, number] {
  const row = Math.floor(index / 4);
  const col = index % 4;
  return [(col - 1.5) * 2.2, 0, (row - 1.5) * 2.2];
}

const CYCLE_MS = 360_000; // one full day every 6 minutes
const START_AT = 0.34; // begin mid-morning

const SKY_STOPS: Array<[number, string]> = [
  [0.0, '#0d1330'],
  [0.2, '#0d1330'],
  [0.28, '#e8a58b'],
  [0.38, '#bfe3f0'],
  [0.62, '#bfe3f0'],
  [0.72, '#f0a878'],
  [0.8, '#0d1330'],
  [1.0, '#0d1330'],
];

function skyColorAt(t: number, out: THREE.Color): THREE.Color {
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    const [t0, c0] = SKY_STOPS[i];
    const [t1, c1] = SKY_STOPS[i + 1];
    if (t >= t0 && t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return out.set(c0).lerp(new THREE.Color(c1), k);
    }
  }
  return out.set(SKY_STOPS[0][1]);
}

function DayNight() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sky = useMemo(() => new THREE.Color(), []);
  const warm = useMemo(() => new THREE.Color('#ffb37a'), []);
  const noon = useMemo(() => new THREE.Color('#fff4e0'), []);
  const fog = useMemo(() => new THREE.Fog('#bfe3f0', 34, 95), []);

  useFrame(({ scene, clock }) => {
    const t = (((clock.elapsedTime * 1000) / CYCLE_MS + START_AT) % 1 + 1) % 1;
    const phase = (t - 0.25) * Math.PI * 2;
    const elevation = Math.sin(phase);

    skyColorAt(t, sky);
    scene.background = sky;
    scene.fog = fog;
    fog.color.copy(sky);

    if (sun.current) {
      const height = Math.max(elevation, 0.04);
      sun.current.position.set(Math.cos(phase) * 22, height * 20 + 2, 9);
      sun.current.intensity = THREE.MathUtils.clamp(elevation * 1.3, 0.05, 1.15);
      const lowSun = THREE.MathUtils.clamp(1 - elevation * 2.2, 0, 1);
      sun.current.color.copy(noon).lerp(warm, lowSun);
    }
    if (hemi.current) {
      hemi.current.intensity = 0.22 + Math.max(elevation, 0) * 0.55;
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#cfe8ff', '#5a7a4a', 0.6]} />
      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-far={60}
      />
    </>
  );
}

const FIREFLY_COUNT = 22;

function Fireflies() {
  const group = useRef<THREE.Group>(null);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#ffe9a3', transparent: true, opacity: 0 }),
    [],
  );
  const seeds = useMemo(
    () =>
      Array.from({ length: FIREFLY_COUNT }, (_, i) => ({
        x: Math.sin(i * 12.9898) * 7.5,
        z: Math.cos(i * 78.233) * 7.5,
        y: 0.6 + ((i * 0.37) % 1) * 1.8,
        phase: i * 1.7,
      })),
    [],
  );

  useFrame(({ clock }) => {
    const t = (((clock.elapsedTime * 1000) / CYCLE_MS + START_AT) % 1 + 1) % 1;
    const elevation = Math.sin((t - 0.25) * Math.PI * 2);
    const night = THREE.MathUtils.clamp(-elevation * 2.5, 0, 1);
    material.opacity = night * 0.9;
    if (group.current) {
      group.current.visible = night > 0.02;
      group.current.children.forEach((child, i) => {
        const s = seeds[i];
        child.position.set(
          s.x + Math.sin(clock.elapsedTime * 0.6 + s.phase) * 0.6,
          s.y + Math.sin(clock.elapsedTime * 0.9 + s.phase * 2) * 0.35,
          s.z + Math.cos(clock.elapsedTime * 0.5 + s.phase) * 0.6,
        );
      });
    }
  });

  return (
    <group ref={group}>
      {seeds.map((s, i) => (
        <mesh key={i} position={[s.x, s.y, s.z]} material={material}>
          <sphereGeometry args={[0.045, 6, 6]} />
        </mesh>
      ))}
    </group>
  );
}

function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.16, 0.24, 1.8, 7]} />
        <meshStandardMaterial color="#6d4a2f" flatShading />
      </mesh>
      <mesh castShadow position={[0, 2.2, 0]}>
        <icosahedronGeometry args={[1.05, 0]} />
        <meshStandardMaterial color="#4e8f3e" flatShading />
      </mesh>
      <mesh castShadow position={[0.55, 1.7, 0.3]}>
        <icosahedronGeometry args={[0.65, 0]} />
        <meshStandardMaterial color="#5da04a" flatShading />
      </mesh>
    </group>
  );
}

function Rock({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <mesh castShadow position={position} scale={[scale, scale * 0.6, scale]}>
      <icosahedronGeometry args={[0.4, 0]} />
      <meshStandardMaterial color="#9aa0a6" flatShading />
    </mesh>
  );
}

function Bush({ position }: { position: [number, number, number] }) {
  return (
    <mesh castShadow position={position}>
      <icosahedronGeometry args={[0.5, 0]} />
      <meshStandardMaterial color="#5da04a" flatShading />
    </mesh>
  );
}

function GardenBorder() {
  const half = 1.5 * 2.2 + 1.15;
  const rails: Array<{ pos: [number, number, number]; rot: number }> = [
    { pos: [0, 0.12, -half], rot: 0 },
    { pos: [0, 0.12, half], rot: 0 },
    { pos: [-half, 0.12, 0], rot: Math.PI / 2 },
    { pos: [half, 0.12, 0], rot: Math.PI / 2 },
  ];
  return (
    <group>
      {rails.map((r, i) => (
        <mesh key={i} castShadow position={r.pos} rotation={[0, r.rot, 0]}>
          <boxGeometry args={[half * 2 + 0.3, 0.24, 0.22]} />
          <meshStandardMaterial color="#8a6a45" flatShading />
        </mesh>
      ))}
    </group>
  );
}

export function Scene() {
  const plots = useMemo(() => Array.from({ length: PLOT_COUNT }, (_, i) => i), []);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [10.5, 11, 10.5], fov: 40 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <DayNight />
      <Fireflies />

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[42, 48]} />
        <meshStandardMaterial color="#79b473" />
      </mesh>

      <GardenBorder />
      {plots.map((i) => (
        <Plot key={i} index={i} />
      ))}

      <Tree position={[-8.5, 0, -6.5]} scale={1.25} />
      <Tree position={[8.8, 0, -5.4]} scale={0.95} />
      <Tree position={[7.6, 0, 7.8]} scale={1.4} />
      <Tree position={[-7.8, 0, 7.2]} scale={0.85} />
      <Rock position={[-5.6, 0.15, -8.2]} />
      <Rock position={[6.2, 0.12, 8.9]} scale={0.7} />
      <Bush position={[-9.4, 0.35, 2.4]} />
      <Bush position={[9.6, 0.35, -1.2]} />
      <Bush position={[2.8, 0.35, -9.6]} />

      <OrbitControls
        makeDefault
        target={[0, 0.4, 0]}
        maxPolarAngle={Math.PI / 2.3}
        minDistance={7}
        maxDistance={26}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
      />
    </Canvas>
  );
}

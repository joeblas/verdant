import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { PLOT_COUNT } from '../state/gardenStore';
import { Crew } from './Crew';
import { Plot } from './Plot';

function Daylight() {
  return (
    <>
      <color attach="background" args={['#bfe3f0']} />
      <fog attach="fog" args={['#bfe3f0', 34, 95]} />
      <hemisphereLight args={['#cfe8ff', '#5a7a4a', 0.78]} />
      <directionalLight
        position={[12, 18, 9]}
        color="#fff4e0"
        intensity={1.15}
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

export function Scene() {
  const plots = useMemo(() => Array.from({ length: PLOT_COUNT }, (_, i) => i), []);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [14.5, 15.5, 14.5], fov: 40 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Daylight />

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[42, 48]} />
        <meshStandardMaterial color="#79b473" />
      </mesh>

      <Crew />
      {plots.map((i) => (
        <Plot key={i} index={i} />
      ))}

      <Tree position={[-10.5, 0, -8.5]} scale={1.25} />
      <Tree position={[11, 0, -7]} scale={0.95} />
      <Tree position={[10.8, 0, 10.8]} scale={1.4} />
      <Tree position={[-10, 0, 9.5]} scale={0.85} />
      <Rock position={[-7.2, 0.15, -10]} />
      <Rock position={[8, 0.12, 10.8]} scale={0.7} />
      <Bush position={[-11.4, 0.35, 2.4]} />
      <Bush position={[11.6, 0.35, -1.2]} />
      <Bush position={[2.8, 0.35, -11.6]} />

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

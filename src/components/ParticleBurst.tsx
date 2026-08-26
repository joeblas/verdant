import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GardenEvent } from '../game/types';

const COUNT = 12;
const DURATION = 0.9;

const COLORS: Record<GardenEvent['kind'], string> = {
  inspect: '#8ce6ff',
  plant: '#9fe870',
  water: '#6cb8ff',
  harvest: '#ffd66e',
  remove: '#d5dde5',
};

export function ParticleBurst({ kind }: { kind: GardenEvent['kind'] }) {
  const [done, setDone] = useState(false);
  const progress = useRef(0);
  const group = useRef<THREE.Group>(null);

  const seeds = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => {
        const angle = (i / COUNT) * Math.PI * 2 + Math.random() * 0.5;
        return {
          x: Math.cos(angle),
          z: Math.sin(angle),
          jitter: Math.random() * 0.4,
        };
      }),
    [],
  );

  useFrame((_, delta) => {
    progress.current += delta / DURATION;
    const t = Math.min(progress.current, 1);
    if (progress.current >= 1 && !done) setDone(true);
    if (!group.current) return;

    group.current.children.forEach((child, i) => {
      const s = seeds[i];
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = 1 - t;
      if (kind === 'water') {
        child.position.set(s.x * 0.45 * (1 + s.jitter), 2.3 - t * 2.0, s.z * 0.45 * (1 + s.jitter));
      } else if (kind === 'harvest' || kind === 'remove') {
        child.position.set(s.x * t * 1.1, 0.3 + t * 1.5, s.z * t * 1.1);
      } else {
        child.position.set(s.x * t * 0.7, 0.25 + t * 0.5, s.z * t * 0.7);
      }
    });
  });

  if (done) return null;

  return (
    <group ref={group}>
      {seeds.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[kind === 'water' ? 0.05 : 0.06, 6, 6]} />
          <meshBasicMaterial color={COLORS[kind]} transparent depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

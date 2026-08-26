import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PLANT_TYPES, type PlantType } from '../game/plants';
import type { Plant } from '../game/types';

const STAGE_SCALE: Record<Plant['stage'], number> = {
  seed: 0.3,
  sprout: 0.55,
  growing: 0.8,
  mature: 1,
  withered: 0.9,
};

const STEM = '#3f7a34';

function SeedMound() {
  return (
    <mesh castShadow position={[0, 0.06, 0]} scale={[1, 0.45, 1]}>
      <sphereGeometry args={[0.22, 8, 6]} />
      <meshStandardMaterial color="#5a3d24" flatShading />
    </mesh>
  );
}

function Sprout({ color }: { color: string }) {
  return (
    <group>
      <mesh castShadow position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.32, 6]} />
        <meshStandardMaterial color={STEM} flatShading />
      </mesh>
      <mesh castShadow position={[0.1, 0.3, 0]} rotation={[0, 0, -0.7]} scale={[1, 0.35, 0.6]}>
        <icosahedronGeometry args={[0.12, 0]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh castShadow position={[-0.1, 0.26, 0.04]} rotation={[0.3, 0, 0.7]} scale={[1, 0.35, 0.6]}>
        <icosahedronGeometry args={[0.11, 0]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
    </group>
  );
}

/** Mature (or nearly mature) foliage per plant type. `fruit` toggles the
 * harvest-colored parts so "growing" plants read as not-quite-ready. */
function Foliage({ type, fruit }: { type: PlantType; fruit: boolean }) {
  const leaf = type.foliageColor;
  switch (type.id) {
    case 'carrot':
      return (
        <group>
          {[0, 1, 2].map((i) => (
            <mesh
              key={i}
              castShadow
              position={[Math.sin(i * 2.1) * 0.08, 0.42, Math.cos(i * 2.1) * 0.08]}
              rotation={[Math.cos(i * 2.1) * 0.35, 0, Math.sin(i * 2.1) * -0.35]}
            >
              <coneGeometry args={[0.09, 0.55, 6]} />
              <meshStandardMaterial color={leaf} flatShading />
            </mesh>
          ))}
          {fruit && (
            <mesh castShadow position={[0, 0.16, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.13, 0.34, 8]} />
              <meshStandardMaterial color={type.color} flatShading />
            </mesh>
          )}
        </group>
      );
    case 'tomato':
      return (
        <group>
          <mesh castShadow position={[0, 0.55, 0]}>
            <icosahedronGeometry args={[0.46, 0]} />
            <meshStandardMaterial color={leaf} flatShading />
          </mesh>
          {fruit &&
            [
              [0.3, 0.45, 0.25],
              [-0.32, 0.6, 0.12],
              [0.05, 0.42, -0.34],
              [-0.1, 0.78, -0.2],
            ].map(([px, py, pz], i) => (
              <mesh key={i} castShadow position={[px, py, pz]}>
                <sphereGeometry args={[0.1, 8, 6]} />
                <meshStandardMaterial color={type.color} flatShading />
              </mesh>
            ))}
        </group>
      );
    case 'lettuce':
      return (
        <group>
          <mesh castShadow position={[0, 0.28, 0]}>
            <icosahedronGeometry args={[0.34, 0]} />
            <meshStandardMaterial color={leaf} flatShading />
          </mesh>
          <mesh castShadow position={[0, 0.46, 0]}>
            <icosahedronGeometry args={[0.24, 0]} />
            <meshStandardMaterial color={fruit ? type.color : leaf} flatShading />
          </mesh>
        </group>
      );
    case 'pumpkin':
      return (
        <group>
          <mesh castShadow position={[0.25, 0.3, 0.2]} scale={[1, 0.4, 1]}>
            <icosahedronGeometry args={[0.3, 0]} />
            <meshStandardMaterial color={leaf} flatShading />
          </mesh>
          {fruit ? (
            <>
              <mesh castShadow position={[0, 0.32, 0]} scale={[1, 0.78, 1]}>
                <sphereGeometry args={[0.42, 10, 8]} />
                <meshStandardMaterial color={type.color} flatShading />
              </mesh>
              <mesh castShadow position={[0, 0.68, 0]}>
                <cylinderGeometry args={[0.04, 0.06, 0.16, 6]} />
                <meshStandardMaterial color={STEM} flatShading />
              </mesh>
            </>
          ) : (
            <mesh castShadow position={[0, 0.3, 0]} scale={[1, 0.5, 1]}>
              <icosahedronGeometry args={[0.32, 0]} />
              <meshStandardMaterial color={leaf} flatShading />
            </mesh>
          )}
        </group>
      );
    case 'sunflower':
      return (
        <group>
          <mesh castShadow position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.045, 0.06, 1.2, 6]} />
            <meshStandardMaterial color={STEM} flatShading />
          </mesh>
          <mesh castShadow position={[0.14, 0.5, 0]} rotation={[0, 0, -0.8]} scale={[1, 0.3, 0.55]}>
            <icosahedronGeometry args={[0.14, 0]} />
            <meshStandardMaterial color={leaf} flatShading />
          </mesh>
          {fruit ? (
            <group position={[0, 1.28, 0]} rotation={[Math.PI / 2.6, 0, 0]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.3, 0.3, 0.07, 12]} />
                <meshStandardMaterial color={type.color} flatShading />
              </mesh>
              <mesh castShadow position={[0, 0.05, 0]}>
                <cylinderGeometry args={[0.14, 0.14, 0.06, 10]} />
                <meshStandardMaterial color="#6b4a2f" flatShading />
              </mesh>
            </group>
          ) : (
            <mesh castShadow position={[0, 1.2, 0]}>
              <icosahedronGeometry args={[0.16, 0]} />
              <meshStandardMaterial color={leaf} flatShading />
            </mesh>
          )}
        </group>
      );
    case 'lavender':
      return (
        <group>
          {[-0.14, 0, 0.14].map((px, i) => (
            <group key={i} position={[px, 0, (i % 2) * 0.1 - 0.05]}>
              <mesh castShadow position={[0, 0.35, 0]}>
                <cylinderGeometry args={[0.02, 0.03, 0.7, 5]} />
                <meshStandardMaterial color={STEM} flatShading />
              </mesh>
              <mesh castShadow position={[0, fruit ? 0.82 : 0.72, 0]}>
                <coneGeometry args={[0.07, fruit ? 0.34 : 0.2, 6]} />
                <meshStandardMaterial color={fruit ? type.color : leaf} flatShading />
              </mesh>
            </group>
          ))}
        </group>
      );
  }
}

function Withered() {
  return (
    <group>
      <SeedMound />
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          castShadow
          position={[Math.sin(i * 2.1) * 0.12, 0.22, Math.cos(i * 2.1) * 0.12]}
          rotation={[Math.cos(i * 2.1) * 0.9, 0, Math.sin(i * 2.1) * 1.1]}
        >
          <coneGeometry args={[0.07, 0.5, 5]} />
          <meshStandardMaterial color="#8a6d4a" flatShading />
        </mesh>
      ))}
    </group>
  );
}

function ReadySparkle() {
  const sparkle = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (sparkle.current) {
      sparkle.current.position.y = 1.7 + Math.sin(t * 2.2) * 0.12;
      sparkle.current.rotation.y = t * 1.8;
    }
    if (ring.current) {
      const pulse = (Math.sin(t * 2.6) + 1) / 2;
      ring.current.scale.setScalar(1 + pulse * 0.18);
      const mat = ring.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.75 - pulse * 0.45;
    }
  });

  return (
    <group>
      <mesh ref={sparkle} position={[0, 1.7, 0]}>
        <octahedronGeometry args={[0.09, 0]} />
        <meshBasicMaterial color="#ffd66e" />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[0.5, 0.58, 24]} />
        <meshBasicMaterial color="#ffd66e" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function PlantMesh({ plant }: { plant: Plant }) {
  const type = PLANT_TYPES[plant.type];
  const group = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(), []);
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    const s = STAGE_SCALE[plant.stage];
    target.set(s, s, s);
    group.current.scale.lerp(target, 1 - Math.exp(-4 * delta));
    if (plant.stage !== 'withered') {
      group.current.rotation.z = Math.sin(clock.elapsedTime * 1.3 + phase) * 0.03;
    }
  });

  return (
    <group position={[0, 0.33, 0]}>
      <group ref={group}>
        {plant.stage === 'seed' && <SeedMound />}
        {plant.stage === 'sprout' && <Sprout color={type.foliageColor} />}
        {(plant.stage === 'growing' || plant.stage === 'mature') && (
          <Foliage type={type} fruit={plant.stage === 'mature'} />
        )}
        {plant.stage === 'withered' && <Withered />}
        {plant.readyToHarvest && <ReadySparkle />}
      </group>
    </group>
  );
}

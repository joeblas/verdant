import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { useCursor } from '@react-three/drei';
import { plotPosition } from '../game/layout';
import { useGardenStore } from '../state/gardenStore';
import { PlantMesh } from './PlantMesh';
import { ParticleBurst } from './ParticleBurst';

const DRY_SOIL = new THREE.Color('#7a5233');
const WET_SOIL = new THREE.Color('#4a3120');

export function Plot({ index }: { index: number }) {
  const [x, , z] = plotPosition(index);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  const plant = useGardenStore((s) => {
    for (const p of Object.values(s.plants)) {
      if (p.plotIndex === index) return p;
    }
    return undefined;
  });
  const selected = useGardenStore((s) => s.selectedPlot === index);
  const lastEvents = useGardenStore((s) => s.lastEvents);
  const selectedSeed = useGardenStore((s) => s.selectedSeed);
  const plantSeed = useGardenStore((s) => s.plantSeed);
  const selectPlot = useGardenStore((s) => s.selectPlot);

  const soilColor = useMemo(() => {
    const moisture = plant ? plant.water / 100 : 0.15;
    return DRY_SOIL.clone().lerp(WET_SOIL, moisture);
  }, [plant]);

  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (plant) {
      selectPlot(index);
    } else {
      plantSeed(selectedSeed, index, 'you');
    }
  };

  const freshEvent =
    lastEvents.find(
      (e) => e.phase === 'effect' && e.plotIndex === index && Date.now() - e.at < 1200,
    ) ?? null;

  return (
    <group position={[x, 0, z]}>
      <mesh
        receiveShadow
        position={[0, 0.15, 0]}
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[1.9, 0.3, 1.9]} />
        <meshStandardMaterial color={soilColor} flatShading />
      </mesh>
      <mesh receiveShadow position={[0, 0.31, 0]}>
        <boxGeometry args={[1.66, 0.05, 1.66]} />
        <meshStandardMaterial
          color={soilColor.clone().multiplyScalar(0.82)}
          flatShading
        />
      </mesh>

      {(hovered || selected) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.35, 0]}>
          <ringGeometry args={[0.72, 0.88, 24]} />
          <meshBasicMaterial
            color={selected ? '#ffd66e' : '#ffffff'}
            transparent
            opacity={selected ? 0.95 : 0.55}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {plant && <PlantMesh plant={plant} />}
      {freshEvent && <ParticleBurst key={freshEvent.id} kind={freshEvent.kind} />}
    </group>
  );
}

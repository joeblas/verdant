import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BOT_ACTION_MS, BOT_TRAVEL_MS } from '../game/agentChoreography';
import { plotPosition } from '../game/layout';
import type { GardenEvent } from '../game/types';
import { useGardenStore } from '../state/gardenStore';

const HOME = new THREE.Vector3(-5.05, 0.08, -3.7);
const TRAVEL_SECONDS = BOT_TRAVEL_MS / 1000;
const ACTION_SECONDS = BOT_ACTION_MS / 1000;

const ACTION_COLORS: Record<GardenEvent['kind'], string> = {
  inspect: '#8ce6ff',
  plant: '#9fe870',
  water: '#6cb8ff',
  harvest: '#ffd66e',
  remove: '#d5dde5',
};

interface BotJob {
  event: GardenEvent;
  from: THREE.Vector3;
  target: THREE.Vector3;
  startedAt: number;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function Tool({ kind }: { kind: GardenEvent['kind'] | null }) {
  if (!kind || kind === 'inspect') return null;

  if (kind === 'water') {
    return (
      <group position={[0.58, 0.72, 0.3]} rotation={[0, 0, -0.25]}>
        <mesh castShadow>
          <boxGeometry args={[0.3, 0.24, 0.28]} />
          <meshStandardMaterial color="#6cb8ff" flatShading />
        </mesh>
        <mesh castShadow position={[0.24, 0.04, 0]} rotation={[0, 0, -0.7]}>
          <cylinderGeometry args={[0.055, 0.08, 0.38, 6]} />
          <meshStandardMaterial color="#a7d8ff" flatShading />
        </mesh>
      </group>
    );
  }

  if (kind === 'plant') {
    return (
      <group position={[0.58, 0.7, 0.3]}>
        <mesh castShadow rotation={[0.15, 0, 0.2]}>
          <dodecahedronGeometry args={[0.22, 0]} />
          <meshStandardMaterial color="#9fe870" flatShading />
        </mesh>
        <mesh position={[0, 0.17, 0]} rotation={[0, 0, -0.35]}>
          <coneGeometry args={[0.09, 0.24, 5]} />
          <meshStandardMaterial color="#4e8f3e" flatShading />
        </mesh>
      </group>
    );
  }

  if (kind === 'harvest') {
    return (
      <group position={[0.58, 0.66, 0.3]}>
        <mesh castShadow>
          <boxGeometry args={[0.38, 0.23, 0.3]} />
          <meshStandardMaterial color="#d49a4a" flatShading />
        </mesh>
        <mesh position={[0, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.2, 0.035, 6, 10, Math.PI]} />
          <meshStandardMaterial color="#ffd66e" flatShading />
        </mesh>
      </group>
    );
  }

  return (
    <group position={[0.6, 0.72, 0.3]} rotation={[0, 0, -0.5]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.035, 0.035, 0.62, 6]} />
        <meshStandardMaterial color="#8a6a45" flatShading />
      </mesh>
      <mesh castShadow position={[0, -0.34, 0]}>
        <boxGeometry args={[0.24, 0.16, 0.08]} />
        <meshStandardMaterial color="#d5dde5" metalness={0.5} roughness={0.45} />
      </mesh>
    </group>
  );
}

export function GardenBot() {
  const events = useGardenStore((state) => state.lastEvents);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const statusLight = useRef<THREE.MeshStandardMaterial>(null);
  const queue = useRef<GardenEvent[]>([]);
  const active = useRef<BotJob | null>(null);
  const current = useRef(HOME.clone());
  const initialized = useRef(false);
  const lastSeenId = useRef(0);
  const [activeKind, setActiveKind] = useState<GardenEvent['kind'] | null>(null);
  const restingRotation = useMemo(() => Math.atan2(-HOME.x, -HOME.z), []);

  useEffect(() => {
    const newestId = events.reduce((max, event) => Math.max(max, event.id), 0);
    if (!initialized.current) {
      initialized.current = true;
      lastSeenId.current = newestId;
      return;
    }

    const additions = events
      .filter(
        (event) =>
          event.actor === 'agent' && event.phase === 'intent' && event.id > lastSeenId.current,
      )
      .sort((a, b) => a.id - b.id);
    queue.current.push(...additions);
    lastSeenId.current = newestId;
  }, [events]);

  useFrame(({ clock }) => {
    const robot = root.current;
    if (!robot) return;

    if (!active.current && queue.current.length > 0) {
      const event = queue.current.shift()!;
      const target = event.plotIndex === null
        ? HOME.clone()
        : (() => {
            const [x, , z] = plotPosition(event.plotIndex);
            const approachX = Math.sign(x) * 0.92;
            const approachZ = Math.sign(z) * 0.92;
            return new THREE.Vector3(x + approachX, 0.08, z + approachZ);
          })();
      active.current = {
        event,
        from: current.current.clone(),
        target,
        startedAt: clock.elapsedTime,
      };
      setActiveKind(event.kind);
    }

    const job = active.current;
    const idleBob = Math.sin(clock.elapsedTime * 2.4) * 0.035;
    if (!job) {
      robot.position.set(current.current.x, current.current.y + idleBob, current.current.z);
      robot.rotation.y = restingRotation + Math.sin(clock.elapsedTime * 0.6) * 0.12;
      if (head.current) head.current.rotation.y = Math.sin(clock.elapsedTime * 1.1) * 0.18;
      if (body.current) body.current.rotation.set(0, 0, 0);
      if (leftArm.current) leftArm.current.rotation.z = 0.12;
      if (rightArm.current) rightArm.current.rotation.z = -0.12;
      if (statusLight.current) statusLight.current.color.set('#8ce6ff');
      return;
    }

    const elapsed = clock.elapsedTime - job.startedAt;
    const directionX = job.target.x - job.from.x;
    const directionZ = job.target.z - job.from.z;
    if (Math.abs(directionX) + Math.abs(directionZ) > 0.01) {
      robot.rotation.y = Math.atan2(directionX, directionZ);
    }

    if (elapsed < TRAVEL_SECONDS) {
      const t = smoothstep(elapsed / TRAVEL_SECONDS);
      current.current.lerpVectors(job.from, job.target, t);
      robot.position.set(
        current.current.x,
        current.current.y + Math.sin(t * Math.PI) * 0.9,
        current.current.z,
      );
      if (body.current) body.current.rotation.z = Math.sin(t * Math.PI * 2) * 0.12;
      if (leftArm.current) leftArm.current.rotation.z = 0.5;
      if (rightArm.current) rightArm.current.rotation.z = -0.5;
    } else {
      const actionT = Math.min((elapsed - TRAVEL_SECONDS) / ACTION_SECONDS, 1);
      robot.position.set(job.target.x, job.target.y, job.target.z);
      if (statusLight.current) statusLight.current.color.set(ACTION_COLORS[job.event.kind]);

      if (job.event.kind === 'inspect') {
        robot.position.y += Math.sin(actionT * Math.PI) * 0.35;
        if (head.current) head.current.rotation.y = Math.sin(actionT * Math.PI * 4) * 0.65;
        robot.rotation.y += actionT * Math.PI * 2;
      } else if (job.event.kind === 'plant') {
        if (body.current) body.current.rotation.x = Math.sin(actionT * Math.PI) * 0.45;
        if (rightArm.current) rightArm.current.rotation.z = -0.35 - Math.sin(actionT * Math.PI) * 0.9;
      } else if (job.event.kind === 'water') {
        if (body.current) body.current.rotation.z = -Math.sin(actionT * Math.PI) * 0.28;
        if (rightArm.current) rightArm.current.rotation.z = -0.45 - Math.sin(actionT * Math.PI * 2) * 0.22;
      } else if (job.event.kind === 'harvest') {
        robot.rotation.y += actionT * Math.PI * 2;
        robot.position.y += Math.sin(actionT * Math.PI) * 0.42;
        if (leftArm.current) leftArm.current.rotation.z = 0.8;
        if (rightArm.current) rightArm.current.rotation.z = -0.8;
      } else {
        if (body.current) body.current.rotation.z = Math.sin(actionT * Math.PI * 4) * 0.16;
        if (rightArm.current) rightArm.current.rotation.z = -0.55 - Math.sin(actionT * Math.PI * 3) * 0.5;
      }
    }

    if (elapsed >= TRAVEL_SECONDS + ACTION_SECONDS) {
      current.current.copy(job.target);
      active.current = null;
      setActiveKind(null);
      if (body.current) body.current.rotation.set(0, 0, 0);
      if (head.current) head.current.rotation.set(0, 0, 0);
    }
  });

  return (
    <group ref={root} position={HOME.toArray()} scale={0.9}>
      <group ref={body}>
        <mesh castShadow position={[0, 0.76, 0]}>
          <dodecahedronGeometry args={[0.43, 0]} />
          <meshStandardMaterial color="#36545a" metalness={0.35} roughness={0.55} flatShading />
        </mesh>
        <mesh castShadow position={[0, 0.76, 0.34]}>
          <circleGeometry args={[0.16, 10]} />
          <meshStandardMaterial color="#263d42" metalness={0.5} roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.76, 0.352]}>
          <circleGeometry args={[0.065, 10]} />
          <meshStandardMaterial ref={statusLight} color="#8ce6ff" emissive="#315e69" emissiveIntensity={1.4} />
        </mesh>

        <group ref={head} position={[0, 1.32, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.72, 0.48, 0.56]} />
            <meshStandardMaterial color="#d9e2dc" metalness={0.25} roughness={0.48} flatShading />
          </mesh>
          <mesh position={[-0.18, 0.04, 0.29]}>
            <sphereGeometry args={[0.075, 8, 8]} />
            <meshStandardMaterial color="#8ce6ff" emissive="#4dc9e8" emissiveIntensity={2} />
          </mesh>
          <mesh position={[0.18, 0.04, 0.29]}>
            <sphereGeometry args={[0.075, 8, 8]} />
            <meshStandardMaterial color="#8ce6ff" emissive="#4dc9e8" emissiveIntensity={2} />
          </mesh>
          <mesh castShadow position={[0, 0.37, 0]}>
            <cylinderGeometry args={[0.025, 0.035, 0.28, 6]} />
            <meshStandardMaterial color="#647b7e" metalness={0.6} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.54, 0]}>
            <octahedronGeometry args={[0.09, 0]} />
            <meshStandardMaterial color={activeKind ? ACTION_COLORS[activeKind] : '#8ce6ff'} emissive={activeKind ? ACTION_COLORS[activeKind] : '#4dc9e8'} emissiveIntensity={1.5} />
          </mesh>
        </group>

        <group ref={leftArm} position={[-0.48, 0.84, 0]} rotation={[0, 0, 0.12]}>
          <mesh castShadow position={[0, -0.2, 0]}>
            <capsuleGeometry args={[0.09, 0.32, 4, 8]} />
            <meshStandardMaterial color="#647b7e" metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.48, 0.84, 0]} rotation={[0, 0, -0.12]}>
          <mesh castShadow position={[0, -0.2, 0]}>
            <capsuleGeometry args={[0.09, 0.32, 4, 8]} />
            <meshStandardMaterial color="#647b7e" metalness={0.4} roughness={0.5} />
          </mesh>
        </group>

        <mesh castShadow position={[-0.2, 0.24, 0]}>
          <capsuleGeometry args={[0.11, 0.28, 4, 8]} />
          <meshStandardMaterial color="#52696c" metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh castShadow position={[0.2, 0.24, 0]}>
          <capsuleGeometry args={[0.11, 0.28, 4, 8]} />
          <meshStandardMaterial color="#52696c" metalness={0.4} roughness={0.5} />
        </mesh>
        <Tool kind={activeKind} />
      </group>
    </group>
  );
}

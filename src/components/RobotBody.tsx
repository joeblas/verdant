import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { BOT_ACTION_MS, botTravelMs, signalBotArrival } from '../game/agentChoreography';
import { dockOffset, EMERGE_MS, MERGE_MS, publishAnchor, readAnchor } from '../game/crew/anchors';
import { dutyTask, type HelperDuty, type LeadDuty } from '../game/crew/duty';
import type { HelperId, RobotId } from '../game/crew/ids';
import { completeEmerge, completeGoingHome, completeMerge } from '../game/crew/roster';
import {
  botAisleRoute,
  botHomePosition,
  plotApproachPosition,
  plotPosition,
  type GardenPosition,
} from '../game/layout';
import type { GardenEvent } from '../game/types';
import { selectRobot, useCrewStore } from '../state/crewStore';

const HOME = new THREE.Vector3(...botHomePosition());
const ACTION_SECONDS = BOT_ACTION_MS / 1000;
/** How long the bubble lingers in its "done" state so observers can read it. */
const DONE_LINGER_MS = 1600;

const ACTION_COLORS: Record<GardenEvent['kind'], string> = {
  inspect: '#8ce6ff',
  plant: '#9fe870',
  water: '#6cb8ff',
  harvest: '#ffd66e',
  remove: '#d5dde5',
};

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function vectorPosition(point: THREE.Vector3): GardenPosition {
  return [point.x, point.y, point.z];
}

function pathDistance(path: THREE.Vector3[]): number {
  let distance = 0;
  for (let i = 1; i < path.length; i++) distance += path[i - 1].distanceTo(path[i]);
  return distance;
}

function placeAlongPath(
  path: THREE.Vector3[],
  distance: number,
  position: THREE.Vector3,
): { from: THREE.Vector3; to: THREE.Vector3 } {
  let remaining = distance;
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];
    const segmentLength = from.distanceTo(to);
    if (remaining <= segmentLength || i === path.length - 1) {
      position.lerpVectors(from, to, segmentLength === 0 ? 1 : remaining / segmentLength);
      return { from, to };
    }
    remaining -= segmentLength;
  }
  position.copy(path[path.length - 1]);
  return { from: path[path.length - 2], to: path[path.length - 1] };
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

interface WalkJob {
  path: THREE.Vector3[];
  target: THREE.Vector3;
  startedAt: number;
  distance: number;
  travelSeconds: number;
  arrivalSignaled: boolean;
  actionRotation: number;
  eventId: number | null;
  kind: GardenEvent['kind'];
}

function dutyKind(duty: LeadDuty | HelperDuty): GardenEvent['kind'] | null {
  const task = dutyTask(duty);
  if (task) return task.action.kind;
  if (duty.phase === 'goingHome') return 'inspect';
  return null;
}

function bubbleFor(duty: LeadDuty | HelperDuty): { phase: string; label: string } | null {
  if (duty.phase === 'travelling' && duty.task) {
    return { phase: 'walking', label: duty.task.label };
  }
  if (duty.phase === 'working' && duty.task) {
    return { phase: 'acting', label: duty.task.label };
  }
  if (duty.phase === 'emerging') return { phase: 'walking', label: 'Peeling off the lead' };
  if (duty.phase === 'merging') return { phase: 'walking', label: 'Merging back into the lead' };
  if (duty.phase === 'goingHome') return { phase: 'walking', label: 'Inspecting the garden' };
  return null;
}

function isHelperId(id: RobotId): id is HelperId {
  return id !== 'lead';
}

export function RobotBody({
  id,
  scale,
  accent,
}: {
  id: RobotId;
  scale: number;
  accent: string;
}) {
  const robot = useCrewStore(selectRobot(id));
  const duty = robot?.duty ?? (id === 'lead' ? { phase: 'tending' as const } : { phase: 'docked' as const });
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const statusLight = useRef<THREE.MeshStandardMaterial>(null);
  const aura = useRef<THREE.Group>(null);
  const auraRing = useRef<THREE.Mesh>(null);
  const auraRingMat = useRef<THREE.MeshBasicMaterial>(null);
  const auraBeamMat = useRef<THREE.MeshBasicMaterial>(null);
  const current = useRef(HOME.clone());
  const walk = useRef<WalkJob | null>(null);
  const transition = useRef<{ token: number; startedAt: number; from: THREE.Vector3 } | null>(null);
  const lastDutyKey = useRef('');
  const [activeKind, setActiveKind] = useState<GardenEvent['kind'] | null>(null);
  const restingRotation = useMemo(() => Math.atan2(-HOME.x, -HOME.z), []);
  const kind = dutyKind(duty);
  const bubble = bubbleFor(duty);
  const docked = duty.phase === 'docked';
  const visualScale = docked ? scale * 0.55 : scale;

  // Keep a "done" bubble on screen briefly after a task finishes, so observers
  // can read what the robot just did instead of the bubble vanishing instantly.
  const [linger, setLinger] = useState<{ label: string; kind: GardenEvent['kind'] } | null>(null);
  const lastWork = useRef<{ label: string; kind: GardenEvent['kind'] } | null>(null);
  const lingerTimer = useRef<number | null>(null);
  useEffect(() => {
    if (duty.phase === 'working' && duty.task) {
      lastWork.current = { label: duty.task.label, kind: duty.task.action.kind };
      if (lingerTimer.current !== null) window.clearTimeout(lingerTimer.current);
      setLinger(null);
    } else if (lastWork.current) {
      const finished = lastWork.current;
      lastWork.current = null;
      setLinger(finished);
      if (lingerTimer.current !== null) window.clearTimeout(lingerTimer.current);
      lingerTimer.current = window.setTimeout(() => setLinger(null), DONE_LINGER_MS);
    }
  }, [duty]);
  useEffect(() => () => {
    if (lingerTimer.current !== null) window.clearTimeout(lingerTimer.current);
  }, []);

  const shownBubble = bubble ?? (linger ? { phase: 'done', label: linger.label } : null);
  const bubbleKind = bubble ? kind ?? 'inspect' : linger?.kind ?? 'inspect';

  useFrame(({ clock }) => {
    const mesh = root.current;
    if (!mesh) return;
    if (aura.current) aura.current.visible = false;

    const now = clock.elapsedTime;
    const key = `${duty.phase}:${duty.phase === 'travelling' || duty.phase === 'working' ? duty.task.eventId : ''}:${
      duty.phase === 'emerging' || duty.phase === 'merging' ? duty.token : ''
    }`;

    if (key !== lastDutyKey.current) {
      lastDutyKey.current = key;
      const keepWalk =
        duty.phase === 'working' &&
        walk.current !== null &&
        duty.task.eventId === walk.current.eventId;
      if (!keepWalk) walk.current = null;
      if (duty.phase === 'emerging' || duty.phase === 'merging') {
        transition.current = { token: duty.token, startedAt: now, from: current.current.clone() };
      } else {
        transition.current = null;
      }
      if (duty.phase === 'travelling' || duty.phase === 'goingHome') {
        const task = dutyTask(duty);
        const target = duty.phase === 'goingHome' || !task
          ? HOME.clone()
          : new THREE.Vector3(...plotApproachPosition(task.action.plotIndex));
        const from = current.current.clone();
        const route = botAisleRoute(vectorPosition(from), vectorPosition(target));
        const path = [from, ...route.map((point) => new THREE.Vector3(...point))];
        const distance = pathDistance(path);
        const actionRotation = !task
          ? restingRotation
          : (() => {
              const [plotX, , plotZ] = plotPosition(task.action.plotIndex);
              return Math.atan2(plotX - target.x, plotZ - target.z);
            })();
        walk.current = {
          path,
          target,
          startedAt: now,
          distance,
          travelSeconds: botTravelMs(distance) / 1000,
          arrivalSignaled: false,
          actionRotation,
          eventId: task?.eventId ?? null,
          kind: kind ?? 'inspect',
        };
        setActiveKind(kind);
      } else if (duty.phase === 'working' && duty.task) {
        setActiveKind(duty.task.action.kind);
        if (!walk.current) {
          const target = new THREE.Vector3(...plotApproachPosition(duty.task.action.plotIndex));
          walk.current = {
            path: [target],
            target,
            startedAt: now,
            distance: 0,
            travelSeconds: 0,
            arrivalSignaled: true,
            actionRotation: restingRotation,
            eventId: duty.task.eventId,
            kind: duty.task.action.kind,
          };
        }
      } else if (duty.phase !== 'emerging' && duty.phase !== 'merging') {
        setActiveKind(null);
      }
    }

    if (duty.phase === 'docked' && isHelperId(id)) {
      const lead = readAnchor('lead');
      const offset = dockOffset(id);
      current.current.set(lead[0] + offset[0], lead[1] + offset[1], lead[2] + offset[2]);
      mesh.position.copy(current.current);
      mesh.scale.setScalar(visualScale);
      publishAnchor(id, vectorPosition(current.current));
      return;
    }

    if ((duty.phase === 'emerging' || duty.phase === 'merging') && isHelperId(id)) {
      const lead = readAnchor('lead');
      const offset = dockOffset(id);
      const dock = new THREE.Vector3(lead[0] + offset[0], lead[1] + offset[1], lead[2] + offset[2]);
      const staged = new THREE.Vector3(lead[0] + offset[0] * 2.4, 0.08, lead[2] + offset[2] * 2.4);
      const duration = (duty.phase === 'emerging' ? EMERGE_MS : MERGE_MS) / 1000;
      const started = transition.current?.startedAt ?? now;
      const t = smoothstep(Math.min((now - started) / duration, 1));
      const from = transition.current?.from ?? current.current;
      if (duty.phase === 'emerging') current.current.lerpVectors(dock, staged, t);
      else current.current.lerpVectors(from, dock, t);
      mesh.position.copy(current.current);
      mesh.scale.setScalar(THREE.MathUtils.lerp(scale * 0.55, scale, duty.phase === 'emerging' ? t : 1 - t));
      publishAnchor(id, vectorPosition(current.current));
      if (t >= 1 && transition.current?.token === duty.token) {
        if (duty.phase === 'emerging') completeEmerge(id, duty.token);
        else completeMerge(id, duty.token);
        transition.current = null;
      }
      return;
    }

    const job = walk.current;
    const idleBob = Math.sin(now * 2.4) * 0.035;
    if (!job || duty.phase === 'tending' || duty.phase === 'ready') {
      mesh.position.set(current.current.x, current.current.y + idleBob, current.current.z);
      mesh.rotation.y = restingRotation + Math.sin(now * 0.6) * 0.12;
      if (head.current) head.current.rotation.y = Math.sin(now * 1.1) * 0.18;
      if (body.current) body.current.rotation.set(0, 0, 0);
      if (leftArm.current) leftArm.current.rotation.z = 0.12;
      if (rightArm.current) rightArm.current.rotation.z = -0.12;
      if (leftLeg.current) leftLeg.current.rotation.x = 0;
      if (rightLeg.current) rightLeg.current.rotation.x = 0;
      if (statusLight.current) statusLight.current.color.set(accent);
      mesh.scale.setScalar(visualScale);
      publishAnchor(id, vectorPosition(current.current));
      return;
    }

    const elapsed = now - job.startedAt;
    if (duty.phase === 'travelling' || duty.phase === 'goingHome') {
      if (elapsed < job.travelSeconds) {
        const t = smoothstep(elapsed / job.travelSeconds);
        const travelled = t * job.distance;
        const segment = placeAlongPath(job.path, travelled, current.current);
        const directionX = segment.to.x - segment.from.x;
        const directionZ = segment.to.z - segment.from.z;
        if (Math.abs(directionX) + Math.abs(directionZ) > 0.01) {
          mesh.rotation.y = Math.atan2(directionX, directionZ);
        }
        const step = travelled * 6.5;
        mesh.position.set(
          current.current.x,
          current.current.y + Math.abs(Math.sin(step)) * 0.055,
          current.current.z,
        );
        if (body.current) body.current.rotation.z = Math.sin(step) * 0.055;
        if (leftArm.current) leftArm.current.rotation.x = Math.sin(step) * 0.65;
        if (rightArm.current) rightArm.current.rotation.x = -Math.sin(step) * 0.65;
        if (leftLeg.current) leftLeg.current.rotation.x = -Math.sin(step) * 0.55;
        if (rightLeg.current) rightLeg.current.rotation.x = Math.sin(step) * 0.55;
      } else {
        current.current.copy(job.target);
        mesh.position.copy(job.target);
        mesh.rotation.y = job.actionRotation;
        if (!job.arrivalSignaled) {
          job.arrivalSignaled = true;
          if (duty.phase === 'travelling' && job.eventId !== null) signalBotArrival(job.eventId);
          if (duty.phase === 'goingHome') completeGoingHome();
        }
      }
    } else if (duty.phase === 'working') {
      const actionT = Math.min(elapsed / ACTION_SECONDS, 1);
      const auraColor = ACTION_COLORS[job.kind];
      const pulse = 0.5 + Math.sin(now * 7) * 0.5;
      if (aura.current) {
        aura.current.visible = true;
        aura.current.position.set(job.target.x, 0.02, job.target.z);
        aura.current.rotation.y = now * 1.4;
      }
      if (auraRing.current) {
        const ringScale = 1 + pulse * 0.16;
        auraRing.current.scale.set(ringScale, ringScale, 1);
      }
      if (auraRingMat.current) {
        auraRingMat.current.color.set(auraColor);
        auraRingMat.current.opacity = 0.5 + pulse * 0.4;
      }
      if (auraBeamMat.current) {
        auraBeamMat.current.color.set(auraColor);
        auraBeamMat.current.opacity = 0.1 + pulse * 0.12;
      }
      mesh.position.set(job.target.x, job.target.y, job.target.z);
      mesh.rotation.y = job.actionRotation;
      if (leftLeg.current) leftLeg.current.rotation.x = 0;
      if (rightLeg.current) rightLeg.current.rotation.x = 0;
      if (statusLight.current) statusLight.current.color.set(ACTION_COLORS[job.kind]);

      if (job.kind === 'inspect') {
        mesh.position.y += Math.sin(actionT * Math.PI) * 0.35;
        if (head.current) head.current.rotation.y = Math.sin(actionT * Math.PI * 4) * 0.65;
        mesh.rotation.y += actionT * Math.PI * 2;
      } else if (job.kind === 'plant') {
        if (body.current) body.current.rotation.x = Math.sin(actionT * Math.PI) * 0.45;
        if (rightArm.current) rightArm.current.rotation.z = -0.35 - Math.sin(actionT * Math.PI) * 0.9;
      } else if (job.kind === 'water') {
        if (body.current) body.current.rotation.z = -Math.sin(actionT * Math.PI) * 0.28;
        if (rightArm.current) rightArm.current.rotation.z = -0.45 - Math.sin(actionT * Math.PI * 2) * 0.22;
      } else if (job.kind === 'harvest') {
        mesh.rotation.y += actionT * Math.PI * 2;
        mesh.position.y += Math.sin(actionT * Math.PI) * 0.42;
        if (leftArm.current) leftArm.current.rotation.z = 0.8;
        if (rightArm.current) rightArm.current.rotation.z = -0.8;
      } else {
        if (body.current) body.current.rotation.z = Math.sin(actionT * Math.PI * 4) * 0.16;
        if (rightArm.current) rightArm.current.rotation.z = -0.55 - Math.sin(actionT * Math.PI * 3) * 0.5;
      }
    }

    mesh.scale.setScalar(visualScale);
    publishAnchor(id, vectorPosition(current.current));
  });

  return (
    <>
      <group ref={aura} visible={false}>
        <mesh ref={auraRing} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.62, 0.84, 40]} />
          <meshBasicMaterial
            ref={auraRingMat}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, 1.55, 0]}>
          <cylinderGeometry args={[0.48, 0.72, 3.1, 24, 1, true]} />
          <meshBasicMaterial
            ref={auraBeamMat}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
      <group ref={root} position={HOME.toArray()} scale={visualScale} visible={!docked}>
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
          <meshStandardMaterial ref={statusLight} color={accent} emissive="#315e69" emissiveIntensity={1.4} />
        </mesh>

        <group ref={head} position={[0, 1.32, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.72, 0.48, 0.56]} />
            <meshStandardMaterial color={accent} metalness={0.25} roughness={0.48} flatShading />
          </mesh>
          <mesh position={[-0.18, 0.04, 0.29]}>
            <sphereGeometry args={[0.075, 8, 8]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2} />
          </mesh>
          <mesh position={[0.18, 0.04, 0.29]}>
            <sphereGeometry args={[0.075, 8, 8]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2} />
          </mesh>
          <mesh castShadow position={[0, 0.37, 0]}>
            <cylinderGeometry args={[0.025, 0.035, 0.28, 6]} />
            <meshStandardMaterial color="#647b7e" metalness={0.6} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.54, 0]}>
            <octahedronGeometry args={[0.09, 0]} />
            <meshStandardMaterial
              color={activeKind ? ACTION_COLORS[activeKind] : accent}
              emissive={activeKind ? ACTION_COLORS[activeKind] : accent}
              emissiveIntensity={1.5}
            />
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

        <group ref={leftLeg} position={[-0.2, 0.4, 0]}>
          <mesh castShadow position={[0, -0.16, 0]}>
            <capsuleGeometry args={[0.11, 0.28, 4, 8]} />
            <meshStandardMaterial color="#52696c" metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
        <group ref={rightLeg} position={[0.2, 0.4, 0]}>
          <mesh castShadow position={[0, -0.16, 0]}>
            <capsuleGeometry args={[0.11, 0.28, 4, 8]} />
            <meshStandardMaterial color="#52696c" metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
        <Tool kind={activeKind} />
        {shownBubble && !docked && (
          <Html position={[0, 2.2, 0]} center distanceFactor={11} zIndexRange={[20, 0]}>
            <div
              className={`bot-intent-bubble ${shownBubble.phase}`}
              style={{ '--intent-color': ACTION_COLORS[bubbleKind] } as CSSProperties}
            >
              <span className="bot-intent-header">
                <span className="bot-intent-source">WebMCP</span>
                <span className={`bot-intent-phase ${shownBubble.phase}`}>
                  {shownBubble.phase === 'acting'
                    ? bubbleKind
                    : shownBubble.phase === 'done'
                      ? '✓ done'
                      : shownBubble.phase}
                </span>
              </span>
              <span className="bot-intent-label">{shownBubble.label}</span>
            </div>
          </Html>
        )}
      </group>
      </group>
    </>
  );
}

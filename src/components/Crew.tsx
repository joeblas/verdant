import { HELPER_SLOTS } from '../game/crew/ids';
import { RobotBody } from './RobotBody';

const HELPER_ACCENTS = {
  'helper-1': '#9fe870',
  'helper-2': '#ffd66e',
  'helper-3': '#d4a5ff',
} as const;

export function Crew() {
  return (
    <group>
      <RobotBody id="lead" scale={0.9} accent="#8ce6ff" />
      {HELPER_SLOTS.map((id) => (
        <RobotBody key={id} id={id} scale={0.72} accent={HELPER_ACCENTS[id]} />
      ))}
    </group>
  );
}

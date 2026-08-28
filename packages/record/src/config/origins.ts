// Dev origins. The five real values are localhost ports, standing in for the
// five theboard.app subdomains this project will eventually deploy to. When
// it's time to go live, the production swap happens IN THIS FILE ONLY — every
// other module imports PARENT_ORIGIN / ORIGIN from here rather than writing
// an origin string of its own.
//
// `OriginActor` is a placeholder for Task 2's `Actor` union
// (`src/model/types.ts`), which will re-export it. It is defined locally here
// so this file has no dependency on a file that does not exist yet.
export type OriginActor = 'A' | 'B' | 'seat1' | 'seat2';

export const PARENT_ORIGIN = 'http://localhost:8080';

export const ORIGIN: Record<OriginActor, string> = {
  A: 'http://localhost:8081',
  B: 'http://localhost:8082',
  seat1: 'http://localhost:8083',
  seat2: 'http://localhost:8084',
};

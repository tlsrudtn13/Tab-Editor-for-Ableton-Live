export type DrumRole =
  | "kick"
  | "snare"
  | "rim"
  | "clap"
  | "hhClosed"
  | "hhPedal"
  | "hhOpen"
  | "crash"
  | "ride"
  | "tomHigh"
  | "tomMid"
  | "tomLow"
  | "tomFloor";

export const GM_ROLE_PITCH: Readonly<Record<DrumRole, number>> = {
  kick: 36,
  snare: 38,
  rim: 37,
  clap: 39,
  hhClosed: 42,
  hhPedal: 44,
  hhOpen: 46,
  crash: 49,
  ride: 51,
  tomHigh: 50,
  tomMid: 47,
  tomLow: 45,
  tomFloor: 41,
};

export type DrumPattern = {
  id: string;
  name: string;
  kind: "groove" | "fill";
  beatsPerBar: number; // in quarter beats (6/8 = 3)
  stepsPerBeat: number; // grid resolution per quarter beat
  swing?: number; // 0.5 = straight; >0.5 delays every odd step
  tracks: Partial<Record<DrumRole, string>>; // one char per step, all tracks same length
};

export type DrumHit = { b: number; d: number; p: number; v: number };

const STEP_VELOCITY: Record<string, number> = {
  x: 90,
  X: 115,
  g: 40,
};

function validatePattern(p: DrumPattern): void {
  const entries = Object.entries(p.tracks) as [DrumRole, string | undefined][];
  if (entries.length === 0) throw new Error(`Drum pattern ${p.id} has no tracks`);
  const lengths = entries.map(([, t]) => (t ?? "").length);
  const len = lengths[0]!;
  if (lengths.some((l) => l !== len)) {
    throw new Error(`Drum pattern ${p.id} has inconsistent track lengths`);
  }
  const grid = p.beatsPerBar * p.stepsPerBeat;
  if (grid <= 0 || len % grid !== 0) {
    throw new Error(`Drum pattern ${p.id} length ${len} not divisible by grid ${grid}`);
  }
  for (const [role, track] of entries) {
    for (let i = 0; i < (track ?? "").length; i++) {
      const ch = track![i]!;
      if (ch !== "." && !(ch in STEP_VELOCITY)) {
        throw new Error(`Drum pattern ${p.id} has invalid char "${ch}" in ${role} at step ${i}`);
      }
    }
  }
}

export const DRUM_PATTERNS: readonly DrumPattern[] = [
  {
    id: "rock",
    name: "Rock",
    kind: "groove",
    beatsPerBar: 4,
    stepsPerBeat: 4,
    tracks: {
      hhClosed: "x.x.x.x.x.x.x.x.",
      snare: "....X.......X...",
      kick: "x.......x.x.....",
    },
  },
  {
    id: "pop",
    name: "Pop",
    kind: "groove",
    beatsPerBar: 4,
    stepsPerBeat: 4,
    tracks: {
      hhClosed: "x.x.x.x.x.x.x.x.",
      snare: "....X.......X...",
      kick: "x.....x.x.......",
    },
  },
  {
    id: "funk",
    name: "Funk",
    kind: "groove",
    beatsPerBar: 4,
    stepsPerBeat: 4,
    tracks: {
      hhClosed: "xxxxxxxxxxxxxxxx",
      snare: "....X..g.g..X..g",
      kick: "x.x...x...x..x..",
    },
  },
  {
    id: "halfTime",
    name: "Half-time",
    kind: "groove",
    beatsPerBar: 4,
    stepsPerBeat: 4,
    tracks: {
      hhClosed: "x.x.x.x.x.x.x.x.",
      snare: "........X.......",
      kick: "x......x..x.....",
    },
  },
  {
    id: "hipHop",
    name: "Hip-hop (swing)",
    kind: "groove",
    beatsPerBar: 4,
    stepsPerBeat: 4,
    swing: 0.6,
    tracks: {
      hhClosed: "x.x.x.x.x.x.x.x.",
      snare: "....X.......X...",
      kick: "x......xx.x.....",
    },
  },
  {
    id: "house",
    name: "House",
    kind: "groove",
    beatsPerBar: 4,
    stepsPerBeat: 4,
    tracks: {
      kick: "x...x...x...x...",
      clap: "....x.......x...",
      hhOpen: "..x...x...x...x.",
      hhClosed: "x...x...x...x...",
    },
  },
  {
    id: "shuffle",
    name: "Shuffle",
    kind: "groove",
    beatsPerBar: 4,
    stepsPerBeat: 3,
    tracks: {
      hhClosed: "x.xx.xx.xx.x",
      snare: "...X.....X..",
      kick: "x.....x.....",
    },
  },
  {
    id: "bossa",
    name: "Bossa nova",
    kind: "groove",
    beatsPerBar: 4,
    stepsPerBeat: 4,
    tracks: {
      rim: "x..x..x...x..x....x..x...x..x...",
      kick: "x..xx..xx..xx..xx..xx..xx..xx..x",
      hhClosed: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.",
    },
  },
  {
    id: "sixEight",
    name: "6/8",
    kind: "groove",
    beatsPerBar: 3,
    stepsPerBeat: 2,
    tracks: {
      hhClosed: "xxxxxx",
      snare: "...X..",
      kick: "x.....",
    },
  },
  {
    id: "fillToms",
    name: "Fill: toms",
    kind: "fill",
    beatsPerBar: 4,
    stepsPerBeat: 4,
    tracks: {
      snare: "xxxx............",
      tomHigh: "....xxxx........",
      tomMid: "........xxxx....",
      tomFloor: "............xx..",
      kick: "..............x.",
    },
  },
  {
    id: "fillSnare",
    name: "Fill: snare",
    kind: "fill",
    beatsPerBar: 4,
    stepsPerBeat: 4,
    tracks: {
      snare: "x.x.x.x.xxxxXXXX",
    },
  },
];

for (const p of DRUM_PATTERNS) validatePattern(p);

export function patternBars(p: DrumPattern): number {
  const track = Object.values(p.tracks)[0];
  const len = track?.length ?? 0;
  return len / (p.beatsPerBar * p.stepsPerBeat);
}

function roundBeat(b: number): number {
  return Math.round(b * 1e6) / 1e6;
}

function clampVelocity(v: number): number {
  return Math.max(1, Math.min(127, Math.round(v)));
}

export function renderDrumPattern(
  pattern: DrumPattern | string,
  opts: {
    startBeat: number;
    bars?: number;
    velocityScale?: number;
    pitchMap?: Partial<Record<DrumRole, number>>;
  },
): DrumHit[] {
  const p =
    typeof pattern === "string" ? DRUM_PATTERNS.find((x) => x.id === pattern) : pattern;
  if (!p) throw new Error(`Unknown drum pattern: ${String(pattern)}`);
  validatePattern(p);

  const bars = opts.bars ?? patternBars(p);
  const velocityScale = opts.velocityScale ?? 1;
  const patternLen = (Object.values(p.tracks)[0]?.length ?? 0);
  const stepsPerBar = p.beatsPerBar * p.stepsPerBeat;
  const totalSteps = bars * stepsPerBar;
  const hits: DrumHit[] = [];

  const entries = Object.entries(p.tracks) as [DrumRole, string][];
  for (let i = 0; i < totalSteps; i++) {
    const patternStep = i % patternLen;
    const barIndex = Math.floor(i / stepsPerBar);
    const stepInBar = i % stepsPerBar;
    const swingDelay =
      p.swing !== undefined && p.swing !== 0.5 && stepInBar % 2 === 1
        ? ((p.swing - 0.5) * 2) / p.stepsPerBeat
        : 0;
    const b = roundBeat(opts.startBeat + barIndex * p.beatsPerBar + stepInBar / p.stepsPerBeat + swingDelay);
    const d = 1 / p.stepsPerBeat;

    for (const [role, track] of entries) {
      const ch = track[patternStep];
      if (!ch || ch === ".") continue;
      const baseV = STEP_VELOCITY[ch];
      if (baseV === undefined) {
        throw new Error(`Drum pattern ${p.id} has invalid char "${ch}" in ${role} at step ${patternStep}`);
      }
      const pitch = opts.pitchMap?.[role] ?? GM_ROLE_PITCH[role];
      hits.push({ b, d, p: pitch, v: clampVelocity(baseV * velocityScale) });
    }
  }

  hits.sort((a, b) => (a.b - b.b) || (a.p - b.p));
  return hits;
}

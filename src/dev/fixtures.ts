// Test clips used by the dev harness (written into Live), scripts/preview.ts
// and unit tests. Pitches are SOUNDING MIDI pitches as Live stores them
// (guitar low E = 40, bass low E = 28). Times are in beats.
export type FixtureNote = { pitch: number; startTime: number; duration: number; velocity: number };
export type Fixture = { name: string; length: number; purpose: string; notes: FixtureNote[] };

const note = (pitch: number, startTime: number, duration: number, velocity = 100): FixtureNote =>
    ({ pitch, startTime, duration, velocity });

function seq(pitches: number[], step: number, dur = step, vel = 100, start = 0): FixtureNote[] {
    return pitches.map((p, i) => note(p, start + i * step, dur, vel));
}

const riff: FixtureNote[] = [];
for (let bar = 0; bar < 2; bar++) {
    [40, 40, 43, 45, 40, 40, 47, 45].forEach((p, i) =>
        riff.push(note(p, bar * 4 + i * 0.5, 0.5, i % 2 ? 80 : 110)));
}

const chords: FixtureNote[] = [];
[[40, 47, 52, 56, 59, 64], [45, 52, 57, 61, 64], [50, 57, 62, 66], [43, 47, 50, 55, 59, 67]]
    .forEach((c, i) => c.forEach(p => chords.push(note(p, i * 4, 4, 90))));

const triplets: FixtureNote[] = [];
for (let i = 0; i < 12; i++) triplets.push(note([64, 67, 71][i % 3]!, i / 3, 1 / 3));

// Arpeggio whose notes ring over each other (let ring)
const letRing: FixtureNote[] = [45, 52, 57, 60, 64, 60, 57, 52].map((p, i) => note(p, i * 0.5, 2));

export const FIXTURES: Fixture[] = [
    { name: "TT riff 8ths", length: 8, purpose: "basic single-note riff on low strings", notes: riff },
    { name: "TT open chords", length: 16, purpose: "E A D G open chords, one per bar", notes: chords },
    { name: "TT dotted 8th melody", length: 8,
      purpose: "known bug: grid detection picks quarters and merges notes",
      notes: seq([64, 67, 69, 71, 72, 71, 69, 67, 76, 74], 0.75) },
    { name: "TT bass real pitch", length: 8,
      purpose: "known bug: E1-based bass line is folded up an octave",
      notes: seq([28, 28, 31, 33, 35, 33, 31, 28], 1, 0.9) },
    { name: "TT 8th triplets", length: 4, purpose: "triplets are approximated today", notes: triplets },
    { name: "TT position run", length: 4,
      purpose: "scale run around the 7th position: fingering jumps", notes: seq([69, 71, 72, 74, 76, 77, 79, 81], 0.5) },
    { name: "TT let ring arpeggio", length: 6, purpose: "overlapping notes become one voice", notes: letRing },
    { name: "TT out of range", length: 4, purpose: "very high and very low notes",
      notes: [note(96, 0, 1), note(33, 1, 1), note(91, 2, 1), note(24, 3, 1)] },
];

// ── Drum fixtures (GM pitches, Drum Rack default pads from C1 = 36) ─────────
const drumRock: FixtureNote[] = [];
for (let bar = 0; bar < 2; bar++) {
    const o = bar * 4;
    for (let i = 0; i < 8; i++) drumRock.push(note(i === 7 && bar === 0 ? 46 : 42, o + i * 0.5, 0.25, i % 2 ? 70 : 100));
    drumRock.push(note(38, o + 1, 0.25, 110), note(38, o + 3, 0.25, 110), note(38, o + 2.75, 0.25, 35));  // ghost before 4
    drumRock.push(note(36, o, 0.25, 110), note(36, o + 2.5, 0.25, 100), note(36, o + 2.75, 0.25, 100));
    drumRock.push(note(44, o + 1, 0.25, 80), note(44, o + 3, 0.25, 80));
}
drumRock.splice(0, 1, note(49, 0, 0.25, 120), note(42, 0, 0.25, 100));                  // crash on 1
// tom fill on beat 4 of bar 2: 16ths high -> mid -> low -> floor
[50, 48, 45, 43].forEach((p, i) => drumRock.push(note(p, 7 + i * 0.25, 0.25, 105)));
const drumRockClean = drumRock.filter(x => !(x.startTime >= 7 && (x.pitch === 42 || x.pitch === 38)));

const drumShuffle: FixtureNote[] = [];
for (let beat = 0; beat < 8; beat++) {
    drumShuffle.push(note(51, beat, 0.33, 95), note(51, beat + 2 / 3, 0.33, 70));       // ride shuffle
    if (beat % 2 === 1) drumShuffle.push(note(38, beat, 0.33, 110));
    if (beat % 2 === 0) drumShuffle.push(note(36, beat, 0.33, 110));
}

// played (humanized) rock beat: off-grid starts and uneven velocities, for the edit round's
// "untouched hits keep their exact time and velocity" check
const drumHuman: FixtureNote[] = drumRockClean.map((x, i) => ({
    ...x,
    startTime: Math.max(0, Math.round((x.startTime + ((i * 37) % 7 - 3) * 0.006) * 1000) / 1000),
    velocity: Math.max(1, Math.min(127, x.velocity + ((i * 53) % 11) - 5)),
}));

export const DRUM_FIXTURES: Fixture[] = [
    { name: "TT drums rock", length: 8, purpose: "rock beat: hats, snare + ghost, kick, pedal hat, crash, tom fill", notes: drumRockClean },
    { name: "TT drums shuffle", length: 8, purpose: "triplet ride shuffle, two voices", notes: drumShuffle },
    { name: "TT drums human", length: 8, purpose: "rock beat played by hand: off-grid starts, uneven velocities (edit write-back)", notes: drumHuman },
];

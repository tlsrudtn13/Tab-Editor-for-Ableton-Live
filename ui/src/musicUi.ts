/* ── Musical helpers (pure, no DOM, no state) ─────────────────────────────── */

export const NOTE_NAMES: string[] = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];

// Ableton 옥타브 컨벤션: MIDI 60 = C3
export function pitchToName(p: number): string {
  return NOTE_NAMES[p % 12] + (Math.floor(p / 12) - 2);
}

export function durToLabel(b: number): string {
  var t = 0.02;
  if (Math.abs(b - 4)     < t) return "Whole";
  if (Math.abs(b - 3)     < t) return "Dotted Half";
  if (Math.abs(b - 2)     < t) return "Half";
  if (Math.abs(b - 1.5)   < t) return "Dotted Qtr";
  if (Math.abs(b - 1)     < t) return "Quarter";
  if (Math.abs(b - 0.75)  < t) return "Dotted 8th";
  if (Math.abs(b - 0.5)   < t) return "8th";
  if (Math.abs(b - 0.375) < t) return "Dotted 16th";
  if (Math.abs(b - 0.25)  < t) return "16th";
  if (Math.abs(b - 0.125) < t) return "32nd";
  return b.toFixed(3) + " b";
}

export function beatToBarBeat(b: number): string {
  var bar  = Math.floor(b / 4) + 1;
  var beat = (b % 4) + 1;
  return "B" + bar + ":" + beat.toFixed(1);
}

export function velToDynamic(v: number): string {
  if (v <=  15) return v + " ppp";
  if (v <=  31) return v + " pp";
  if (v <=  47) return v + " p";
  if (v <=  63) return v + " mp";
  if (v <=  79) return v + " mf";
  if (v <=  95) return v + " f";
  if (v <= 111) return v + " ff";
  return v + " fff";
}

/* ── 코드(화음) 분석기 ────────────────────────────────────────────────────── */
export const CHORD_PATTERNS: [string, number[]][] = [
  ["maj9",    [0,2,4,7,11]],
  ["9",       [0,2,4,7,10]],
  ["m9",      [0,2,3,7,10]],
  ["maj7",    [0,4,7,11]],
  ["7",       [0,4,7,10]],
  ["m7",      [0,3,7,10]],
  ["m7b5",    [0,3,6,10]],
  ["dim7",    [0,3,6,9]],
  ["6",       [0,4,7,9]],
  ["m6",      [0,3,7,9]],
  ["add9",    [0,2,4,7]],
  ["m(add9)", [0,2,3,7]],
  ["",        [0,4,7]],
  ["m",       [0,3,7]],
  ["dim",     [0,3,6]],
  ["aug",     [0,4,8]],
  ["sus2",    [0,2,7]],
  ["sus4",    [0,5,7]],
  ["5",       [0,7]],
];

export function detectChord(pitches: number[] | null | undefined): string {
  if (!pitches || pitches.length < 2) return "";
  var pcs: number[] = [];
  for (var i = 0; i < pitches.length; i++) {
    var pc = ((pitches[i] % 12) + 12) % 12;
    if (pcs.indexOf(pc) === -1) pcs.push(pc);
  }
  if (pcs.length < 2) return "";
  var bassPc = ((Math.min.apply(null, pitches) % 12) + 12) % 12;
  var roots = [bassPc].concat(pcs.filter(function(p) { return p !== bassPc; }));
  for (var r = 0; r < roots.length; r++) {
    var root = roots[r];
    var iv = pcs.map(function(p) { return ((p - root) + 12) % 12; })
                .sort(function(a, b) { return a - b; });
    for (var c = 0; c < CHORD_PATTERNS.length; c++) {
      var pat = CHORD_PATTERNS[c][1];
      if (iv.length === pat.length &&
          iv.every(function(v, k) { return v === pat[k]; })) {
        var name = NOTE_NAMES[root] + CHORD_PATTERNS[c][0];
        if (root !== bassPc) name += "/" + NOTE_NAMES[bassPc];
        return name;
      }
    }
  }
  if (pcs.length === 2) {
    var iv2 = ((pcs[1] - pcs[0]) + 12) % 12;
    var IVN: Record<number, string> = {1:"m2",2:"M2",3:"m3",4:"M3",5:"P4",6:"TT",7:"P5",8:"m6",9:"M6",10:"m7",11:"M7"};
    return NOTE_NAMES[bassPc] + " +" + (IVN[iv2] || iv2);
  }
  return "";
}

export const SCALES: Record<string, number[] | null> = {
  "off":        null,
  "major":      [0,2,4,5,7,9,11],
  "minor":      [0,2,3,5,7,8,10],
  "pent-major": [0,2,4,7,9],
  "pent-minor": [0,3,5,7,10],
  "blues":      [0,3,5,6,7,10],
  "dorian":     [0,2,3,5,7,9,10],
  "mixolydian": [0,2,4,5,7,9,10],
  "harm-minor": [0,2,3,5,7,8,11],
};

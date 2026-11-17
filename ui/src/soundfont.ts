import soundfontUrl from "../../node_modules/@coderline/alphatab/dist/soundfont/sonivox.sf3?url";

export const soundFontUrl: string = (typeof soundfontUrl === "string") ? soundfontUrl : "";

// Decode an inline data URL (if any) to an ArrayBuffer.
export function soundFontArrayBuffer(): ArrayBuffer | null {
  try {
    const u = String(soundFontUrl);
    const m = u.match(/^data:([^;]+);base64,(.*)$/);
    if (!m) return null;
    const binary = atob(m[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  } catch (e) {
    return null;
  }
}

// Fetch (or decode) the bundled soundfont and load it into the given api.
export function loadSoundFont(api: any): void {
  try {
    const ab = soundFontArrayBuffer();
    if (ab) {
      api.loadSoundFont(ab);
      return;
    }
    if (typeof fetch === "function" && soundFontUrl) {
      fetch(soundFontUrl).then(function(r) { return r.arrayBuffer(); }).then(function(buf) {
        try { api.loadSoundFont(buf); } catch(e) {}
      }).catch(function(e) {});
    }
  } catch (e) {}
}
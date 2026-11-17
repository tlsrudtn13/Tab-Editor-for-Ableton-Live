import { state } from "./state";

export function initLog() {
  state.logEl = document.getElementById("log");
}

export function log(m: any) { state.logEl!.textContent += m + "\n"; state.logEl!.scrollTop = state.logEl!.scrollHeight; }
export function status(m: any) { document.getElementById("status")!.textContent = m; }

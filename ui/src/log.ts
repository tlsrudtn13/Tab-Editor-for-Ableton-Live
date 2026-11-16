// @ts-nocheck
import { state } from "./state";

export function initLog() {
  state.logEl = document.getElementById("log");
}

export function log(m) { state.logEl.textContent += m + "\n"; state.logEl.scrollTop = state.logEl.scrollHeight; }
export function status(m) { document.getElementById("status").textContent = m; }

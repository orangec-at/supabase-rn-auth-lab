import { useSyncExternalStore } from "react";

// A tiny in-memory event log. Every line also goes to console.log with a
// "[lab]" prefix, so it shows up in the Metro terminal as well as on screen.
export type LogLine = { t: number; tag: string; msg: string };

const lines: LogLine[] = [];
const listeners = new Set<() => void>();
const start = Date.now();
let snapshot: LogLine[] = [];

export function log(tag: string, msg: string) {
  const line = { t: Date.now(), tag, msg };
  lines.push(line);
  snapshot = lines.slice(-200);
  console.log(`[lab] +${((line.t - start) / 1000).toFixed(1)}s [${tag}] ${msg}`);
  listeners.forEach((l) => l());
}

export function clearLog() {
  lines.length = 0;
  snapshot = [];
  listeners.forEach((l) => l());
}

export function useLog() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}

export const sinceStart = (t: number) => `+${((t - start) / 1000).toFixed(1)}s`;

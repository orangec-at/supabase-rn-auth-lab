import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { log } from "./log";

// Local `supabase start` defaults. iOS simulator reaches the host on 127.0.0.1;
// the Android emulator needs 10.0.2.2 instead.
const host = Platform.OS === "android" ? "10.0.2.2" : "127.0.0.1";
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? `http://${host}:54421`;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

// --- Instrumented fetch -----------------------------------------------------
// Counts /auth/v1/token requests (the proof for #2767) and can simulate
// "no network" by throwing what React Native's fetch throws when offline.
export const net = { offline: false, tokenRequests: 0 };

const labFetch: typeof fetch = async (input, init) => {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const isToken = href.includes("/auth/v1/token");
  if (isToken) {
    net.tokenRequests += 1;
    log("net", `/token request #${net.tokenRequests}${net.offline ? " (simulated offline)" : ""}`);
  }
  if (net.offline) throw new TypeError("Network request failed");
  return fetch(input, init);
};

// --- Client: the setup from Supabase's React Native docs -------------------
export const makeClient = () =>
  createClient(url, anonKey, {
    global: { fetch: labFetch },
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // No `lock`: 2.118 deprecates it ("lockless coordination").
    },
  });

export const supabase = makeClient();

// Docs-recommended: refresh only while the app is in the foreground.
AppState.addEventListener("change", (state) => {
  log("app", `AppState → ${state}`);
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

supabase.auth.onAuthStateChange((event, session) => {
  log("auth", `${event} ${session ? `exp ${tokenExp(session.access_token)}` : "(no session)"}`);
});

// --- Helpers ----------------------------------------------------------------
export const TEST_USER = { email: "lab@example.com", password: "password123" };

/** Seconds until a JWT expires (negative = already expired). */
export function tokenExp(jwt?: string | null): string {
  if (!jwt) return "none";
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(part));
    const left = exp - Math.floor(Date.now() / 1000);
    return left >= 0 ? `in ${left}s` : `${-left}s ago`;
  } catch {
    return "unparseable";
  }
}

/** Runtime facts worth pasting into a GitHub issue comment. */
export function environment() {
  const g = globalThis as any;
  const rn = Platform.constants.reactNativeVersion;
  return {
    platform: `${Platform.OS} ${Platform.Version}`,
    reactNative: `${rn.major}.${rn.minor}.${rn.patch}`,
    engine: g.HermesInternal ? "Hermes" : "JSC/other",
    supabaseJs: (supabase as any).headers?.["X-Client-Info"] ?? "unknown",
    // phoenix only registers its visibilitychange listener (#2613) when this exists.
    windowAddEventListener: typeof g.window?.addEventListener,
  };
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/button";
import { LogView } from "@/components/log-view";
import { log } from "@/lib/log";
import { net, supabase } from "@/lib/supabase";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const secs = (from: number) => `${((Date.now() - from) / 1000).toFixed(1)}s`;

// Mark the stored session as expired, like an app relaunched after the access
// token ran out (the setup in #2767). The auto-refresh ticker only refreshes a
// token inside its expiry margin, so without this it would never try.
async function expireStoredSession() {
  const key = (supabase.auth as any).storageKey as string;
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return false;
  const session = JSON.parse(raw);
  session.expires_at = Math.floor(Date.now() / 1000) - 60;
  await AsyncStorage.setItem(key, JSON.stringify(session));
  return true;
}

async function countRequests(label: string, fn: () => Promise<unknown>, settleMs = 0) {
  const before = net.tokenRequests;
  const r: any = await fn();
  if (settleMs) await wait(settleMs);
  log("result", `${label} → ${r?.error?.name ?? "ok"}, ${net.tokenRequests - before} /token requests`);
}

async function failOffline() {
  log("net", "going OFFLINE (simulated)");
  net.offline = true;
  const t0 = Date.now();
  const before = net.tokenRequests;
  const r = await supabase.auth.refreshSession();
  log("result", `offline refreshSession → ${r.error?.name ?? "ok"} after ${secs(t0)}, ${net.tokenRequests - before} /token requests`);
}

async function untilRefreshed(onlineAt: number) {
  for (;;) {
    const r = await supabase.auth.refreshSession();
    if (!r.error) return log("result", `first successful refresh ${secs(onlineAt)} after the network came back`);
    await wait(5000);
  }
}

// #2767. Variant A: offline failure → network back → startAutoRefresh().
// Variant B (realistic RN): the app returns to the foreground while still
// offline (AppState → startAutoRefresh), the network comes back seconds later,
// and the app calls startAutoRefresh() again from its connectivity listener.
async function runCooldown(variant: "a" | "b") {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return log("result", "sign in first");
  log("result", `variant ${variant.toUpperCase()} start`);
  await supabase.auth.stopAutoRefresh(); // isolate from the ticker, as the issue's repro does
  await expireStoredSession();

  await failOffline();

  if (variant === "b") {
    await countRequests("still offline: startAutoRefresh() (foreground)", () => supabase.auth.startAutoRefresh(), 30000);
    await supabase.auth.stopAutoRefresh();
  }

  log("net", "back ONLINE");
  net.offline = false;
  const onlineAt = Date.now();
  await countRequests("online: refreshSession()", () => supabase.auth.refreshSession());
  await countRequests("online: startAutoRefresh()", () => supabase.auth.startAutoRefresh(), 2000);
  await untilRefreshed(onlineAt);
}

export default function Refresh() {
  const { auto, action, t } = useLocalSearchParams<{ auto?: string; action?: string; t?: string }>();

  useEffect(() => {
    if (auto === "a" || auto === "b") runCooldown(auto);
  }, [auto]);

  // Manual mode for a *real* outage: stop the auth container from the
  // terminal, trigger refreshes via ?action=refresh, then start it again.
  useEffect(() => {
    if (action !== "refresh") return;
    const before = net.tokenRequests;
    supabase.auth.refreshSession().then((r) =>
      log("result", `refreshSession → ${r.error?.name ?? "ok"}, ${net.tokenRequests - before} /token requests`),
    );
  }, [action, t]);

  return (
    <View style={styles.page}>
      <Text style={styles.help}>Simulates offline → refresh fails → online. Watch the /token counter.</Text>
      <Button title="Variant A: offline → online (~90 s)" onPress={() => runCooldown("a")} />
      <Button title="Variant B: resume while offline (~2 min)" onPress={() => runCooldown("b")} />
      <LogView />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 16 },
  help: { fontSize: 13, color: "#444" },
});

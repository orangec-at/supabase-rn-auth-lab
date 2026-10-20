import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/button";
import { LogView } from "@/components/log-view";
import { log } from "@/lib/log";
import { net, supabase } from "@/lib/supabase";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// #2767: after a refresh fails offline, auth-js caches the failure for
// REFRESH_FAILURE_COOLDOWN_MS (60 s). When the network returns, every refresh
// call returns the cached error without sending a request.
async function runCooldown() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return log("result", "sign in first");

  // Isolate from the auto-refresh ticker, as the issue's repro does.
  await supabase.auth.stopAutoRefresh();

  log("net", "going OFFLINE (simulated)");
  net.offline = true;
  let t0 = Date.now();
  let before = net.tokenRequests;
  const offline = await supabase.auth.refreshSession();
  log("result", `offline refreshSession → ${offline.error?.name ?? "ok"} after ${((Date.now() - t0) / 1000).toFixed(1)}s, ${net.tokenRequests - before} /token requests`);
  const failedAt = Date.now();

  log("net", "back ONLINE");
  net.offline = false;
  before = net.tokenRequests;
  const online = await supabase.auth.refreshSession();
  log("result", `online refreshSession → ${online.error?.name ?? "ok"}, ${net.tokenRequests - before} /token requests (bug: 0)`);

  before = net.tokenRequests;
  await supabase.auth.startAutoRefresh();
  await wait(1000);
  log("result", `startAutoRefresh() immediate tick → ${net.tokenRequests - before} /token requests`);

  // Measure how long the user would actually wait.
  for (;;) {
    const r = await supabase.auth.refreshSession();
    if (!r.error) {
      log("result", `first successful refresh ${((Date.now() - failedAt) / 1000).toFixed(1)}s after the network came back`);
      return;
    }
    await wait(5000);
  }
}

export default function Refresh() {
  const { auto, action, t } = useLocalSearchParams<{ auto?: string; action?: string; t?: string }>();

  useEffect(() => {
    if (auto === "1") runCooldown();
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
      <Button title="Run cooldown scenario (~90 s)" onPress={runCooldown} />
      <LogView />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 16 },
  help: { fontSize: 13, color: "#444" },
});

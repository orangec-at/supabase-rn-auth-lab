import type { RealtimeChannel } from "@supabase/supabase-js";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/button";
import { LogView } from "@/components/log-view";
import { log } from "@/lib/log";
import { makeClient, supabase, tokenExp } from "@/lib/supabase";

type Mode = "fresh-client" | "fresh-client-workaround" | "naive" | "after-session" | "workaround";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const realtimeToken = (c = supabase) => (c.realtime as any).accessTokenValue as string | null;

// #1730: open the app with a session restored from AsyncStorage, subscribe to
// postgres_changes on an RLS table, insert a row. If the channel joined
// without the user's JWT, RLS filters the event out and nothing arrives.
//   fresh-client  a brand-new client subscribes in the same tick it is created,
//                 while its session is still loading from AsyncStorage. This is
//                 what an app's first screen does on a real cold start.
//   fresh-client-workaround  the same, plus the issue's setAuth() workaround
//   naive         subscribe on mount, don't wait for the session (common pattern)
//   after-session await getSession() first
//   workaround    the issue's fix: realtime.setAuth() on every auth change
export default function Realtime() {
  const params = useLocalSearchParams<{ mode?: Mode; auto?: string; action?: string; t?: string }>();
  const mode: Mode = params.mode ?? "fresh-client";
  const received = useRef(0);

  async function insertAndCheck() {
    const before = received.current;
    const { error } = await supabase.from("messages").insert({ body: `hello ${Date.now()}` });
    if (error) return log("result", `insert failed: ${error.message}`);
    await wait(3000);
    const got = received.current - before;
    log("result", `mode=${mode}: ${got === 1 ? "PASS" : "FAIL"}, received ${got}/1 INSERT events`);
  }

  useEffect(() => {
    let channel: RealtimeChannel | undefined;
    let unsubscribe = () => {};
    let tested = false;

    // fresh-client gets its own client; the others reuse the app-wide one.
    const client = mode.startsWith("fresh-client") ? makeClient() : supabase;

    (async () => {
      log("rt", `mode=${mode}, realtime token at mount: ${tokenExp(realtimeToken(client))}`);
      if (mode === "after-session") {
        const { data } = await supabase.auth.getSession();
        log("rt", `session restored: ${data.session ? "yes" : "no"}`);
      }
      if (mode.endsWith("workaround")) {
        const { data } = client.auth.onAuthStateChange((_e, s) => {
          if (s) client.realtime.setAuth(s.access_token);
        });
        unsubscribe = () => data.subscription.unsubscribe();
      }

      channel = client
        .channel(`messages-${Date.now()}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => {
          // An event can arrive with an empty record plus `errors` (e.g. 401)
          // when the channel joined without a usable JWT. Count only real rows.
          const errors = (p as any).errors;
          log("rt", `INSERT event: id=${p.new.id} keys=${Object.keys(p.new).length} errors=${JSON.stringify(errors)}`);
          if (p.new.id !== undefined) received.current += 1;
        })
        .subscribe((status, err) => {
          log("rt", `channel ${status}${err ? `: ${err.message}` : ""} · realtime token ${tokenExp(realtimeToken(client))}`);
          if (status === "SUBSCRIBED" && params.auto === "1" && !tested) {
            tested = true;
            setTimeout(insertAndCheck, 1500);
          }
        });
    })();

    return () => {
      unsubscribe();
      if (channel) client.removeChannel(channel);
    };
  }, [mode]);

  // ?action=insert&t=<nonce> — insert again, e.g. after coming back from background.
  useEffect(() => {
    if (params.action !== "insert") return;
    log("rt", `socket connected: ${supabase.realtime.isConnected()} · realtime token ${tokenExp(realtimeToken())}`);
    insertAndCheck();
  }, [params.action, params.t]);

  return (
    <View style={styles.page}>
      <Text style={styles.help}>Mode: {mode}. Cold-start the app on this screen to test a restored session.</Text>
      <View style={styles.row}>
        {(["fresh-client", "fresh-client-workaround", "naive", "after-session", "workaround"] as const).map((m) => (
          <Button key={m} title={m} onPress={() => router.setParams({ mode: m })} />
        ))}
      </View>
      <Button title="Insert a row and check delivery" onPress={insertAndCheck} />
      <LogView />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 16 },
  help: { fontSize: 13, color: "#444" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});

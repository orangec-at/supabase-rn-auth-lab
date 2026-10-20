import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/button";
import { LogView } from "@/components/log-view";
import { log } from "@/lib/log";
import { environment, supabase, TEST_USER, tokenExp } from "@/lib/supabase";

export default function Home() {
  const { action, t, next } = useLocalSearchParams<{ action?: string; t?: string; next?: string }>();
  const [email, setEmail] = useState<string | null>(null);
  const [exp, setExp] = useState("none");

  useEffect(() => {
    log("app", `env ${JSON.stringify(environment())}`);
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setEmail(s?.user.email ?? null);
      setExp(tokenExp(s?.access_token));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function signIn() {
    // signUp fails harmlessly if the user already exists.
    await supabase.auth.signUp(TEST_USER);
    const { error } = await supabase.auth.signInWithPassword(TEST_USER);
    log("result", error ? `sign-in failed: ${error.message}` : "signed in");
  }

  // Cold-start a scenario: ?next=<route> is saved, then the next launch jumps
  // straight there, while the session is still being restored from storage.
  useEffect(() => {
    if (next) {
      AsyncStorage.setItem("lab:next", next);
      log("app", `next launch opens ${next}`);
      return;
    }
    AsyncStorage.getItem("lab:next").then((route) => {
      if (!route) return;
      AsyncStorage.removeItem("lab:next");
      router.replace(route as any);
    });
  }, [next]);

  // Deep links drive the app from the terminal: ...--/?action=signin&t=1
  useEffect(() => {
    if (action === "signin") signIn();
    if (action === "signout") supabase.auth.signOut();
  }, [action, t]);

  return (
    <View style={styles.page}>
      <Text style={styles.status}>{email ? `${email} · token expires ${exp}` : "signed out"}</Text>
      <Button title="Sign in test user" onPress={signIn} />
      <Button title="Sign out" onPress={() => supabase.auth.signOut()} />
      <Link href="/refresh" style={styles.link}>→ #2767 refresh cooldown after offline</Link>
      <Link href="/realtime" style={styles.link}>→ #1730 realtime + RLS after restored session</Link>
      <LogView />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 16 },
  status: { fontSize: 13, color: "#444" },
  link: { marginTop: 14, color: "#1d4ed8", fontSize: 15 },
});

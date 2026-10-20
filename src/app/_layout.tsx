import { Stack } from "expo-router";

// Root navigator. Every file in src/app is a screen; this Stack pushes them
// on top of each other like browser history.
export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Supabase RN Auth Lab" }} />
      <Stack.Screen name="refresh" options={{ title: "#2767 Refresh cooldown" }} />
      <Stack.Screen name="realtime" options={{ title: "#1730 Realtime + RLS" }} />
    </Stack>
  );
}

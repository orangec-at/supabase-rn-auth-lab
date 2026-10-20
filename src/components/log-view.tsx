import { ScrollView, StyleSheet, Text } from "react-native";
import { sinceStart, useLog } from "@/lib/log";

const colors: Record<string, string> = {
  net: "#b45309", auth: "#1d4ed8", rt: "#047857", app: "#6b21a8", result: "#b91c1c",
};

export function LogView() {
  const lines = useLog();
  return (
    <ScrollView style={styles.box} contentContainerStyle={{ padding: 8 }}>
      {lines.map((l, i) => (
        <Text key={i} style={styles.line}>
          <Text style={{ color: "#888" }}>{sinceStart(l.t)} </Text>
          <Text style={{ color: colors[l.tag] ?? "#333", fontWeight: "600" }}>[{l.tag}] </Text>
          {l.msg}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, backgroundColor: "#f4f4f5", borderRadius: 8, marginTop: 12 },
  line: { fontFamily: "Menlo", fontSize: 11, marginBottom: 2 },
});

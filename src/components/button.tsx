import { Pressable, StyleSheet, Text } from "react-native";

export function Button({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]} onPress={onPress}>
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { backgroundColor: "#18181b", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, marginTop: 8 },
  text: { color: "white", fontWeight: "600", textAlign: "center" },
});

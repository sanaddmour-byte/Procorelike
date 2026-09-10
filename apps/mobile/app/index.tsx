import { StyleSheet, Text, View } from "react-native";
import { i18n } from "@/lib/i18n";

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{i18n.t("appName")}</Text>
      <Text style={styles.subtitle}>{i18n.t("phase1Placeholder")}</Text>
      <Text style={styles.todo}>{i18n.t("todoPhase2")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: "600" },
  subtitle: { fontSize: 14, textAlign: "center", color: "#475569" },
  todo: { fontSize: 12, color: "#b45309" },
});

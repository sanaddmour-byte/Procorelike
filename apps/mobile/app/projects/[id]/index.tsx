import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SyncStatusBar } from "@/components/SyncStatusBar";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

export default function ProjectHomeScreen() {
  useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("projects.title") }} />
      <SyncStatusBar projectId={id} />
      <View style={styles.links}>
        <Link href={`/projects/${id}/daily-log`} asChild>
          <Pressable style={styles.card}>
            <Text style={styles.cardTitle}>{i18n.t("dailyLog.title")}</Text>
          </Pressable>
        </Link>
        <Link href={`/projects/${id}/punch-list`} asChild>
          <Pressable style={styles.card}>
            <Text style={styles.cardTitle}>{i18n.t("punchList.title")}</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  links: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 20 },
  cardTitle: { fontSize: 17, fontWeight: "600" },
});

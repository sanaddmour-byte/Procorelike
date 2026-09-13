import { Link, Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { i18n } from "@/lib/i18n";
import { brutalShadow, colors } from "@/lib/theme";
import { useRequireAuth } from "@/lib/use-require-auth";

interface Project {
  id: string;
  name: string;
  address: string | null;
}

export default function ProjectsScreen() {
  const auth = useRequireAuth();
  const { logout } = useAuth();
  const router = useRouter();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    apiJson<Project[]>("/projects")
      .then(setProjects)
      .catch(() => setError(i18n.t("common.errorGeneric")));
  }, [auth]);

  async function handleLogout(): Promise<void> {
    await logout();
    router.replace("/login");
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: i18n.t("projects.title"),
          headerRight: () => (
            <Pressable onPress={() => void handleLogout()}>
              <Text style={styles.logout}>{i18n.t("common.logout")}</Text>
            </Pressable>
          ),
        }}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      {!projects && !error && <Text style={styles.empty}>{i18n.t("common.loading")}</Text>}
      {projects && projects.length === 0 && <Text style={styles.empty}>{i18n.t("projects.empty")}</Text>}
      <FlatList
        data={projects ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Link href={`/projects/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <View style={styles.accentStripe} />
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                {item.address && <Text style={styles.cardSubtitle}>{item.address}</Text>}
              </View>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  list: { padding: 16, gap: 14 },
  card: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 12,
    backgroundColor: colors.white,
    overflow: "hidden",
    ...brutalShadow(3),
  },
  accentStripe: { width: 10, backgroundColor: colors.orange500 },
  cardBody: { flex: 1, padding: 16, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: "600", fontFamily: "Poppins_600SemiBold", color: colors.navy900 },
  cardSubtitle: { fontSize: 13, color: colors.navy600 },
  empty: { padding: 16, color: colors.navy600 },
  error: { padding: 16, color: colors.maroon700 },
  logout: { color: colors.white, fontSize: 14, marginRight: 4, fontWeight: "600", fontFamily: "Poppins_600SemiBold" },
});

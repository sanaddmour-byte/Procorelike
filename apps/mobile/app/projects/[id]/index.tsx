import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SyncStatusBar } from "@/components/SyncStatusBar";
import { i18n } from "@/lib/i18n";
import { brutalShadow, colors } from "@/lib/theme";
import { useRequireAuth } from "@/lib/use-require-auth";

const ACCENTS = [colors.orange500, colors.maroon600, colors.navy600];

export default function ProjectHomeScreen() {
  useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const links = [
    { href: `/projects/${id}/dashboard`, label: i18n.t("dashboard.title") },
    { href: `/projects/${id}/daily-log`, label: i18n.t("dailyLog.title") },
    { href: `/projects/${id}/punch-list`, label: i18n.t("punchList.title") },
    { href: `/projects/${id}/drawings`, label: i18n.t("drawings.title") },
    { href: `/projects/${id}/rfis`, label: i18n.t("rfis.title") },
    { href: `/projects/${id}/submittals`, label: i18n.t("submittals.title") },
    { href: `/projects/${id}/inspections`, label: i18n.t("inspections.title") },
    { href: `/projects/${id}/budget`, label: i18n.t("budget.title") },
    { href: `/projects/${id}/commitments`, label: i18n.t("commitments.title") },
    { href: `/projects/${id}/change-orders`, label: i18n.t("changeManagement.title") },
    { href: `/projects/${id}/billing`, label: i18n.t("billing.title") },
    { href: `/projects/${id}/meetings`, label: i18n.t("meetings.title") },
    { href: `/projects/${id}/schedule`, label: i18n.t("schedule.title") },
    { href: `/projects/${id}/safety`, label: i18n.t("safety.title") },
    { href: `/projects/${id}/tm-tickets`, label: i18n.t("tmTickets.title") },
    { href: `/projects/${id}/correspondence`, label: i18n.t("correspondence.title") },
  ];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("projects.title") }} />
      <SyncStatusBar projectId={id} />
      <View style={styles.links}>
        {links.map((link, i) => (
          <Link key={link.href} href={link.href} asChild>
            <Pressable style={styles.card}>
              <View style={[styles.accentStripe, { backgroundColor: ACCENTS[i % ACCENTS.length] }]} />
              <Text style={styles.cardTitle}>{link.label}</Text>
            </Pressable>
          </Link>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  links: { padding: 16, gap: 14 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 12,
    backgroundColor: colors.white,
    overflow: "hidden",
    ...brutalShadow(3),
  },
  accentStripe: { width: 10, alignSelf: "stretch" },
  cardTitle: { fontSize: 17, fontWeight: "600", fontFamily: "Poppins_600SemiBold", padding: 20, color: colors.navy900 },
});

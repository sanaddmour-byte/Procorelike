import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

type SubmittalStatus = "draft" | "in_review" | "approved" | "approved_as_noted" | "revise_resubmit" | "rejected" | "closed";
type ResponseCode = "approved" | "approved_as_noted" | "revise_resubmit" | "rejected" | null;

interface Review {
  id: string;
  sequenceOrder: number;
  isParallel: boolean;
  responseCode: ResponseCode;
}

interface Revision {
  id: string;
  revisionNumber: number;
  submittedDate: string;
  reviews: Review[];
}

interface PackageWithRevisions {
  id: string;
  packageNumber: number;
  revisions: Revision[];
}

interface SubmittalDetail {
  id: string;
  number: string;
  title: string;
  status: SubmittalStatus;
  packages: PackageWithRevisions[];
}

function statusLabel(status: SubmittalStatus): string {
  return {
    draft: i18n.t("submittals.statusDraft"),
    in_review: i18n.t("submittals.statusInReview"),
    approved: i18n.t("submittals.statusApproved"),
    approved_as_noted: i18n.t("submittals.statusApprovedAsNoted"),
    revise_resubmit: i18n.t("submittals.statusReviseResubmit"),
    rejected: i18n.t("submittals.statusRejected"),
    closed: i18n.t("submittals.statusClosed"),
  }[status];
}

function responseLabel(code: ResponseCode): string {
  if (!code) return i18n.t("submittals.pending");
  return {
    approved: i18n.t("submittals.responseApproved"),
    approved_as_noted: i18n.t("submittals.responseApprovedAsNoted"),
    revise_resubmit: i18n.t("submittals.responseReviseResubmit"),
    rejected: i18n.t("submittals.responseRejected"),
  }[code];
}

export default function MobileSubmittalDetailScreen() {
  const auth = useRequireAuth();
  const { submittalId } = useLocalSearchParams<{ id: string; submittalId: string }>();
  const [submittal, setSubmittal] = useState<SubmittalDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<SubmittalDetail>(`/submittals/${submittalId}`)
      .then(setSubmittal)
      .catch(() => setError(true));
  }, [auth, submittalId]);

  if (!submittal) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: submittal.number }} />
      <Text style={styles.title}>{submittal.title}</Text>
      <Text style={styles.subtitle}>{statusLabel(submittal.status)}</Text>

      <Text style={styles.viewOnlyNote}>{i18n.t("submittals.viewOnlyNote")}</Text>

      {submittal.packages.length === 0 && <Text style={styles.empty}>{i18n.t("submittals.noPackages")}</Text>}
      {submittal.packages.map((pkg) => (
        <View key={pkg.id} style={styles.packageBlock}>
          <Text style={styles.sectionTitle}>
            {i18n.t("submittals.package")} #{pkg.packageNumber}
          </Text>
          {pkg.revisions.map((rev) => (
            <View key={rev.id} style={styles.card}>
              <Text style={styles.cardTitle}>
                {i18n.t("submittals.revision")} #{rev.revisionNumber} — {rev.submittedDate.slice(0, 10)}
              </Text>
              {rev.reviews.map((review) => (
                <View key={review.id} style={styles.reviewRow}>
                  <Text style={styles.reviewText}>#{review.sequenceOrder}</Text>
                  <Text style={styles.badge}>{responseLabel(review.responseCode)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  content: { padding: 16, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "700", fontFamily: "Poppins_700Bold" },
  subtitle: { fontSize: 13, color: "#182a51" },
  viewOnlyNote: { fontSize: 12, color: "#9a3412", backgroundColor: "#fff4e6", padding: 10, borderRadius: 8, marginVertical: 8 },
  empty: { fontSize: 13, color: "#182a51" },
  packageBlock: { marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "600", fontFamily: "Poppins_600SemiBold", marginBottom: 6 },
  card: { borderWidth: 1, borderColor: "#171310", borderRadius: 8, backgroundColor: "#ffffff", shadowColor: "#171310", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, padding: 12, gap: 6, marginBottom: 8 },
  cardTitle: { fontSize: 13, fontWeight: "600", fontFamily: "Poppins_600SemiBold", color: "#080f1c" },
  reviewRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reviewText: { fontSize: 12, color: "#13213f" },
  badge: { fontSize: 11, fontFamily: "Poppins_600SemiBold", backgroundColor: "#ffe4bf", color: "#7c2d12", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  error: { fontSize: 13, color: "#731c29" },
});

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { createPunchItem } from "@/lib/db/punch-item-repo";
import { i18n } from "@/lib/i18n";
import { cachedLookup, type LocationOption, type MemberOption } from "@/lib/lookups";
import { useRequireAuth } from "@/lib/use-require-auth";

const PRIORITIES = ["low", "medium", "high"] as const;

export default function NewPunchItemScreen() {
  useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("medium");
  const [assigneeUserId, setAssigneeUserId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [photos, setPhotos] = useState<{ uri: string; filename: string; mime: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void cachedLookup<MemberOption[]>(`/projects/${id}/members`).then((m) => setMembers(m ?? []));
    void cachedLookup<LocationOption[]>(`/projects/${id}/locations`).then((l) => setLocations(l ?? []));
  }, [id]);

  /** Camera first: a snag is usually a photo of the problem, so it is one tap, not a gallery browse. */
  async function takePhoto(): Promise<void> {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setPhotos((prev) => [...prev, { uri: asset.uri, filename: asset.fileName ?? `snag-${Date.now()}.jpg`, mime: asset.mimeType ?? "image/jpeg" }]);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
  const [error, setError] = useState<string | null>(null);

  function priorityLabel(p: (typeof PRIORITIES)[number]): string {
    return { low: i18n.t("punchList.priorityLow"), medium: i18n.t("punchList.priorityMedium"), high: i18n.t("punchList.priorityHigh") }[p];
  }

  async function handleSave(): Promise<void> {
    if (!description.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const item = await createPunchItem({ projectId: id, description: description.trim(), priority, assigneeUserId, locationId, photos });
      router.replace(`/projects/${id}/punch-list/${item.id}`);
    } catch {
      setError(i18n.t("common.errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("punchList.newButton") }} />

      <Text style={styles.label}>{i18n.t("punchList.description")}</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        placeholder={i18n.t("punchList.descriptionPlaceholder")}
        multiline
      />

      <Text style={styles.label}>{i18n.t("punchList.priority")}</Text>
      <View style={styles.priorityRow}>
        {PRIORITIES.map((p) => (
          <Pressable
            key={p}
            onPress={() => setPriority(p)}
            style={[styles.priorityChip, priority === p && styles.priorityChipActive]}
          >
            <Text style={[styles.priorityChipText, priority === p && styles.priorityChipTextActive]}>{priorityLabel(p)}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>{i18n.t("punchList.location")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {locations.length === 0 && <Text style={styles.hint}>{i18n.t("punchList.noneAvailable")}</Text>}
        {locations.map((l) => (
          <Pressable key={l.id} accessibilityRole="button" accessibilityState={{ selected: locationId === l.id }} onPress={() => setLocationId(locationId === l.id ? null : l.id)} style={[styles.priorityChip, locationId === l.id && styles.priorityChipActive]}>
            <Text style={[styles.priorityChipText, locationId === l.id && styles.priorityChipTextActive]}>{l.path || l.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.label}>{i18n.t("punchList.assignee")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {members.length === 0 && <Text style={styles.hint}>{i18n.t("punchList.noneAvailable")}</Text>}
        {members.map((m) => (
          <Pressable key={m.userId} accessibilityRole="button" accessibilityState={{ selected: assigneeUserId === m.userId }} onPress={() => setAssigneeUserId(assigneeUserId === m.userId ? null : m.userId)} style={[styles.priorityChip, assigneeUserId === m.userId && styles.priorityChipActive]}>
            <Text style={[styles.priorityChipText, assigneeUserId === m.userId && styles.priorityChipTextActive]}>{m.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Pressable accessibilityRole="button" onPress={() => void takePhoto()} style={styles.photoButton}>
        <Text style={styles.photoButtonText}>{i18n.t("punchList.takePhoto")}</Text>
      </Pressable>
      {photos.length > 0 && (
        <ScrollView horizontal contentContainerStyle={styles.chipRow}>
          {photos.map((p) => (
            <Image key={p.uri} source={{ uri: p.uri }} style={styles.thumb} accessibilityIgnoresInvertColors />
          ))}
        </ScrollView>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.button, (saving || !description.trim()) && styles.buttonDisabled]}
        onPress={() => void handleSave()}
        disabled={saving || !description.trim()}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{i18n.t("common.save")}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff", padding: 16, gap: 6 },
  label: { fontSize: 13, color: "#13213f", marginTop: 8 },
  input: { borderWidth: 1, borderColor: "#171310", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 4 },
  hint: { fontSize: 13, color: "#13213f" },
  photoButton: { marginTop: 12, minHeight: 56, borderWidth: 1, borderColor: "#171310", borderRadius: 8, alignItems: "center", justifyContent: "center" },
  photoButtonText: { fontSize: 15, color: "#13213f", fontFamily: "Poppins_600SemiBold" },
  thumb: { width: 64, height: 64, borderRadius: 6 },
  priorityRow: { flexDirection: "row", gap: 8 },
  priorityChip: { borderWidth: 1, borderColor: "#171310", borderRadius: 999, paddingHorizontal: 14, minHeight: 48, justifyContent: "center" },
  priorityChipActive: { backgroundColor: "#182a51", borderColor: "#171310" },
  priorityChipText: { fontSize: 13, color: "#13213f" },
  priorityChipTextActive: { color: "#fff" },
  button: { marginTop: 20, backgroundColor: "#182a51", borderRadius: 8, minHeight: 56, justifyContent: "center", alignItems: "center" },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600", fontFamily: "Poppins_600SemiBold" },
  error: { marginTop: 8, color: "#5c1620" },
});

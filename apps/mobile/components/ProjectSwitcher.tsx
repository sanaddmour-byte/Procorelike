import { usePathname, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { i18n } from "@/lib/i18n";
import { cachedLookup } from "@/lib/lookups";
import { switchProjectPath } from "@/lib/project-switch";
import { colors } from "@/lib/theme";

interface ProjectOption {
  id: string;
  name: string;
}

/** Header button that lists the user's projects and opens the same screen type in the one they pick (plan T9, M4). */
export function ProjectSwitcher({ projectId }: { projectId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  useEffect(() => {
    void cachedLookup<ProjectOption[]>("/projects").then((p) => setProjects(p ?? []));
  }, []);

  if (projects.length < 2) return null;

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={i18n.t("projects.switch")} onPress={() => setOpen(true)} style={styles.button}>
        <Text style={styles.buttonText}>{i18n.t("projects.switch")}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            {projects.map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityState={{ selected: p.id === projectId }}
                style={[styles.option, p.id === projectId && styles.optionActive]}
                onPress={() => {
                  setOpen(false);
                  if (p.id !== projectId) router.replace(switchProjectPath(pathname, projectId, p.id));
                }}
              >
                <Text style={[styles.optionText, p.id === projectId && styles.optionTextActive]}>{p.name}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 48, paddingHorizontal: 12, justifyContent: "center" },
  buttonText: { color: colors.white, fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.white, padding: 16, gap: 8, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  option: { minHeight: 56, borderWidth: 1, borderColor: colors.ink, borderRadius: 8, paddingHorizontal: 14, justifyContent: "center" },
  optionActive: { backgroundColor: colors.navy900 },
  optionText: { fontSize: 15, color: colors.navy900 },
  optionTextActive: { color: colors.white },
});

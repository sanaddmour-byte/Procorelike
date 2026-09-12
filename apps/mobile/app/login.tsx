import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from "react-native";
import { ApiClientError, apiJson } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { saveStoredAuth, type StoredAuth } from "@/lib/auth-storage";
import { i18n } from "@/lib/i18n";

export default function LoginScreen() {
  const router = useRouter();
  const { setAuth } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(): Promise<void> {
    setError(null);
    setSubmitting(true);
    try {
      const body: { email: string; password: string; totpCode?: string } = { email, password };
      if (totpCode) body.totpCode = totpCode;
      const data = await apiJson<StoredAuth>("/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await saveStoredAuth(data);
      setAuth(data);
      router.replace("/projects");
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "totp_required") {
        setNeedsTotp(true);
        setError(i18n.t("login.totpRequired"));
      } else {
        setError(i18n.t("login.invalidCredentials"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <Text style={styles.title}>{i18n.t("appName")}</Text>
      <Text style={styles.subtitle}>{i18n.t("login.title")}</Text>

      <Text style={styles.label}>{i18n.t("login.email")}</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />

      <Text style={styles.label}>{i18n.t("login.password")}</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />

      {needsTotp && (
        <>
          <Text style={styles.label}>{i18n.t("login.totpLabel")}</Text>
          <TextInput
            style={styles.input}
            value={totpCode}
            onChangeText={setTotpCode}
            keyboardType="number-pad"
            maxLength={6}
          />
        </>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={() => void handleSubmit()}
        disabled={submitting || !email || !password}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{i18n.t("login.submit")}</Text>}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 8 },
  title: { fontSize: 28, fontWeight: "700", textAlign: "center", marginBottom: 4 },
  subtitle: { fontSize: 16, color: "#475569", textAlign: "center", marginBottom: 20 },
  label: { fontSize: 13, color: "#334155", marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  error: { color: "#dc2626", fontSize: 13, marginTop: 8 },
  button: {
    marginTop: 20,
    backgroundColor: "#0f172a",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});

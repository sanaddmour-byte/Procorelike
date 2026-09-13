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
  View,
} from "react-native";
import { ApiClientError, apiJson } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { saveStoredAuth, type StoredAuth } from "@/lib/auth-storage";
import { i18n } from "@/lib/i18n";
import { brutalShadow, colors } from "@/lib/theme";

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

      <View style={styles.card}>
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
          {submitting ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.buttonText}>{i18n.t("login.submit")}</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: colors.cream },
  title: {
    fontSize: 30,
    fontWeight: "800",
    fontFamily: "Poppins_800ExtraBold",
    textAlign: "center",
    marginBottom: 20,
    color: colors.navy900,
  },
  card: {
    gap: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 16,
    backgroundColor: colors.white,
    ...brutalShadow(4),
  },
  subtitle: { fontSize: 16, fontWeight: "600", fontFamily: "Poppins_600SemiBold", color: colors.navy800, textAlign: "center", marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "600", fontFamily: "Poppins_600SemiBold", color: colors.navy800, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  error: {
    color: colors.maroon800,
    backgroundColor: colors.maroon100,
    borderWidth: 1,
    borderColor: colors.maroon700,
    borderRadius: 8,
    padding: 8,
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Poppins_600SemiBold",
    marginTop: 8,
  },
  button: {
    marginTop: 20,
    backgroundColor: colors.orange500,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    ...brutalShadow(3),
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.ink, fontSize: 15, fontWeight: "700", fontFamily: "Poppins_700Bold" },
});

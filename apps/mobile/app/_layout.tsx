import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/poppins";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { I18nManager, Text, TextInput } from "react-native";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/lib/auth-context";
import { entityPath, type NotificationEntityData } from "@/lib/push-notifications";
import { i18n } from "@/lib/i18n";
import { colors, fonts } from "@/lib/theme";

/** Tapping a push notification (from background or a cold start) navigates straight to the RFI/Submittal/Punch Item/Change Order it's about, the same entity a tap on the web NotificationBell's matching row would open. */
function NotificationTapHandler(): null {
  const router = useRouter();

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Partial<NotificationEntityData>;
      if (!data.projectId || !data.entityType || !data.entityId || !data.summary) return;
      const path = entityPath(data as NotificationEntityData);
      if (path) router.push(path);
    });
    return () => subscription.remove();
  }, [router]);

  return null;
}

/**
 * Applies Poppins as the default font for every <Text>/<TextInput> in the
 * app without touching each screen's own styles -- React Native has no
 * global stylesheet cascade, so this is the standard way to set an
 * app-wide default typeface. Per-component style props still win, they
 * just no longer need to name a font family to get Poppins.
 */
function applyGlobalFont(): void {
  const TextAny = Text as unknown as { defaultProps?: { style?: unknown } };
  TextAny.defaultProps = TextAny.defaultProps ?? {};
  TextAny.defaultProps.style = [{ fontFamily: fonts.regular }, TextAny.defaultProps.style];

  const TextInputAny = TextInput as unknown as { defaultProps?: { style?: unknown } };
  TextInputAny.defaultProps = TextInputAny.defaultProps ?? {};
  TextInputAny.defaultProps.style = [{ fontFamily: fonts.regular }, TextInputAny.defaultProps.style];
}

/**
 * Mirrors the whole layout for Arabic (plan M5). React Native reads the direction once at launch, so the first launch
 * after the device language changes flips it and the next start shows the mirrored layout.
 */
function applyLayoutDirection(): void {
  const wantsRtl = i18n.locale.startsWith("ar");
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL !== wantsRtl) I18nManager.forceRTL(wantsRtl);
}
applyLayoutDirection();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) applyGlobalFont();
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <NotificationTapHandler />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.navy900 },
            headerTintColor: colors.white,
            headerTitleStyle: { fontFamily: fonts.bold, fontSize: 17 },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack>
      </AuthProvider>
    </ErrorBoundary>
  );
}

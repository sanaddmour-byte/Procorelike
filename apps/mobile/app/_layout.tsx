import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { Text, TextInput } from "react-native";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/lib/auth-context";
import { colors, fonts } from "@/lib/theme";

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

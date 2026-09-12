import { Stack } from "expo-router";
import { AuthProvider } from "@/lib/auth-context";

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0f172a" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "600" },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}

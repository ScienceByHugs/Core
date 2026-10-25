import { Stack } from "expo-router";
import { StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { colors } from "@/theme";

function Routes() {
  const { session } = useAuth();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="sign-in" />
      <Stack.Protected guard={Boolean(session)} redirectTo="/sign-in">
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="payments" />
        <Stack.Screen name="catalog" />
        <Stack.Screen name="finance" />
        <Stack.Screen name="analytics" />
        <Stack.Screen name="referrals" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="admin-tools" />
        <Stack.Screen name="audit" />
        <Stack.Screen name="research" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <AuthProvider>
        <Routes />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

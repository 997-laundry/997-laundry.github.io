// Root: fonts, safe areas, session; signed-out customers go to /login.
import React, { useEffect } from "react";
import { View } from "react-native";
import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold } from "@expo-google-fonts/tajawal";
import { SessionProvider, useSession } from "../lib/session";
import { Loading } from "../components/ui";
import { C } from "../lib/theme";

function Gate() {
  const { ready, token } = useSession();
  const seg = useSegments();
  useEffect(() => {
    if (!ready) return;
    const onLogin = seg[0] === "login";
    if (!token && !onLogin) router.replace("/login");
    else if (token && onLogin) router.replace("/");
  }, [ready, token, seg]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg }}><Loading /></View>;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="order/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="deliver/[id]" options={{ presentation: "modal" }} />
    </Stack>
  );
}

export default function Root() {
  const [loaded] = useFonts({ Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold });
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SessionProvider>{loaded ? <Gate /> : <View style={{ flex: 1, backgroundColor: C.bg }} />}</SessionProvider>
    </SafeAreaProvider>
  );
}

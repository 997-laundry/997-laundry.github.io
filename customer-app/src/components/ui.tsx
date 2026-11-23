// Shared building blocks in the 997 look (cards, buttons, chips, text) — direction-aware for Arabic/English.
import React from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, F, R, shadow } from "../lib/theme";
import { useSession } from "../lib/session";

export function useDir() {
  const { rtl } = useSession();
  return { rtl, row: (rtl ? "row-reverse" : "row") as "row" | "row-reverse", align: (rtl ? "right" : "left") as "right" | "left", start: rtl ? "flex-end" as const : "flex-start" as const };
}

export function T({ style, w = "r", size = 15, color = C.text, children, center, numberOfLines }: { style?: StyleProp<TextStyle>; w?: "r" | "m" | "b" | "x"; size?: number; color?: string; children: React.ReactNode; center?: boolean; numberOfLines?: number }) {
  const { align, rtl } = useDir();
  return <Text numberOfLines={numberOfLines} style={[{ fontFamily: F[w], fontSize: size, color, textAlign: center ? "center" : align, writingDirection: rtl ? "rtl" : "ltr", lineHeight: Math.round(size * 1.45) }, style]}>{children}</Text>;
}

export function Screen({ children, scroll = true, onRefresh, refreshing, pad = true }: { children: React.ReactNode; scroll?: boolean; onRefresh?: () => void; refreshing?: boolean; pad?: boolean }) {
  const ins = useSafeAreaInsets();
  const inner = <View style={[{ paddingTop: ins.top + 8, paddingBottom: 28, width: "100%", maxWidth: 680, alignSelf: "center" }, pad && { paddingHorizontal: 16 }]}>{children}</View>;
  if (!scroll) return <View style={{ flex: 1, backgroundColor: C.bg }}>{inner}</View>;
  return <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled"
    refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.blue} /> : undefined}>{inner}</ScrollView>;
}

export function Card({ children, style, onPress, tone }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; tone?: "navy" | "soft" | "gold" | "red" | "green" }) {
  const bg = tone === "navy" ? C.navy : tone === "soft" ? C.soft : tone === "gold" ? C.goldSoft : tone === "red" ? C.redSoft : tone === "green" ? C.greenSoft : C.card;
  const body = <View style={[styles.card, { backgroundColor: bg }, tone && tone !== "navy" ? { borderColor: "transparent" } : null, tone === "navy" ? { borderColor: C.navy } : null, style]}>{children}</View>;
  // the outer touch area takes the card's own size rules (flex) so cards in a row share the width evenly
  const flat = (StyleSheet.flatten(style) || {}) as ViewStyle;
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1, flex: flat.flex, flexBasis: flat.flex ? 0 : undefined }]}>{body}</Pressable> : body;
}

export function Btn({ title, onPress, kind = "primary", icon, disabled, loading, style }: { title: string; onPress: () => void; kind?: "primary" | "wa" | "ghost" | "gold" | "danger"; icon?: string; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle> }) {
  const { row } = useDir();
  const bg = kind === "primary" ? C.navy : kind === "wa" ? C.wa : kind === "gold" ? C.gold : kind === "danger" ? C.redSoft : "transparent";
  const fg = kind === "ghost" ? C.navy : kind === "danger" ? C.red : "#fff";
  return (
    <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, flexDirection: row, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }, kind === "ghost" && { borderWidth: 1.5, borderColor: C.line }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <>
        {icon ? <Text style={{ fontSize: 18 }}>{icon}</Text> : null}
        <Text style={{ color: fg, fontFamily: F.b, fontSize: 16 }}>{title}</Text>
      </>}
    </Pressable>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && { backgroundColor: C.navy, borderColor: C.navy }]}>
      <Text style={{ fontFamily: on ? F.b : F.m, fontSize: 14, color: on ? "#fff" : C.text }}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children, style, gap = 8 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  const { row } = useDir();
  return <View style={[{ flexDirection: row, alignItems: "center", gap }, style]}>{children}</View>;
}

export function Badge({ label, color = C.blue, bg = C.soft }: { label: string; color?: string; bg?: string }) {
  return <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ color, fontFamily: F.b, fontSize: 12 }}>{label}</Text></View>;
}

export function Section({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <Row style={{ justifyContent: "space-between", marginTop: 22, marginBottom: 10 }}>
      <T w="x" size={18}>{title}</T>
      {action ? <Pressable onPress={onAction}><T w="b" size={14} color={C.blue}>{action}</T></Pressable> : null}
    </Row>
  );
}

export function Loading({ label }: { label?: string }) {
  return <View style={{ padding: 40, alignItems: "center", gap: 10 }}><ActivityIndicator color={C.blue} size="large" />{label ? <T color={C.muted} center>{label}</T> : null}</View>;
}

export function Empty({ icon, text }: { icon: string; text: string }) {
  return <View style={{ alignItems: "center", padding: 28, gap: 8 }}><Text style={{ fontSize: 40 }}>{icon}</Text><T color={C.muted} center>{text}</T></View>;
}

export function Logo({ size = 88, white }: { size?: number; white?: boolean }) {
  return <Image source={white ? require("../../assets/logo-white.png") : require("../../assets/logo.png")} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="997 Laundry" />;
}

export function Divider() { return <View style={{ height: 1, backgroundColor: C.line, marginVertical: 10 }} />; }

const styles = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: R.l, padding: 16, borderWidth: 1, borderColor: C.line, ...shadow },
  btn: { minHeight: 52, borderRadius: R.m, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, gap: 8 },
  chip: { borderWidth: 1.5, borderColor: C.line, backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
});

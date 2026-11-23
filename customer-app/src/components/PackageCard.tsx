import React from "react";
import { View } from "react-native";
import { Card, Row, T, useDir } from "./ui";
import { C } from "../lib/theme";
import { useSession } from "../lib/session";
import type { Pkg } from "../lib/types";

export function PackageCard({ p }: { p: Pkg }) {
  const { t } = useSession(); const { start } = useDir();
  const pct = p.total ? Math.max(0, Math.min(1, p.left / p.total)) : 0;
  return (
    <Card tone="gold" style={{ marginBottom: 12 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <T w="x" size={16} style={{ flex: 1 }}>🎟 {p.name}</T>
        {p.expired ? <T w="b" color={C.red} size={13}>⛔</T> : null}
      </Row>
      <Row style={{ marginTop: 8, alignItems: "flex-end" }} gap={6}>
        <T w="x" size={34} color={C.navy}>{p.left}</T>
        <T color={C.muted} style={{ marginBottom: 6 }}>{t("piecesLeft")} {t("of")} {p.total}</T>
      </Row>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: "#efe3c4", marginTop: 6, overflow: "hidden", alignItems: start }}>
        <View style={{ width: `${pct * 100}%`, height: 10, backgroundColor: C.gold, borderRadius: 5 }} />
      </View>
      <Row style={{ justifyContent: "space-between", marginTop: 10, flexWrap: "wrap" }}>
        <T size={13} color={C.muted}>⏳ {p.expiresAt ? `${t("expires")} ${p.expiresAt}` : t("noExpiry")}</T>
        {p.trips > 0 ? <T size={13} color={C.muted}>🚚 {p.trips} {t("freeTrips")} {p.tripsPeriod === "total" ? t("forPackage") : t("perMonth")}</T> : null}
      </Row>
    </Card>
  );
}

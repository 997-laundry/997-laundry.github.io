// 💳 The electronic loyalty card: tier colours, card number, points & their value, progress to the next tier.
import React from "react";
import { Linking, Pressable, View } from "react-native";
import { Row, T, useDir } from "./ui";
import { F } from "../lib/theme";
import { useSession } from "../lib/session";
import { money } from "../lib/i18n";
import { SHOP_WHATSAPP } from "../lib/config";
import type { Loyalty } from "../lib/types";

const BG: Record<string, [string, string]> = { bronze: ["#8a5a2b", "#c08a4e"], silver: ["#5b6b7a", "#9fb0bf"], gold: ["#9a7413", "#d8b44a"], platinum: ["#0f2a44", "#2f8eb8"] };
const ICON: Record<string, string> = { bronze: "🥉", silver: "🥈", gold: "🥇", platinum: "💎" };

export function LoyaltyCard({ l, compact }: { l: Loyalty; compact?: boolean }) {
  const { t, lang, catalog } = useSession(); const { start } = useDir();
  const [a, b] = BG[l.tier] || BG.bronze;
  const tierName = lang === "ar" ? l.tierAr : l.tierEn;
  const pct = l.next ? Math.max(0.04, Math.min(1, l.spent90 / (l.spent90 + l.next.need || 1))) : 1;
  const wa = (catalog && catalog.shop.phone) || SHOP_WHATSAPP;
  const how = t("loyaltyHow").replace("{perBD}", String(l.perBD)).replace("{rp}", String(l.redeemPoints)).replace("{rv}", l.redeemValue.toFixed(3));
  return (
    <View style={{ borderRadius: 22, padding: 18, marginTop: 12, backgroundColor: a, overflow: "hidden" }}>
      <View style={{ position: "absolute", width: 220, height: 220, borderRadius: 110, backgroundColor: b, opacity: 0.55, top: -90, [start === "flex-end" ? "left" : "right"]: -70 } as any} />
      <Row style={{ justifyContent: "space-between" }}>
        <T color="#fff" w="b" size={14}>💳 {t("loyaltyCard")}</T>
        <T color="#fff" w="x" size={15}>{ICON[l.tier] || "⭐"} {tierName}</T>
      </Row>
      <Row style={{ marginTop: 10, alignItems: "flex-end" }} gap={6}>
        <T color="#fff" w="x" size={38} style={{ fontFamily: F.x }}>{l.points.toLocaleString("en-US")}</T>
        <T color="#ffffffdd" style={{ marginBottom: 8 }}>{t("points")}{l.value > 0 ? ` · ${t("worth")} ${money(l.value, lang)}` : ""}</T>
      </Row>
      <T color="#ffffffcc" size={13} style={{ letterSpacing: 2 }}>{l.cardNo}</T>
      {l.next ? (
        <View style={{ marginTop: 10 }}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: "#ffffff40", overflow: "hidden", alignItems: start }}><View style={{ width: `${pct * 100}%`, height: 6, backgroundColor: "#fff", borderRadius: 3 }} /></View>
          <T color="#ffffffdd" size={12} style={{ marginTop: 4 }}>{lang === "ar" ? `${t("toNext")} ${money(l.next.need, lang)} ${t("forTier")} ${l.next.ar}` : `${money(l.next.need, lang)} ${t("forTier")} ${l.next.en}`}</T>
        </View>
      ) : null}
      {!compact ? <>
        <T color="#ffffffdd" size={12} style={{ marginTop: 10 }}>💙 {t("commitment")}: {l.commitment}%</T>
        <T color="#ffffffcc" size={12} style={{ marginTop: 6 }}>{how}</T>
        {l.points >= l.redeemPoints ? (
          <Pressable onPress={() => Linking.openURL(`https://wa.me/${wa}?text=${encodeURIComponent(lang === "ar" ? `هلا، أبي أستبدل نقاط بطاقة الولاء (${l.cardNo}) — رصيدي ${l.points} نقطة` : `Hi, I'd like to redeem my loyalty points (${l.cardNo}) — ${l.points} points`)}`)}
            style={{ marginTop: 12, backgroundColor: "#fff", borderRadius: 12, paddingVertical: 11, alignItems: "center" }}>
            <T w="b" color={a} center>🎁 {t("redeem")}</T>
          </Pressable>
        ) : null}
      </> : null}
    </View>
  );
}

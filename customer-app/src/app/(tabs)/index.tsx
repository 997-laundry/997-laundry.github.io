// Home: greeting, money banner, live orders with progress, package, pending requests, quick actions.
import React from "react";
import { Linking, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "../../lib/session";
import { Badge, Btn, Card, Empty, Loading, Logo, Row, Screen, Section, T } from "../../components/ui";
import { OrderCard } from "../../components/OrderCard";
import { PackageCard } from "../../components/PackageCard";
import { C } from "../../lib/theme";
import { bhToday, dayLabel, money, slotKey } from "../../lib/i18n";
import { SHOP_WHATSAPP } from "../../lib/config";

export default function HomeScreen() {
  const { t, lang, home, homeError, loadingHome, refreshHome, catalog } = useSession();
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Bahrain" }).format(new Date()));
  const wa = (catalog && catalog.shop.phone) || SHOP_WHATSAPP;
  if (!home) return <Screen>{homeError ? <><Empty icon="📡" text={t(homeError === "offline" ? "offline" : "error")} /><Btn title={t("retry")} onPress={refreshHome} /></> : <Loading label={t("loading")} />}</Screen>;
  // «أم أحمد» / «بو علي» stay whole; otherwise the first name only
  const parts = (home.customer.name || "").trim().split(/\s+/);
  const first = /^(أم|ام|أبو|ابو|بو|بن|عبد|Um|Umm|Abu|Bu)$/i.test(parts[0] || "") || parts.length <= 2 && parts.join(" ").length <= 12 ? parts.slice(0, 2).join(" ") : parts[0];
  return (
    <Screen onRefresh={refreshHome} refreshing={loadingHome}>
      <Card tone="navy" style={{ paddingVertical: 20 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <T color="#bcd7e8" size={14}>{h < 12 ? t("morning") : t("evening")} 👋</T>
            <T color="#fff" w="x" size={24}>{t("hello")} {first}</T>
            <T color="#bcd7e8" size={13} style={{ marginTop: 2 }}>{t("tagline")}</T>
          </View>
          <Logo size={64} white />
        </Row>
      </Card>

      {home.debt > 0 || home.owedTotal > 0 ? (
        <Card tone="red" style={{ marginTop: 12 }}>
          <Row style={{ justifyContent: "space-between" }}><T w="b" color={C.red}>💳 {t("debtBanner")}</T><T w="x" size={18} color={C.red}>{money(Math.max(home.debt, home.owedTotal), lang)}</T></Row>
        </Card>
      ) : home.credit > 0 ? (
        <Card tone="green" style={{ marginTop: 12 }}>
          <Row style={{ justifyContent: "space-between" }}><T w="b" color={C.green}>💙 {t("creditBanner")}</T><T w="x" size={18} color={C.green}>{money(home.credit, lang)}</T></Row>
        </Card>
      ) : null}

      <Row style={{ marginTop: 14 }} gap={10}>
        <Card onPress={() => router.push("/book")} style={{ flex: 1, alignItems: "center", paddingVertical: 16, paddingHorizontal: 8, height: "100%" }}>
          <T size={28} center>🚚</T><T w="b" size={13} center style={{ marginTop: 4 }}>{t("bookPickup")}</T>
        </Card>
        <Card onPress={() => router.push("/prices")} style={{ flex: 1, alignItems: "center", paddingVertical: 16, paddingHorizontal: 8, height: "100%" }}>
          <T size={28} center>🏷️</T><T w="b" size={13} center style={{ marginTop: 4 }}>{t("prices")}</T>
        </Card>
        <Card onPress={() => Linking.openURL(`https://wa.me/${wa}`)} style={{ flex: 1, alignItems: "center", paddingVertical: 16, paddingHorizontal: 8, height: "100%" }}>
          <T size={28} center>💬</T><T w="b" size={13} center style={{ marginTop: 4 }}>{t("chatUs")}</T>
        </Card>
      </Row>

      {home.requests.length ? <>
        <Section title={`⏳ ${t("pending")}`} />
        {home.requests.map((r) => (
          <Card key={r.id} tone="soft" style={{ marginBottom: 10 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <T w="b">{r.kind === "pickup" ? `🚚 ${t("pickupReq")}` : `📦 ${t("dropReq")} #${r.orderNumber}`}</T>
              <Badge label={r.confirmed ? t("confirmedReq") : t("awaiting")} color={r.confirmed ? C.green : C.orange} bg={r.confirmed ? C.greenSoft : C.orangeSoft} />
            </Row>
            <T color={C.muted} size={14} style={{ marginTop: 4 }}>⏰ {dayLabel(r.date, lang, bhToday())} · {t(slotKey(r.slot))}</T>
            {r.address ? <T color={C.muted} size={13} numberOfLines={1}>📍 {r.address}</T> : null}
          </Card>
        ))}
      </> : null}

      <Section title={t("activeOrders")} action={home.recent.length ? t("allOrders") : undefined} onAction={() => router.push("/orders")} />
      {home.active.length ? home.active.map((o) => <OrderCard key={o.id} o={o} />) : <Card><Empty icon="🧺" text={t("noActive")} /></Card>}

      {home.packages.length ? <>
        <Section title={`🎟 ${t("myPackage")}`} />
        {home.packages.map((p) => <PackageCard key={p.id} p={p} />)}
      </> : null}
    </Screen>
  );
}

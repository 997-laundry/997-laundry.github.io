import React from "react";
import { Alert, Linking, Platform, Pressable, View } from "react-native";
import Constants from "expo-constants";
import { useSession } from "../../lib/session";
import { Btn, Card, Chip, Divider, Row, Screen, Section, T } from "../../components/ui";
import { PackageCard } from "../../components/PackageCard";
import { C } from "../../lib/theme";
import { money } from "../../lib/i18n";
import { SHOP_WHATSAPP, SITE_URL } from "../../lib/config";

export default function AccountScreen() {
  const { t, lang, setLang, home, catalog, signOut } = useSession();
  const c = home?.customer;
  const out = () => {
    if (Platform.OS === "web") { if (globalThis.confirm ? globalThis.confirm(t("logoutQ")) : true) signOut(); return; }
    Alert.alert(t("logout"), t("logoutQ"), [{ text: t("no"), style: "cancel" }, { text: t("yes"), style: "destructive", onPress: signOut }]);
  };
  const phone = (catalog && catalog.shop.phone) || SHOP_WHATSAPP;
  return (
    <Screen>
      <T w="x" size={26}>{t("account")}</T>
      <Card style={{ marginTop: 12 }}>
        <T w="x" size={20}>👤 {c?.name || "—"}</T>
        <T color={C.muted} style={{ marginTop: 4 }}>{t("phone")}: <T w="b">{c?.phone ? `+${c.phone}` : "—"}</T></T>
        {c?.area || c?.address ? <T color={C.muted} size={14} style={{ marginTop: 2 }}>📍 {[c?.area, c?.address].filter(Boolean).join(" — ")}</T> : null}
        <Divider />
        <Row style={{ justifyContent: "space-between" }}>
          <T w="b">{t("balance")}</T>
          <T w="x" color={(home?.balance || 0) < 0 ? C.red : C.green}>{money(Math.abs(home?.balance || 0), lang)}{(home?.balance || 0) < 0 ? ` (${t("owed")})` : ""}</T>
        </Row>
      </Card>
      {home?.packages.length ? <><Section title={`🎟 ${t("myPackage")}`} />{home.packages.map((p) => <PackageCard key={p.id} p={p} />)}</> : null}
      <Section title={`🌐 ${t("language")}`} />
      <Row><Chip label="العربية" on={lang === "ar"} onPress={() => setLang("ar")} /><Chip label="English" on={lang === "en"} onPress={() => setLang("en")} /></Row>
      <Section title={`🏪 ${t("shopInfo")}`} />
      <Card>
        <T w="b">{lang === "ar" ? catalog?.shop.nameAr : catalog?.shop.nameEn || "997 Laundry"}</T>
        <T color={C.muted} size={14}>📍 {catalog?.shop.area}{catalog?.shop.address ? ` — ${catalog.shop.address}` : ""}</T>
        <T color={C.muted} size={14}>🕐 {t("hours")}: {catalog?.shop.hours}</T>
        <Row style={{ marginTop: 12 }} gap={10}>
          <Btn kind="wa" icon="💬" title="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${phone}`)} style={{ flex: 1, minHeight: 46 }} />
          <Btn kind="ghost" icon="📞" title={t("callShop")} onPress={() => Linking.openURL(`tel:+${phone}`)} style={{ flex: 1, minHeight: 46 }} />
        </Row>
      </Card>
      <Pressable onPress={() => Linking.openURL(`${SITE_URL}privacy.html`)} style={{ marginTop: 16 }}><T color={C.blue} w="b">🔒 {t("privacy")}</T></Pressable>
      <View style={{ height: 18 }} />
      <Btn kind="danger" title={t("logout")} onPress={out} />
      <T size={12} color={C.faint} center style={{ marginTop: 14 }}>{t("version")} {Constants.expoConfig?.version || "1.0.0"}</T>
    </Screen>
  );
}

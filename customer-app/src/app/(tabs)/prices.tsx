// Price list (from the shop's live prices) with search and service filter, then the packages with a WhatsApp subscribe.
import React, { useMemo, useState } from "react";
import { Linking, TextInput, View } from "react-native";
import { useSession } from "../../lib/session";
import { Badge, Btn, Card, Chip, Divider, Loading, Row, Screen, Section, T, useDir } from "../../components/ui";
import { C, F, R } from "../../lib/theme";
import { money } from "../../lib/i18n";
import { SHOP_WHATSAPP } from "../../lib/config";

export default function PricesScreen() {
  const { t, lang, catalog, refreshCatalog } = useSession();
  const { align, rtl } = useDir();
  const [q, setQ] = useState(""), [svc, setSvc] = useState("");
  const items = useMemo(() => (catalog?.items || []).filter((x) => (!svc || x.prices[svc]) && (!q || `${x.ar} ${x.en}`.toLowerCase().includes(q.toLowerCase()))), [catalog, q, svc]);
  if (!catalog) return <Screen onRefresh={refreshCatalog}><Loading /></Screen>;
  const svcName = (id: string) => { const s = catalog.services.find((x) => x.id === id); return s ? (lang === "ar" ? s.ar : s.en) : id; };
  const wa = catalog.shop.phone || SHOP_WHATSAPP;
  return (
    <Screen onRefresh={refreshCatalog}>
      <T w="x" size={26}>{t("prices")}</T>
      <TextInput value={q} onChangeText={setQ} placeholder={`🔍 ${t("search")}`} placeholderTextColor={C.faint}
        style={{ marginTop: 12, borderWidth: 1.5, borderColor: C.line, borderRadius: R.m, backgroundColor: "#fff", paddingHorizontal: 14, height: 50, fontFamily: F.m, fontSize: 16, textAlign: align, writingDirection: rtl ? "rtl" : "ltr" } as any} />
      <Row style={{ flexWrap: "wrap", marginTop: 10 }}>
        <Chip label={t("servicesAll")} on={!svc} onPress={() => setSvc("")} />
        {catalog.services.map((s) => <Chip key={s.id} label={lang === "ar" ? s.ar : s.en} on={svc === s.id} onPress={() => setSvc(s.id)} />)}
      </Row>
      <Card style={{ marginTop: 12, paddingVertical: 6 }}>
        {items.map((x, i) => (
          <View key={x.id}>
            {i ? <Divider /> : null}
            <Row style={{ justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 2 }}>
              <T w="b" style={{ flex: 1 }}>{lang === "ar" ? x.ar : x.en}</T>
              <View style={{ alignItems: rtl ? "flex-start" : "flex-end", gap: 2 }}>
                {Object.entries(x.prices).filter(([s]) => !svc || s === svc).map(([s, p]) => (
                  <T key={s} size={13} color={C.muted}>{svcName(s)}: <T w="x" size={14} color={C.navy}>{money(p, lang)}</T></T>
                ))}
              </View>
            </Row>
          </View>
        ))}
      </Card>

      {catalog.packages.length ? <>
        <Section title={`🎟 ${t("packages")}`} />
        {catalog.packages.map((p) => (
          <Card key={p.id} style={{ marginBottom: 12 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <T w="x" size={16} style={{ flex: 1 }}>{p.name}</T>
              <T w="x" size={20} color={C.navy}>{money(p.price, lang)}</T>
            </Row>
            <Row style={{ flexWrap: "wrap", marginTop: 8 }} gap={6}>
              <Badge label={`${p.pieces} ${t("pcs")}`} />
              <Badge label={`${money(p.perPiece, lang)} ${t("perPiece")}`} color={C.green} bg={C.greenSoft} />
              {p.validDays ? <Badge label={`⏳ ${p.validDays} ${t("days")}`} color={C.muted} bg="#eef2f5" /> : null}
              {p.trips ? <Badge label={`🚚 ${p.trips} ${t("trips")}`} color={C.blue} bg={C.soft} /> : null}
              {p.bonus ? <Badge label={`🎁 ${p.bonus}`} color={C.gold} bg={C.goldSoft} /> : null}
            </Row>
            <Btn kind="ghost" icon="💬" title={t("subscribe")} style={{ marginTop: 12, minHeight: 44 }}
              onPress={() => Linking.openURL(`https://wa.me/${wa}?text=${encodeURIComponent(lang === "ar" ? `هلا، أبي أشترك في ${p.name} (${money(p.price, lang)})` : `Hi, I'd like to subscribe to ${p.name} (${money(p.price, lang)})`)}`)} />
          </Card>
        ))}
      </> : null}
    </Screen>
  );
}

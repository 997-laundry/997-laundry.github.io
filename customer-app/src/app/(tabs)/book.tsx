// Book a home pickup: where (area, address or GPS), when (day + time), deliver back?, note → lands on the shop's
// delivery page as a request; the shop confirms the time on WhatsApp.
import React, { useState } from "react";
import { Switch, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "../../lib/session";
import { api } from "../../lib/api";
import { AddressForm, useWhere } from "../../components/AddressForm";
import { Btn, Card, Empty, Row, Screen, T } from "../../components/ui";
import { C } from "../../lib/theme";
import { money } from "../../lib/i18n";

export default function BookScreen() {
  const { t, lang, token, home, catalog, refreshHome } = useSession();
  const [w, set] = useWhere(home?.customer.area || "", home?.customer.address || "");
  const [drop, setDrop] = useState(true), [busy, setBusy] = useState(false), [done, setDone] = useState<"" | "ok" | "already">(""), [err, setErr] = useState("");
  const hasPkg = !!home?.packages.length, d = catalog?.delivery;
  const submit = async () => {
    setErr("");
    if (!w.address.trim() && !w.area.trim() && !w.location) { setErr(t("addressPh")); return; }
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; already?: boolean }>("book_pickup", { ...w, drop }, token);
      setDone(r.already ? "already" : "ok"); refreshHome();
    } catch { setErr(t("error")); } finally { setBusy(false); }
  };
  if (done) return (
    <Screen>
      <Card style={{ marginTop: 40, alignItems: "center", paddingVertical: 30 }}>
        <Empty icon={done === "ok" ? "✅" : "👍"} text={done === "ok" ? t("booked") : t("already")} />
        {done === "ok" ? <T color={C.muted} center>{t("bookedSub")}</T> : null}
      </Card>
      <Btn title={t("tabHome")} onPress={() => { setDone(""); router.push("/"); }} style={{ marginTop: 16 }} />
    </Screen>
  );
  return (
    <Screen>
      <T w="x" size={26}>{t("bookPickup")}</T>
      <T color={C.muted} style={{ marginBottom: 16 }}>{t("bookSub")}</T>
      {d ? (
        <Card tone="soft" style={{ marginBottom: 16 }}>
          <T size={14}>🚚 {t("feeNote")}: <T w="b" size={14}>{hasPkg ? t("freeWithPkg") : money(d.fee, lang)}</T>{!hasPkg && d.pkgFree > 0 ? ` · 🎟 ${t("freeWithPkg")}` : ""}</T>
        </Card>
      ) : null}
      <Card>
        <AddressForm w={w} set={set} />
        <Row style={{ justifyContent: "space-between", marginTop: 4 }}>
          <T w="b" style={{ flex: 1 }}>📦 {t("deliverBack")}</T>
          <Switch value={drop} onValueChange={setDrop} trackColor={{ true: C.blue, false: C.line }} />
        </Row>
      </Card>
      {err ? <T color={C.red} style={{ marginTop: 10 }}>{err}</T> : null}
      <View style={{ height: 14 }} />
      <Btn icon="✓" title={t("confirmBooking")} onPress={submit} loading={busy} />
    </Screen>
  );
}

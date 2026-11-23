// Ask the shop to deliver a ready order home (the shop confirms the time on WhatsApp).
import React, { useState } from "react";
import { Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSession } from "../../lib/session";
import { api } from "../../lib/api";
import { AddressForm, useWhere } from "../../components/AddressForm";
import { Btn, Card, Empty, Screen, T } from "../../components/ui";
import { C } from "../../lib/theme";

export default function DeliverScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, token, home, refreshHome } = useSession();
  const [w, set] = useWhere(home?.customer.area || "", home?.customer.address || "");
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [err, setErr] = useState("");
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const send = async () => {
    setBusy(true); setErr("");
    try { await api("request_delivery", { orderId: id, ...w }, token); setDone(true); refreshHome(); } catch { setErr(t("error")); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <Pressable onPress={back} style={{ marginBottom: 10 }}><T w="b" color={C.blue}>{lang === "ar" ? "→" : "←"} {t("back")}</T></Pressable>
      <T w="x" size={24} style={{ marginBottom: 12 }}>🚚 {t("deliverHome")}</T>
      {done ? <Card style={{ alignItems: "center" }}><Empty icon="✅" text={t("requestSent")} /><T color={C.muted} center>{t("bookedSub")}</T><Btn title={t("close")} onPress={back} style={{ marginTop: 14, alignSelf: "stretch" }} /></Card> : <>
        <Card><AddressForm w={w} set={set} /></Card>
        {err ? <T color={C.red} style={{ marginTop: 10 }}>{err}</T> : null}
        <Btn icon="✓" title={t("confirmBooking")} onPress={send} loading={busy} style={{ marginTop: 14 }} />
      </>}
    </Screen>
  );
}

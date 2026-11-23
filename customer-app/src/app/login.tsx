// Sign in with WhatsApp: the server issues a one-time code, WhatsApp opens with it ready to send to the shop,
// and the app checks every few seconds until the shop's WhatsApp has received it. No password, no SMS.
import React, { useEffect, useRef, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { api, ApiError } from "../lib/api";
import { useSession } from "../lib/session";
import { Btn, Card, Logo, Row, Screen, T } from "../components/ui";
import { C } from "../lib/theme";

interface Start { code: string; nonce: string; expiresAt: number; link: string }

export default function Login() {
  const { t, lang, setLang, signIn } = useSession();
  const [start, setStart] = useState<Start | null>(null);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const go = async () => {
    setErr(""); setBusy(true);
    try {
      const s = await api<Start>("login_start", { lang });
      setStart(s);
      Linking.openURL(s.link).catch(() => {});
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(async () => {
        if (Date.now() > s.expiresAt) { clearInterval(timer.current!); setStart(null); setErr(t("loginExpired")); return; }
        try {
          const r = await api<{ ok: boolean; token?: string }>("login_check", { code: s.code, nonce: s.nonce });
          if (r.ok && r.token) { clearInterval(timer.current!); await signIn(r.token); }
        } catch (e) { if (e instanceof ApiError && (e.status === 410 || e.status === 400)) { clearInterval(timer.current!); setStart(null); setErr(t("loginExpired")); } }
      }, 3000);
    } catch { setErr(t("loginErr")); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <Row style={{ justifyContent: "flex-end" }}>
        <Pressable onPress={() => setLang(lang === "ar" ? "en" : "ar")} accessibilityRole="button"><T w="b" color={C.blue}>{lang === "ar" ? "English" : "العربية"}</T></Pressable>
      </Row>
      <View style={{ alignItems: "center", marginTop: 18 }}>
        <Logo size={124} />
        <T w="x" size={26} center style={{ marginTop: 14 }}>{t("loginTitle")}</T>
        <T color={C.muted} center style={{ marginTop: 6, maxWidth: 360 }}>{t("loginSub")}</T>
      </View>
      <Card style={{ marginTop: 26 }}>
        {[t("loginHow1"), t("loginHow2"), t("loginHow3")].map((s, i) => (
          <Row key={i} style={{ marginBottom: i < 2 ? 12 : 0 }} gap={12}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.soft, alignItems: "center", justifyContent: "center" }}><T w="x" color={C.blue} center>{i + 1}</T></View>
            <T style={{ flex: 1 }}>{s}</T>
          </Row>
        ))}
      </Card>
      <Btn kind="wa" icon="💬" title={t("loginBtn")} onPress={go} loading={busy} style={{ marginTop: 20 }} />
      {start ? (
        <Card tone="soft" style={{ marginTop: 16, alignItems: "center" }}>
          <T w="b" center color={C.navy}>⏳ {t("loginWaiting")}</T>
          <T size={13} color={C.muted} center style={{ marginTop: 6 }}>{t("loginCode")}: <T w="x" size={15} color={C.navy}>{start.code}</T></T>
          <Pressable onPress={() => Linking.openURL(start.link)} style={{ marginTop: 10 }}><T w="b" color={C.blue} center>{t("loginResend")}</T></Pressable>
        </Card>
      ) : null}
      {err ? <T color={C.red} center style={{ marginTop: 14 }}>{err}</T> : null}
      <T size={12} color={C.faint} center style={{ marginTop: 26 }}>🔒 {t("loginPrivacy")}</T>
    </Screen>
  );
}

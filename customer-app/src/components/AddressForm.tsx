// Where & when: area, address (or GPS), day chips (today … +6), time slots — used for pickups and deliveries.
import React, { useState } from "react";
import { Platform, TextInput, View } from "react-native";
import * as Location from "expo-location";
import { Btn, Chip, Row, T, useDir } from "./ui";
import { C, F, R } from "../lib/theme";
import { useSession } from "../lib/session";
import { bhToday, dayLabel, slotKey } from "../lib/i18n";
import type { Slot } from "../lib/types";

export interface Where { area: string; address: string; location: string; date: string; slot: Slot; notes: string }
const SLOTS: Slot[] = ["morning", "noon", "evening", "night"];
const addDays = (ymd: string, n: number) => { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export function nowSlot(): Slot {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Bahrain" }).format(new Date()));
  return h < 10 ? "morning" : h < 14 ? "noon" : h < 18 ? "evening" : "night";
}
export function useWhere(area = "", address = ""): [Where, (p: Partial<Where>) => void] {
  const [w, setW] = useState<Where>({ area, address, location: "", date: bhToday(), slot: nowSlot(), notes: "" });
  return [w, (p) => setW((x) => ({ ...x, ...p }))];
}

export function Field({ label, value, onChange, placeholder, multiline, testID }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; testID?: string }) {
  const { align, rtl } = useDir();
  return (
    <View style={{ marginBottom: 14 }}>
      <T w="b" size={14} style={{ marginBottom: 6 }}>{label}</T>
      <TextInput testID={testID} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.faint} multiline={multiline}
        style={{ borderWidth: 1.5, borderColor: C.line, borderRadius: R.m, backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 12, minHeight: multiline ? 80 : 50,
          fontFamily: F.m, fontSize: 16, color: C.text, textAlign: align, writingDirection: rtl ? "rtl" : "ltr", textAlignVertical: multiline ? "top" : "center" } as any} />
    </View>
  );
}

export function AddressForm({ w, set, withNotes = true }: { w: Where; set: (p: Partial<Where>) => void; withNotes?: boolean }) {
  const { t, lang } = useSession();
  const [locBusy, setLocBusy] = useState(false), [locErr, setLocErr] = useState("");
  const today = bhToday();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const locate = async () => {
    setLocBusy(true); setLocErr("");
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      if (p.status !== "granted") throw new Error("denied");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      set({ location: `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}` });
    } catch { setLocErr(t("locationDenied")); }
    finally { setLocBusy(false); }
  };
  return (
    <View>
      <Field label={t("area")} value={w.area} onChange={(v) => set({ area: v })} placeholder={t("areaPh")} testID="area" />
      <Field label={t("address")} value={w.address} onChange={(v) => set({ address: v })} placeholder={t("addressPh")} testID="address" />
      <Btn kind="ghost" title={w.location ? t("locationSet") : t("useLocation")} onPress={locate} loading={locBusy} style={{ marginBottom: 6 }} />
      {locErr ? <T size={13} color={C.red} style={{ marginBottom: 6 }}>{locErr}</T> : null}
      <T w="b" size={14} style={{ marginTop: 10, marginBottom: 8 }}>{t("day")}</T>
      <Row style={{ flexWrap: "wrap" }}>{days.map((d) => <Chip key={d} label={dayLabel(d, lang, today)} on={w.date === d} onPress={() => set({ date: d })} />)}</Row>
      <T w="b" size={14} style={{ marginTop: 16, marginBottom: 8 }}>{t("time")}</T>
      <Row style={{ flexWrap: "wrap" }}>{SLOTS.map((s) => <Chip key={s} label={t(slotKey(s))} on={w.slot === s} onPress={() => set({ slot: s })} />)}</Row>
      {withNotes ? <View style={{ marginTop: 16 }}><Field label={t("notes")} value={w.notes} onChange={(v) => set({ notes: v })} placeholder={t("notesPh")} multiline testID="notes" /></View> : null}
      {Platform.OS === "web" ? null : null}
    </View>
  );
}

import React, { useCallback, useEffect, useState } from "react";
import { useSession } from "../../lib/session";
import { api } from "../../lib/api";
import { Btn, Empty, Loading, Screen, T } from "../../components/ui";
import { OrderCard } from "../../components/OrderCard";
import { router } from "expo-router";
import type { Order } from "../../lib/types";

export default function OrdersScreen() {
  const { t, token } = useSession();
  const [orders, setOrders] = useState<Order[] | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try { const r = await api<{ orders: Order[] }>("orders", {}, token); setOrders(r.orders); setErr(false); } catch { setErr(true); } finally { setBusy(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  return (
    <Screen onRefresh={load} refreshing={busy}>
      <T w="x" size={26} style={{ marginBottom: 14 }}>{t("tabOrders")}</T>
      {orders === null ? (err ? <><Empty icon="📡" text={t("error")} /><Btn title={t("retry")} onPress={load} /></> : <Loading />)
        : orders.length ? orders.map((o) => <OrderCard key={o.id} o={o} />)
        : <><Empty icon="🧺" text={t("noOrders")} /><Btn icon="🚚" title={t("bookPickup")} onPress={() => router.push("/book")} /></>}
    </Screen>
  );
}

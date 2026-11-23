// App-wide state: the customer's session token, language, the public price list and the home data.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { I18nManager } from "react-native";
import { api, ApiError } from "./api";
import { getItem, removeItem, setItem } from "./storage";
import { DICT, TKey } from "./i18n";
import type { Catalog, Home, Lang } from "./types";

// Layout direction is handled by the app itself (Arabic ⇄ English without restarting), so the OS must not flip it.
try { I18nManager.allowRTL(false); I18nManager.forceRTL(false); } catch { /* web */ }

interface S {
  ready: boolean; token: string | null; lang: Lang; rtl: boolean; t: (k: TKey) => string;
  catalog: Catalog | null; home: Home | null; homeError: string; loadingHome: boolean;
  setLang: (l: Lang) => void; signIn: (token: string) => Promise<void>; signOut: () => Promise<void>;
  refreshHome: () => Promise<void>; refreshCatalog: () => Promise<void>;
}
const Ctx = createContext<S | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [lang, setLangState] = useState<Lang>("ar");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [home, setHome] = useState<Home | null>(null);
  const [homeError, setHomeError] = useState("");
  const [loadingHome, setLoadingHome] = useState(false);

  useEffect(() => {
    (async () => {
      const [t, l, cached] = await Promise.all([getItem("l997c_token"), getItem("l997c_lang"), getItem("l997c_catalog")]);
      if (l === "en" || l === "ar") setLangState(l);
      if (cached) { try { setCatalog(JSON.parse(cached)); } catch { /* ignore */ } }
      setToken(t); setReady(true);
    })();
  }, []);

  const refreshCatalog = useCallback(async () => {
    try { const c = await api<Catalog>("catalog", { lang }); setCatalog(c); setItem("l997c_catalog", JSON.stringify(c)); } catch { /* keep the cached copy */ }
  }, [lang]);
  useEffect(() => { refreshCatalog(); }, [refreshCatalog]);

  const signOut = useCallback(async () => { await removeItem("l997c_token"); setToken(null); setHome(null); }, []);
  const refreshHome = useCallback(async () => {
    if (!token) return;
    setLoadingHome(true);
    try { const h = await api<Home>("home", {}, token); setHome(h); setHomeError(""); }
    catch (e) { if (e instanceof ApiError && e.status === 401) await signOut(); else setHomeError(e instanceof ApiError && e.message === "offline" ? "offline" : "error"); }
    finally { setLoadingHome(false); }
  }, [token, signOut]);
  useEffect(() => { if (token) refreshHome(); }, [token, refreshHome]);

  const value = useMemo<S>(() => ({
    ready, token, lang, rtl: lang === "ar", t: (k: TKey) => DICT[lang][k] ?? String(k),
    catalog, home, homeError, loadingHome,
    setLang: (l: Lang) => { setLangState(l); setItem("l997c_lang", l); },
    signIn: async (tk: string) => { await setItem("l997c_token", tk); setToken(tk); },
    signOut, refreshHome, refreshCatalog,
  }), [ready, token, lang, catalog, home, homeError, loadingHome, signOut, refreshHome, refreshCatalog]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useSession() { const c = useContext(Ctx); if (!c) throw new Error("SessionProvider missing"); return c; }

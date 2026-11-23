// Small key/value store: Keychain/Keystore on phones (expo-secure-store), localStorage on the web.
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const web = Platform.OS === "web";
export async function getItem(key: string): Promise<string | null> {
  try { return web ? globalThis.localStorage?.getItem(key) ?? null : await SecureStore.getItemAsync(key); } catch { return null; }
}
export async function setItem(key: string, value: string): Promise<void> {
  try { if (web) globalThis.localStorage?.setItem(key, value); else await SecureStore.setItemAsync(key, value); } catch { /* ignore */ }
}
export async function removeItem(key: string): Promise<void> {
  try { if (web) globalThis.localStorage?.removeItem(key); else await SecureStore.deleteItemAsync(key); } catch { /* ignore */ }
}

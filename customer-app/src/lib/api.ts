// The only door to the shop's data: the customer-api function (returns this customer's own data only).
import { API_URL, SUPABASE_KEY } from "./config";

export class ApiError extends Error { status: number; constructor(status: number, msg: string) { super(msg); this.status = status; } }

export async function api<T = any>(action: string, body: Record<string, unknown> = {}, token?: string | null): Promise<T> {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), 25000);
  try {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, ...(token ? { "x-customer-token": token } : {}) },
      body: JSON.stringify({ action, ...body }),
      signal: ctl?.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new ApiError(r.status, (data && data.error) || `error ${r.status}`);
    return data as T;
  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, e?.name === "AbortError" ? "timeout" : "offline");
  } finally { clearTimeout(timer); }
}

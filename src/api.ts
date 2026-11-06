import { Capacitor } from "@capacitor/core";
import type {
  CalendarEvent,
  CalendarPreferences,
  EventDraft,
  Health,
} from "../shared/contracts";

const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export const native = Capacitor.isNativePlatform();
export const serviceAddress =
  baseUrl || (native ? "尚未配置服务地址" : "当前页面的服务");
export class ApiError extends Error {}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (native && !baseUrl)
    throw new ApiError("请先配置服务地址，再连接你的 LifeFlow 服务。");
  const token = sessionStorage.getItem("lifeflow-access-token");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${baseUrl}/api${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new ApiError(body.error || `请求失败（${response.status}）`);
    }
    return response.status === 204 ? (undefined as T) : response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "暂时连接不到服务，请检查网络和电脑上的 LifeFlow 是否正在运行。",
    );
  } finally {
    clearTimeout(timeout);
  }
}
export const api = {
  health: () => request<Health>("/health"),
  preferences: () => request<CalendarPreferences>("/calendar-preferences"),
  savePreferences: (value: CalendarPreferences) =>
    request<CalendarPreferences>("/calendar-preferences", {
      method: "PUT",
      body: JSON.stringify(value),
    }),
  events: (from: string, to: string) =>
    request<{ events: CalendarEvent[] }>(
      `/events?${new URLSearchParams({ from, to })}`,
    ),
  create: (draft: EventDraft) =>
    request<{ event: CalendarEvent }>("/events", {
      method: "POST",
      body: JSON.stringify(draft),
    }),
  update: (id: string, draft: EventDraft, version: number) =>
    request<{ event: CalendarEvent }>(`/events/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ...draft, version }),
    }),
  remove: (id: string, version: number) =>
    request<void>(`/events/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ version }),
    }),
};

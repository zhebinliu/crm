'use client';
// ─── locale helpers ───────────────────────────────────────────────────────
// Stores the user's preferred *content* locale in localStorage as
// `tokenwave.locale`. Used by the api.ts interceptor to attach an
// Accept-Language header so the backend metadata endpoints (and any other
// endpoint that honours Accept-Language) return localised labels.
//
// This is independent of the UI chrome language, which remains zh-CN.

export const LOCALE_KEY = 'tokenwave.locale';

export const SUPPORTED_LOCALES = [
  { value: 'zh-CN', label: '中文', short: '中' },
  { value: 'en-US', label: 'English', short: 'EN' },
  { value: 'ja-JP', label: '日本語', short: 'JA' },
] as const;

export type LocaleValue = (typeof SUPPORTED_LOCALES)[number]['value'];

export function getLocale(): LocaleValue {
  if (typeof window === 'undefined') return 'zh-CN';
  const v = localStorage.getItem(LOCALE_KEY);
  if (v && SUPPORTED_LOCALES.some((l) => l.value === v)) return v as LocaleValue;
  return 'zh-CN';
}

export function setLocale(v: LocaleValue) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCALE_KEY, v);
  // Notify interested components in this tab.
  window.dispatchEvent(new CustomEvent('tokenwave:locale-change', { detail: v }));
}

import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import enMessages from "../messages/en.json";

export const locales = ["en", "nl"] as const;
export type Locale = (typeof locales)[number];

type Messages = Record<string, unknown>;

/**
 * English is the base for every locale: keys that haven't been translated yet
 * fall back to their English string instead of rendering a raw key path.
 */
function mergeMessages(base: Messages, override: Messages): Messages {
  const merged: Messages = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    const bothObjects =
      current !== null &&
      typeof current === "object" &&
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(current) &&
      !Array.isArray(value);

    merged[key] = bothObjects
      ? mergeMessages(current as Messages, value as Messages)
      : value;
  }

  return merged;
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get("locale")?.value;
  const locale: Locale = cookieLocale === "nl" ? "nl" : "en";

  const messages =
    locale === "en"
      ? enMessages
      : mergeMessages(
          enMessages,
          (await import(`../messages/${locale}.json`)).default,
        );

  return {
    locale,
    messages,
  };
});

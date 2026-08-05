import { redirect } from "@/i18n/navigation";

/**
 * Legacy `/identity` → `/account/identity`. Locale-aware: a reader on
 * `/es/identity` lands on `/es/account/identity`, not back in English.
 * `next-intl`'s `redirect` needs the active locale, so this reads it from the
 * route rather than hardcoding a prefix.
 */
export default async function IdentityRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/account/identity", locale });
}

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { SettingsForm } from "@/components/settings/settings-form";
import { AvatarForm } from "@/components/account/avatar-form";
import { MerchantNameForm } from "@/components/account/merchant-name-form";
import { PageHero } from "@/components/page-hero";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "settings" });
  return { title: t("metaTitle") };
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  return (
    <>
      {/*
       * Outside the reading column, not inside it.
       *
       * `PageHero` is a full-bleed band: it escapes its parent with
       * `w-screen left-1/2 -translate-x-1/2`, which lands on the viewport
       * only when the parent is the page's centred content column. Nested
       * in the `max-w-3xl` column below, it was centred on *that* instead —
       * dragged 240px left at desktop width, so the word "Settings" sat off
       * the left edge of the screen and the band stopped a quarter short of
       * the right. `body { overflow-x: clip }` meant this never showed up as
       * a scrollbar; the title was simply gone.
       */}
      <PageHero
        title={t("heroTitle")}
        description={t("heroDescription")}
      />
      {/*
       * One rhythm. The six panels here are peers — a merchant name is not a
       * bigger thing than a notification channel — but they used to sit on
       * two gaps: 32px between the three components and 24px between the
       * three panels `SettingsForm` renders internally, which grouped them
       * by which file they came from rather than by what they are. Both are
       * 24px now, so the seam between files stops being visible. The 40px
       * above is the one gap that should differ, because it separates the
       * band from the stack rather than one panel from the next.
       */}
      <section className="mt-10 max-w-3xl space-y-6">
        <MerchantNameForm />
        <AvatarForm />
        <SettingsForm />
      </section>
    </>
  );
}

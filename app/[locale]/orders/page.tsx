import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { OrdersTable } from "@/components/orders/orders-table";
import { PageHero } from "@/components/page-hero";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "orders" });
  return {
    title: t("title"),
    description: t("metaDescription"),
  };
}

export default function OrdersPage() {
  const t = useTranslations("orders");
  return (
    <section>
      <PageHero title={t("heroTitle")} description={t("heroDescription")} />
      <div className="mt-8">
        <OrdersTable />
      </div>
    </section>
  );
}

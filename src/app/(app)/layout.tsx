import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { ModelCatalogProvider } from "@/components/model-catalog-provider";
import { getModelCatalog } from "@/lib/model-catalog";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Every model selector in the app reads this, and in PROVIDER mode it is a
  // database query rather than a constant — so load it once, here.
  const catalog = await getModelCatalog();

  // The shell owns the viewport: only the content column scrolls, so the
  // sidebar stays put and the grid background never drifts.
  return (
    <ModelCatalogProvider catalog={catalog}>
      <div className="flex h-dvh overflow-hidden">
        <AppSidebar userName={session.user.name ?? session.user.email} />
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          {children}
        </main>
      </div>
    </ModelCatalogProvider>
  );
}

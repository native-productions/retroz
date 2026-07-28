import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // The shell owns the viewport: only the content column scrolls, so the
  // sidebar stays put and the grid background never drifts.
  return (
    <div className="flex h-dvh overflow-hidden">
      <AppSidebar userName={session.user.name ?? session.user.email} />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

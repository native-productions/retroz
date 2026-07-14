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

  return (
    <div className="flex flex-1 min-h-screen">
      <AppSidebar userName={session.user.name ?? session.user.email} />
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  );
}

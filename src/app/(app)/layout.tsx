import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/server";
import AppNav from "@/features/shell/AppNav";
import SessionSync from "@/features/shell/SessionSync";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-dvh w-full">
      <SessionSync />
      <AppNav
        email={user.email}
        role={user.role}
        permissions={user.permissions}
      />
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

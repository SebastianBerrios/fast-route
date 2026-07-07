import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/server";
import { getTenantLocation } from "@/features/tenants/server";
import RoutePlanner from "@/features/routing/components/RoutePlanner";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { center } = await getTenantLocation();

  return (
    <main className="h-full w-full">
      <RoutePlanner
        userId={user.id}
        permissions={user.permissions}
        defaultCenter={center ?? undefined}
      />
    </main>
  );
}

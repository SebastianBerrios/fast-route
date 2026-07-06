import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/server";
import RoutePlanner from "@/features/routing/components/RoutePlanner";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="h-full w-full">
      <RoutePlanner userId={user.id} permissions={user.permissions} />
    </main>
  );
}

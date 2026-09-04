import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminPage } from "@/lib/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdminPage();

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-border px-5 pt-5 md:px-8">
        <h1 className="page-title text-xl">Admin</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Unit economics, users and the switches that control spend.
        </p>
        <AdminNav />
      </div>
      {children}
    </div>
  );
}

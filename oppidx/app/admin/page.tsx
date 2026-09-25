import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { AdminPanel } from '@/components/ui/AdminPanel'

export default async function AdminPage() {
  const admin = await requireAuth()
  if (!admin) redirect('/auth?from=/admin')

  return <AdminPanel adminName={admin.name ?? admin.email} />
}

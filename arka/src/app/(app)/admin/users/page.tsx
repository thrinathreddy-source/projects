import type { Metadata } from "next";
import { format } from "date-fns";
import { PageBody } from "@/components/page-header";
import { UserRowActions } from "@/components/admin/user-row-actions";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { economicsFor, listUsers } from "@/lib/admin";
import { formatCredits, formatNumber, formatUsd } from "@/lib/money";

export const metadata: Metadata = { title: "Users · Admin" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminUsersPage({
  searchParams,
}: PageProps<"/admin/users">) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : undefined;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;

  const rows = await listUsers({ search, cursor, limit: PAGE_SIZE });
  const hasMore = rows.length > PAGE_SIZE;
  const users = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  const economics = await economicsFor(users.map((user) => user.id));

  return (
    <PageBody className="space-y-5">
      <form className="max-w-sm">
        <Input
          name="q"
          defaultValue={search ?? ""}
          placeholder="Search name or email, then press Enter"
        />
      </form>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Credits</TableHead>
              <TableHead className="text-right">Projects</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  No users match that.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{user.name}</span>
                      {user.role === "admin" ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Admin
                        </Badge>
                      ) : null}
                      {user.banned ? (
                        <Badge variant="destructive" className="text-[10px]">
                          Suspended
                        </Badge>
                      ) : null}
                    </div>
                    <span className="block text-xs text-muted-foreground">
                      {user.email}
                    </span>
                    {user.banned && user.banReason ? (
                      <span className="block text-xs text-destructive">
                        {user.banReason}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="capitalize">{user.planCode}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCredits(user.credits)}
                    {user.creditsHeld > 0 ? (
                      <span className="block text-xs text-muted-foreground">
                        {formatCredits(user.creditsHeld)} held
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(user._count.projects)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatUsd(economics.get(user.id)?.revenueUsdMicro ?? 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatUsd(economics.get(user.id)?.costUsdMicro ?? 0)}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${
                      (economics.get(user.id)?.marginUsdMicro ?? 0) < 0
                        ? "text-destructive"
                        : "text-foreground"
                    }`}
                  >
                    {formatUsd(economics.get(user.id)?.marginUsdMicro ?? 0)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {format(user.createdAt, "d MMM yyyy")}
                  </TableCell>
                  <TableCell>
                    <UserRowActions
                      user={{
                        id: user.id,
                        email: user.email,
                        banned: user.banned,
                        credits: user.credits,
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {hasMore ? (
        <div className="flex justify-center">
          <ButtonLink
            href={`/admin/users?cursor=${users[users.length - 1].id}${
              search ? `&q=${encodeURIComponent(search)}` : ""
            }`}
            variant="outline"
            size="sm"
          >
            Next page
          </ButtonLink>
        </div>
      ) : null}
    </PageBody>
  );
}

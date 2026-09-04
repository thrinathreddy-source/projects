"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Settings, CreditCard, ChevronsUpDown } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { resetAnalytics } from "@/components/analytics-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type UserMenuUser = {
  name: string;
  email: string;
  image: string | null;
};

export function UserMenu({ user }: { user: UserMenuUser }) {
  const router = useRouter();

  const initials =
    user.name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "A";

  async function onSignOut() {
    await authClient.signOut();
    resetAnalytics();
    router.push("/");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/50"
          />
        }
      >
        <Avatar className="size-6">
          {user.image ? <AvatarImage src={user.image} alt="" /> : null}
          <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {user.email}
          </span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings className="size-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/billing" />}>
          <CreditCard className="size-4" />
          Billing
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut}>
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

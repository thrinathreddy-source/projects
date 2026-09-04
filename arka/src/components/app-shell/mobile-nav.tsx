"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { Nav } from "@/components/app-shell/nav";
import { UserMenu, type UserMenuUser } from "@/components/app-shell/user-menu";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function MobileNav({
  isAdmin,
  user,
}: {
  isAdmin: boolean;
  user: UserMenuUser;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Open navigation" />
        }
      >
        <Menu className="size-5" />
      </SheetTrigger>

      <SheetContent side="left" className="w-[260px] p-4">
        <SheetTitle className="sr-only">Navigation</SheetTitle>

        <div className="pb-5">
          <Wordmark href="/dashboard" />
        </div>

        <div className="pb-4">
          <ButtonLink href="/generate" className="w-full" size="lg" onClick={() => setOpen(false)}>
            New video
          </ButtonLink>
        </div>

        <Nav isAdmin={isAdmin} onNavigate={() => setOpen(false)} />

        <div className="mt-6 border-t border-border pt-4">
          <UserMenu user={user} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

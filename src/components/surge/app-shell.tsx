import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BookOpen,
  Bot,
  Menu,
  Radio,
  Table2,
  Warehouse,
} from "lucide-react";
import { Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SurgeMark } from "@/components/surge/mark";
import { useSurge } from "@/lib/surge/store";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Board", icon: Activity },
  { to: "/signals", label: "Signals", icon: Radio },
  { to: "/stock", label: "Stock", icon: Warehouse },
  { to: "/agent", label: "Agent", icon: Bot },
  { to: "/matrix", label: "Matrix", icon: Table2 },
  { to: "/cases", label: "Cases", icon: BookOpen },
] as const;

function navActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

function NavList({ onPick }: { onPick?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = navActive(pathname, item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onPick}
            className={cn(
              "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="mb-6 flex items-center gap-2.5">
          <SurgeMark className="size-8" />
          <span className="text-sm font-semibold">Surge</span>
        </div>
        <NavList onPick={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const tick = useSurge((s) => s.tick);
  const hydrateReaction = useSurge((s) => s.hydrateReaction);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    hydrateReaction();
  }, [hydrateReaction]);

  useEffect(() => {
    const id = window.setInterval(() => tick(), 2000);
    return () => window.clearInterval(id);
  }, [tick]);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex min-h-dvh bg-background text-foreground">
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border p-4 md:flex">
          <div className="mb-8 flex items-center gap-2.5 px-1">
            <SurgeMark className="size-8" />
            <div>
              <div className="text-sm font-semibold tracking-tight">Surge</div>
              <div className="text-[11px] text-muted-foreground">Demand desk</div>
            </div>
          </div>
          <NavList />
          <p className="mt-auto px-1 text-[11px] leading-relaxed text-muted-foreground">
            Speed beats accuracy. Move stock where the hype is.
          </p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center gap-3 border-b border-border px-4 md:hidden">
            <MobileMenu />
            <SurgeMark className="size-7" />
            <span className="text-sm font-semibold tracking-tight">Surge</span>
          </header>

          <main className="flex-1 pb-20 md:pb-0">{children}</main>

          <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-border bg-background/95 md:hidden">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = navActive(pathname, item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <Toaster
          theme="dark"
          position="top-center"
          toastOptions={{
            className: "bg-card text-foreground border-border",
          }}
        />
      </div>
    </TooltipProvider>
  );
}

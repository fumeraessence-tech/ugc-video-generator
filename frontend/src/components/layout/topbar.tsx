"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Menu, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/hooks/use-sidebar";

const pageTitles: Record<string, string> = {
  "/chat": "Chat",
  "/explore": "Explore",
  "/categories": "Categories",
  "/library": "Library",
  "/avatars": "Avatars",
  "/settings": "Settings",
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];

  for (const [route, title] of Object.entries(pageTitles)) {
    if (pathname.startsWith(route + "/")) return title;
  }

  return "Dashboard";
}

export function Topbar() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const { open } = useSidebar();

  const title = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={open}
        aria-label="Open navigation menu"
      >
        <Menu className="size-5" />
      </Button>

      {/* Page title */}
      <h1 className="text-lg font-semibold">{title}</h1>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        aria-label="Toggle theme"
      >
        <Sun className="size-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
      </Button>
    </header>
  );
}

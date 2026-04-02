"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  Users,
  Settings,
  MessageSquare,
  LogOut,
  Trash2,
  Sparkles,
  ShieldCheck,
  ImagePlus,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/hooks/use-sidebar";
import { toast } from "sonner";

const navItems = [
  { label: "Generate", href: "/generate", icon: Sparkles, highlight: true },
  { label: "Image Generator", href: "/image-generator", icon: ImagePlus },
  { label: "Bulk Generator", href: "/bulk-generator", icon: Layers },
  { label: "Avatars", href: "/avatars", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user: authUser, signOut } = useAuth();
  const { chatHistory, close, removeChat, isCollapsed, toggleCollapse } = useSidebar();

  // Check if user is super_admin from app_metadata
  const isAdmin = authUser?.app_metadata?.role === "super_admin";

  // Build nav items dynamically
  const allNavItems = [
    ...navItems,
    ...(isAdmin ? [{ label: "Admin", href: "/admin", icon: ShieldCheck }] : []),
  ];

  const user = authUser ? {
    name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email?.split("@")[0] || "User",
    email: authUser.email || "",
    image: authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || null,
  } : null;
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const res = await fetch(`/api/chat/${chatId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete chat");

      removeChat(chatId);
      toast.success("Chat deleted");

      // If we're currently viewing this chat, redirect to /chat
      if (pathname === `/chat/${chatId}`) {
        router.push("/chat");
      }
    } catch (error) {
      console.error("Error deleting chat:", error);
      toast.error("Failed to delete chat");
    }
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200",
        isCollapsed ? "w-[60px]" : "w-[280px]"
      )}
    >
      {/* Logo + Collapse Toggle */}
      <div className="flex h-14 items-center justify-between px-3">
        {!isCollapsed && (
          <Link href="/generate" onClick={close} className="flex items-center gap-2 pl-2">
            <span className="text-xl font-bold tracking-tight text-foreground">
              UGCGen
            </span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={toggleCollapse}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </Button>
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex flex-col gap-1 px-2 py-3">
        {allNavItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Tooltip key={item.href} delayDuration={isCollapsed ? 0 : 700}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  onClick={close}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isCollapsed && "justify-center px-2",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-foreground" />
                  )}
                  <Icon className="size-4 shrink-0" />
                  {!isCollapsed && <span>{item.label}</span>}
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right">{item.label}</TooltipContent>
              )}
            </Tooltip>
          );
        })}
      </nav>

      <Separator className="mx-2" />

      {/* Spacer */}
      <div className="flex-1" />

      <Separator />

      {/* User Menu */}
      <div className="p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "h-auto w-full gap-3 px-3 py-2",
                isCollapsed ? "justify-center px-2" : "justify-start"
              )}
            >
              <Avatar size="sm">
                <AvatarImage src={user?.image ?? undefined} alt={user?.name ?? "User"} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="flex flex-col items-start text-left">
                  <span className="text-sm font-medium leading-none">
                    {user?.name ?? "User"}
                  </span>
                  <span className="text-xs text-muted-foreground leading-none mt-1">
                    {user?.email ?? ""}
                  </span>
                </div>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="size-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => signOut().then(() => router.push("/login"))}
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

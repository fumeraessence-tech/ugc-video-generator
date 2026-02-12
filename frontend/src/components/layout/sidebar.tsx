"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  Plus,
  Compass,
  FolderOpen,
  Video,
  Users,
  Settings,
  MessageSquare,
  LogOut,
  Trash2,
  Sparkles,
  Image,
  FileText,
  Music,
  Film,
  ChevronDown,
  FlaskConical,
  ShieldCheck,
  Package,
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
  { label: "Perfume Studio", href: "/perfume-studio", icon: FlaskConical },
  { label: "Product Studio", href: "/product-studio", icon: Package },
  { label: "Editor", href: "/editor", icon: Film },
  { label: "New Chat", href: "/chat", icon: Plus },
  { label: "Explore", href: "/explore", icon: Compass },
  { label: "Categories", href: "/categories", icon: FolderOpen },
  {
    label: "Library",
    href: "/library",
    icon: Video,
    subItems: [
      { label: "All Videos", href: "/library", icon: Video },
      { label: "Storyboards", href: "/library/storyboards", icon: Image },
      { label: "Scripts", href: "/library/scripts", icon: FileText },
      { label: "Audio", href: "/library/audio", icon: Music },
    ]
  },
  { label: "Avatars", href: "/avatars", icon: Users },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user: authUser, signOut } = useAuth();
  const { chatHistory, close, removeChat } = useSidebar();

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
    <div className="flex h-full w-[280px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex h-14 items-center px-5">
        <Link href="/chat" onClick={close} className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-foreground">
            UGCGen
          </span>
        </Link>
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex flex-col gap-1 px-3 py-3">
        {allNavItems.map((item) => {
          const hasSubItems = "subItems" in item && item.subItems;
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          if (hasSubItems) {
            // Expandable menu item with sub-items
            const isExpanded = pathname.startsWith(item.href);
            return (
              <div key={item.href} className="space-y-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      onClick={close}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-foreground" />
                      )}
                      <Icon className="size-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      <ChevronDown
                        className={cn(
                          "size-4 transition-transform",
                          isExpanded && "rotate-180"
                        )}
                      />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
                {/* Sub-items */}
                {isExpanded && (
                  <div className="ml-4 space-y-1 border-l border-border pl-3">
                    {item.subItems.map((subItem) => {
                      const SubIcon = subItem.icon;
                      const isSubActive = pathname === subItem.href;
                      return (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          onClick={close}
                          className={cn(
                            "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                            isSubActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                          )}
                        >
                          <SubIcon className="size-3.5 shrink-0" />
                          <span>{subItem.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // Regular menu item
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  onClick={close}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-foreground" />
                  )}
                  <Icon className="size-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <Separator className="mx-3" />

      {/* Chat History */}
      <div className="flex items-center px-5 pt-3 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
          Recent Chats
        </span>
      </div>
      <ScrollArea className="flex-1 px-3">
        <div className="flex flex-col gap-0.5 py-1">
          {chatHistory.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              No chat history yet
            </p>
          )}
          {chatHistory.map((chat) => {
            const isActive = pathname === `/chat/${chat.id}`;
            return (
              <div
                key={chat.id}
                className="group relative"
              >
                <Link
                  href={`/chat/${chat.id}`}
                  onClick={close}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <MessageSquare className="size-3.5 shrink-0" />
                  <span className="flex-1 truncate">{chat.title}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => handleDeleteChat(chat.id, e)}
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <Separator />

      {/* User Menu */}
      <div className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-auto w-full justify-start gap-3 px-3 py-2"
            >
              <Avatar size="sm">
                <AvatarImage src={user?.image ?? undefined} alt={user?.name ?? "User"} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start text-left">
                <span className="text-sm font-medium leading-none">
                  {user?.name ?? "User"}
                </span>
                <span className="text-xs text-muted-foreground leading-none mt-1">
                  {user?.email ?? ""}
                </span>
              </div>
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

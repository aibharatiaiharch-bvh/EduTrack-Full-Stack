import { Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, BookOpen, Settings, LogOut, FlaskConical, CalendarDays, Home, ChevronRight, GraduationCap } from "lucide-react";
import { useSignOut } from "@/hooks/use-sign-out";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getFeatures } from "@/config/features";
import { DevModeBanner } from "@/components/dev-mode-banner";
import { AnnouncementBanner } from "@/components/announcement-banner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getStoredRole(): string {
  const override = localStorage.getItem("edutrack_dev_role_override");
  if (override) return override;
  return localStorage.getItem("edutrack_user_role") || "tutor";
}

const ROLE_HOME: Record<string, string> = {
  tutor:     "/calendar",
  student:   "/calendar",
  parent:    "/calendar",
  principal: "/calendar",
  developer: "/admin",
  admin:     "/admin",
};

const PAGE_NAMES: Record<string, string> = {
  "/dashboard":  "Today's Classes",
  "/student":    "My Schedule",
  "/classes":    "Browse Classes",
  "/calendar":   "Class Calendar",
  "/settings":   "Settings",
  "/parent":     "My Classes",
  "/principal":  "Principal Dashboard",
  "/admin":      "Developer Tools",
  "/housekeeping": "Housekeeping",
};

function isElevatedRole(role: string) {
  return role === "principal" || role === "developer" || role === "admin";
}

function buildNavigation(role: string, features: ReturnType<typeof getFeatures>) {
  if (role === "principal") {
    return [
      {
        label: "Pages",
        items: [
          { name: "Calendar", href: "/calendar", icon: CalendarDays },
          { name: "Principal Dashboard", href: "/principal", icon: LayoutDashboard },
        ],
      },
      {
        label: "Account",
        items: [
          { name: "Settings", href: "/settings", icon: Settings },
        ],
      },
    ];
  }

  if (role === "developer" || role === "admin") {
    return [
      {
        label: "Pages",
        items: [
          { name: "Calendar", href: "/calendar", icon: CalendarDays },
          { name: "Principal Dashboard", href: "/principal", icon: LayoutDashboard },
        ],
      },
      {
        label: "Account",
        items: [
          { name: "Settings", href: "/settings", icon: Settings },
          { name: "Housekeeping", href: "/housekeeping", icon: Settings },
          { name: "Developer Tools", href: "/admin", icon: FlaskConical },
        ],
      },
    ];
  }

  if (role === "student") {
    return [
      {
        label: "Pages",
        items: [
          { name: "My Classes", href: "/student", icon: BookOpen },
          { name: "Calendar", href: "/calendar", icon: CalendarDays },
        ],
      },
      {
        label: "Account",
        items: [
          { name: "Settings", href: "/settings", icon: Settings },
        ],
      },
    ];
  }

  if (role === "parent") {
    return [
      {
        label: "Pages",
        items: [
          { name: "My Children's Classes", href: "/parent", icon: BookOpen },
          { name: "Calendar", href: "/calendar", icon: CalendarDays },
        ],
      },
      {
        label: "Account",
        items: [
          { name: "Settings", href: "/settings", icon: Settings },
        ],
      },
    ];
  }

  if (role === "tutor") {
    return [
      {
        label: "Pages",
        items: [
          { name: "My Dashboard", href: "/dashboard", icon: LayoutDashboard },
          { name: "Calendar", href: "/calendar", icon: CalendarDays },
        ],
      },
      {
        label: "Account",
        items: [
          { name: "Settings", href: "/settings", icon: Settings },
        ],
      },
    ];
  }

  return [
    {
      label: "Account",
      items: [
        { name: "Settings", href: "/settings", icon: Settings },
      ],
    },
  ];
}

export function AppSidebar() {
  const [location] = useLocation();
  const signOut = useSignOut();
  const userEmail = typeof window !== "undefined" ? localStorage.getItem("edutrack_user_email") || "" : "";
  const userName = typeof window !== "undefined" ? localStorage.getItem("edutrack_user_name") || userEmail : "";
  const initials = (userName || userEmail).slice(0, 2).toUpperCase();
  const features = getFeatures();
  const role = getStoredRole();
  const navigation = buildNavigation(role, features);

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="px-4 py-4 border-b border-sidebar-border">
        <Link href={ROLE_HOME[role] || "/"}>
          <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-white font-bold text-lg">
              E
            </div>
            <span className="text-xl font-semibold text-sidebar-foreground">EduTrack</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {navigation.map((group) => (
          group.items.length > 0 && (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.name}>
                      <SidebarMenuButton asChild isActive={location === item.href}>
                        <Link href={item.href} className="flex items-center gap-3 w-full">
                          <item.icon className="w-4 h-4" />
                          <span>{item.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3 overflow-hidden">
            <Avatar className="w-8 h-8">
              <AvatarFallback>{initials || "U"}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium truncate">{userName || "User"}</span>
              <span className="text-xs text-sidebar-foreground/60 truncate capitalize">{getStoredRole()}</span>
            </div>
          </div>
          <button onClick={signOut} className="text-sidebar-foreground/60 hover:text-sidebar-foreground" title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function Breadcrumb() {
  const [location] = useLocation();
  const role = getStoredRole();
  const homeHref = ROLE_HOME[role] || "/";
  const isHome = location === homeHref || location === "/";
  const pageName = PAGE_NAMES[location];

  if (isHome || !pageName) return null;

  return (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Link href={homeHref} className="flex items-center gap-1 hover:text-foreground transition-colors">
        <Home className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Home</span>
      </Link>
      <ChevronRight className="w-3.5 h-3.5 opacity-50" />
      <span className="text-foreground font-medium truncate max-w-[120px] sm:max-w-none">{pageName}</span>
    </nav>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const signOut = useSignOut();
  const userEmail = typeof window !== "undefined" ? localStorage.getItem("edutrack_user_email") || "" : "";
  const [location] = useLocation();
  const role = getStoredRole();
  const showSidebar = role === "principal" || role === "developer" || role === "admin" || role === "parent" || role === "student" || role === "tutor";
  const showReturnLink = showSidebar && location !== "/principal" && location !== "/admin" && location !== "/housekeeping";
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex bg-background w-full">
        {showSidebar ? <AppSidebar /> : null}
        <main className="flex-1 flex flex-col min-w-0 overflow-auto">
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-background sticky top-0 z-10">
            <div className="flex items-center gap-2">
              {showSidebar && <SidebarTrigger className="md:hidden" />}
              <span className="text-sm font-semibold text-foreground md:hidden">EduTrack</span>
              {showSidebar && (
                <div className="hidden md:flex">
                  <Breadcrumb />
                </div>
              )}
              {showReturnLink && (
                <Link href="/principal" className="md:hidden text-xs font-medium text-primary hover:underline">
                  Back to sidebar
                </Link>
              )}
            </div>
            <div className="flex items-center gap-3">
              {showSidebar && (
                <div className="flex md:hidden">
                  <Breadcrumb />
                </div>
              )}
              {userEmail && (
                <span
                  className="hidden md:inline text-xs sm:text-sm text-muted-foreground truncate max-w-[200px] text-right"
                  title={userEmail}
                >
                  {userEmail}
                </span>
              )}
              <button
                onClick={signOut}
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-foreground border border-border rounded px-2 py-1 hover:bg-muted transition-colors"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
          <AnnouncementBanner />
          {children}
        </main>
      </div>
      <DevModeBanner />
    </SidebarProvider>
  );
}

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background px-4 py-2 flex items-center justify-between">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold">EduTrack</span>
          </div>
        </Link>
        <Button asChild size="sm" variant="default">
          <Link href="/sign-in">Sign In</Link>
        </Button>
      </header>
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

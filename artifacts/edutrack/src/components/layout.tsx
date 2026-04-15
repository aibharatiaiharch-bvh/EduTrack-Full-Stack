import { Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, CheckSquare, Calendar, BookOpen, Settings, LogOut, UserRound, ShieldCheck, FlaskConical, CalendarDays, Home, ChevronRight } from "lucide-react";
import { useUser, useClerk } from "@clerk/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getFeatures } from "@/config/features";
import { DevModeBanner } from "@/components/dev-mode-banner";
import { AnnouncementBanner } from "@/components/announcement-banner";

function getStoredRole(): string {
  const override = localStorage.getItem("edutrack_dev_role_override");
  if (override) return override;
  return localStorage.getItem("edutrack_user_role") || "tutor";
}

const ROLE_HOME: Record<string, string> = {
  tutor:     "/dashboard",
  student:   "/student",
  parent:    "/parent",
  principal: "/principal",
  developer: "/admin",
  admin:     "/admin",
};

const PAGE_NAMES: Record<string, string> = {
  "/dashboard":  "Today's Classes",
  "/student":    "My Schedule",
  "/schedule":   "Schedule",
  "/classes":    "Browse Classes",
  "/calendar":   "Class Calendar",
  "/checkin":    "Check-in",
  "/settings":   "Settings",
  "/parent":     "My Classes",
  "/principal":  "Principal Dashboard",
  "/admin":      "Developer Tools",
  "/housekeeping": "Housekeeping",
};

function buildNavigation(role: string, features: ReturnType<typeof getFeatures>) {
  if (role === "tutor") {
    return [
      {
        label: "My Portal",
        items: [
          { name: "Today's Classes", href: "/dashboard", icon: LayoutDashboard },
          { name: "Check-in", href: "/checkin", icon: CheckSquare },
          ...(features.schedule ? [{ name: "Full Schedule", href: "/schedule", icon: Calendar }] : []),
        ],
      },
      {
        label: "Academics",
        items: [
          { name: "Browse Classes", href: "/classes", icon: BookOpen },
          { name: "Class Calendar", href: "/calendar", icon: CalendarDays },
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

  if (role === "student") {
    return [
      {
        label: "My Portal",
        items: [
          { name: "My Schedule", href: "/student", icon: CalendarDays },
          { name: "Browse Classes", href: "/classes", icon: BookOpen },
          { name: "Class Calendar", href: "/calendar", icon: CalendarDays },
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
        label: "My Portal",
        items: [
          { name: "My Classes", href: "/parent", icon: BookOpen },
          { name: "Class Calendar", href: "/calendar", icon: CalendarDays },
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
      label: "Overview",
      items: [
        { name: "Principal Dashboard", href: "/principal", icon: ShieldCheck },
        { name: "Check-in", href: "/checkin", icon: CheckSquare },
        ...(features.schedule ? [{ name: "Schedule", href: "/schedule", icon: Calendar }] : []),
      ],
    },
    {
      label: "Academics",
      items: [
        { name: "Browse Classes", href: "/classes", icon: BookOpen },
        { name: "Class Calendar", href: "/calendar", icon: CalendarDays },
        { name: "Housekeeping", href: "/housekeeping", icon: Settings },
      ],
    },
    {
      label: "Account",
      items: [
        { name: "Settings", href: "/settings", icon: Settings },
        ...(role === "developer" || role === "admin"
          ? [{ name: "Developer Tools", href: "/admin", icon: FlaskConical }]
          : []),
      ],
    },
    {
      label: "Portals",
      items: [
        { name: "Parent Portal", href: "/parent", icon: UserRound },
      ],
    },
  ];
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
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
              <AvatarImage src={user?.imageUrl} />
              <AvatarFallback>{user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium truncate">{user?.fullName || "User"}</span>
              <span className="text-xs text-sidebar-foreground/60 truncate capitalize">{getStoredRole()}</span>
            </div>
          </div>
          <button onClick={() => signOut()} className="text-sidebar-foreground/60 hover:text-sidebar-foreground" title="Sign out">
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
  const { user } = useUser();
  const { signOut } = useClerk();
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex bg-background w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0 overflow-auto">
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-background sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="md:hidden" />
              <span className="text-sm font-semibold text-foreground md:hidden">EduTrack</span>
              <div className="hidden md:flex">
                <Breadcrumb />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex md:hidden">
                <Breadcrumb />
              </div>
              <button
                onClick={() => signOut({ redirectUrl: "/sign-in" })}
                className="text-xs sm:text-sm text-muted-foreground truncate max-w-[120px] sm:max-w-[200px] text-right hover:text-foreground transition-colors"
                title="Switch email / sign out"
              >
                {user?.primaryEmailAddress?.emailAddress || ""}
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

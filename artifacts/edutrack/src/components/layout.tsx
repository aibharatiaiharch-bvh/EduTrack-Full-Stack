import { Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarProvider } from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, CheckSquare, Calendar, BookOpen, FileText, Users, CreditCard, Settings, LogOut, UserRound, ShieldCheck } from "lucide-react";
import { useUser, useClerk } from "@clerk/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();

  const navigation = [
    {
      label: "Overview",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { name: "Check-in", href: "/checkin", icon: CheckSquare },
        { name: "Schedule", href: "/schedule", icon: Calendar },
      ],
    },
    {
      label: "Academics",
      items: [
        { name: "Classes", href: "/classes", icon: BookOpen },
        { name: "Assessments", href: "/assessments", icon: FileText },
      ],
    },
    {
      label: "Management",
      items: [
        { name: "Teachers", href: "/teachers", icon: Users },
        { name: "Billing", href: "/billing", icon: CreditCard },
        { name: "Settings", href: "/settings", icon: Settings },
      ],
    },
    {
      label: "Portals",
      items: [
        { name: "Parent Portal", href: "/parent", icon: UserRound },
        { name: "Principal Dashboard", href: "/principal", icon: ShieldCheck },
      ],
    },
  ];

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-white font-bold text-lg">
            E
          </div>
          <span className="text-xl font-semibold text-sidebar-foreground">EduTrack</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {navigation.map((group) => (
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
              <span className="text-sm font-medium truncate">{user?.fullName || "Admin"}</span>
              <span className="text-xs text-sidebar-foreground/60 truncate">{user?.primaryEmailAddress?.emailAddress}</span>
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

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex bg-background w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0 overflow-auto">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}

import { useLocation, Link, Outlet } from "react-router-dom"
import { useLogout } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { LayoutDashboard, MapPin, Building2, Bell, Settings, LogOut, Users } from "lucide-react"
import { ModeToggle } from "@/components/ui/mode-toggle"
import { useTheme } from "next-themes"
import { useContext } from "react"
import { AuthContext } from "@/lib/auth"

export function DashboardLayout() {
  const { user } = useContext(AuthContext);
  const { theme } = useTheme()
  const logout = useLogout()
  const location = useLocation()
  const pathname = location.pathname

  // Derive a display name: use `name` if available, otherwise extract from email
  const displayName = user?.name ?? user?.email?.split("@")[0] ?? ""

  const handleLogout = () => {
    logout.mutate()
  }

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
    { id: "map", label: "Mappa Edifici", icon: MapPin, href: "/dashboard/map" },
    { id: "buildings", label: "Edifici", icon: Building2, href: "/dashboard/buildings" },
    { id: "alerts", label: "Notifiche", icon: Bell, href: "/dashboard/alerts" },
  ]

  const adminNavItems =
    user?.role === "admin"
      ? [
          { id: "users", label: "Utenti", icon: Users, href: "/dashboard/users" },
          { id: "settings", label: "Impostazioni", icon: Settings, href: "/dashboard/settings" },
        ]
      : []

  const isLinkActive = (href: string) => {
    if (href === "/dashboard" && pathname === "/dashboard") return true
    if (href !== "/dashboard" && pathname.startsWith(href)) return true
    return false
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r bg-card">
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <img
            src={theme === "dark" ? "/images/logo-black.png" : "/images/logo.png"}
            alt="WattGuard"
            className="h-10 w-10 object-contain"
          />
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Comune di Trento</span>
            <span className="text-xs text-muted-foreground">Gestione Energetica</span>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isLinkActive(item.href)
            return (
              <Link
                key={item.id}
                to={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}

          {adminNavItems.length > 0 && (
            <>
              <div className="my-4 border-t" />
              {adminNavItems.map((item) => {
                const Icon = item.icon
                const active = isLinkActive(item.href)
                return (
                  <Link
                    key={item.id}
                    to={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                )
              })}
            </>
          )}
        </nav>

        <div className="border-t p-4 space-y-3">
          <div className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground capitalize">{user?.role}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 bg-transparent"
              size="sm"
              onClick={handleLogout}
              disabled={logout.isPending}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {logout.isPending ? "Uscita..." : "Esci"}
            </Button>
            <ModeToggle />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

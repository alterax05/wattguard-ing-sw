import { useLocation, Link, Outlet } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useLogout } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { LayoutDashboard, MapPin, Building2, Bell, Radio, Settings, LogOut, Users } from "lucide-react"
import { ModeToggle } from "@/components/ui/mode-toggle"
import { LanguageToggle } from "@/components/ui/language-toggle"
import { useTheme } from "next-themes"
import { useAuth } from "@/lib/auth"
import logo from "@wattguard/shared/assets/logo.png"
import logoBlack from "@wattguard/shared/assets/logo-black.png"

export function DashboardLayout() {
  const { user } = useAuth();
  const { theme } = useTheme()
  const logout = useLogout()
  const location = useLocation()
  const { t } = useTranslation()
  const pathname = location.pathname

  // Derive a display name: use `name` if available, otherwise extract from email
  const displayName = user?.name ?? user?.email?.split("@")[0] ?? ""

  const handleLogout = () => {
    logout.mutate()
  }

  const navItems = [
    { id: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard, href: "/dashboard" },
    { id: "map", label: t("nav.map"), icon: MapPin, href: "/dashboard/map" },
    { id: "buildings", label: t("nav.buildings"), icon: Building2, href: "/dashboard/buildings" },
    { id: "sensors", label: t("nav.sensors"), icon: Radio, href: "/dashboard/sensors" },
    { id: "alerts", label: t("nav.alerts"), icon: Bell, href: "/dashboard/alerts" },
  ]

  const adminNavItems =
    user?.role === "admin"
      ? [
          { id: "users", label: t("nav.users"), icon: Users, href: "/dashboard/users" },
          { id: "settings", label: t("nav.settings"), icon: Settings, href: "/dashboard/settings" },
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
      <aside className="flex w-16 lg:w-64 flex-col border-r bg-card">
        <div className="flex h-16 items-center justify-center gap-2 border-b px-2 lg:justify-start lg:px-6">
          <img
            src={theme === "dark" ? logoBlack : logo}
            alt="WattGuard"
            className="h-10 w-10 object-contain"
          />
          <div className="hidden flex-col lg:flex">
            <span className="text-sm font-semibold">{t("nav.systemName")}</span>
            <span className="text-xs text-muted-foreground">{t("nav.systemSubtitle")}</span>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-2 lg:p-4">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isLinkActive(item.href)
            return (
              <Link
                key={item.id}
                to={item.href}
                title={item.label}
                className={`flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors lg:justify-start ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden lg:inline">{item.label}</span>
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
                    title={item.label}
                    className={`flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors lg:justify-start ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="hidden lg:inline">{item.label}</span>
                  </Link>
                )
              })}
            </>
          )}
        </nav>

        <div className="flex flex-col items-center gap-3 border-t p-2 lg:items-stretch lg:p-4">
          <div className="flex items-center justify-center gap-3 rounded-lg bg-muted px-2 py-2 lg:justify-start lg:px-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden min-w-0 flex-1 flex-col lg:flex">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground capitalize">
                {user?.role === "admin" ? t("users.role.admin") : t("users.role.operator")}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 lg:flex-row lg:gap-2">
            <Button
              variant="outline"
              className="bg-transparent lg:h-8 lg:w-auto lg:flex-1 lg:px-3"
              size="icon"
              onClick={handleLogout}
              disabled={logout.isPending}
              title={t("nav.logout")}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="hidden lg:inline">
                {logout.isPending ? t("nav.loggingOut") : t("nav.logout")}
              </span>
            </Button>
            <div className="flex flex-col items-center gap-2 lg:flex-row lg:gap-2">
              <ModeToggle />
              <LanguageToggle />
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="relative flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

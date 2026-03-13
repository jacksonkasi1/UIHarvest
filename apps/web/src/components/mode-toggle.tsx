// ** import core packages
import { useEffect, useState } from "react"
import { useTheme } from "next-themes"

// ** import icons
import { Monitor, Moon, Sun } from "lucide-react"

// ** import components
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

// ** import utils
import { cn } from "@/lib/utils"

interface ModeToggleProps {
  className?: string
}

export function ModeToggle({ className }: ModeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const activeTheme = mounted ? (theme === "system" ? resolvedTheme : theme) : "system"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Toggle theme"
            variant="outline"
            size="icon"
            className={cn("h-8 w-8 rounded-lg border-border/60 bg-background text-muted-foreground shadow-sm transition-all hover:bg-secondary/80 hover:text-foreground", className)}
          />
        }
      >
        {activeTheme === "dark" ? <Moon className="h-[15px] w-[15px]" /> : <Sun className="h-[15px] w-[15px]" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => setTheme("light")}>
          <Sun className="h-4 w-4" />
          Light
          {theme === "light" && <span className="ml-auto text-xs text-muted-foreground">Active</span>}
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => setTheme("dark")}>
          <Moon className="h-4 w-4" />
          Dark
          {theme === "dark" && <span className="ml-auto text-xs text-muted-foreground">Active</span>}
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => setTheme("system")}>
          <Monitor className="h-4 w-4" />
          System
          {theme === "system" && <span className="ml-auto text-xs text-muted-foreground">Active</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

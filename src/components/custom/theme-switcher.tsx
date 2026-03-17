'use client'

import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from 'next-themes'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useEffect, useState } from 'react'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <ToggleGroup
      type="single"
      value={theme}
      onValueChange={(value) => {
        if (value) setTheme(value)
      }}
      className="gap-1"
    >
      <ToggleGroupItem value="light" aria-label="Light mode" className="h-7 w-7 p-0">
        <Sun className="h-3.5 w-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" aria-label="Dark mode" className="h-7 w-7 p-0">
        <Moon className="h-3.5 w-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem value="system" aria-label="System theme" className="h-7 w-7 p-0">
        <Monitor className="h-3.5 w-3.5" />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

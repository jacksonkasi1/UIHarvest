# Tailwind CSS Expert Knowledge

## Configuration
- Use Tailwind v4 with @tailwindcss/vite plugin for Vite projects
- Define design tokens via CSS variables in @theme
- Use @layer for custom utilities and components

## Utility Patterns
- Spacing: p-4, m-2, gap-3, space-y-2
- Flexbox: flex, items-center, justify-between, flex-col
- Grid: grid, grid-cols-3, col-span-2
- Typography: text-sm, font-medium, leading-tight, tracking-wide
- Colors: text-foreground, bg-background, border-border

## Responsive Design
- Mobile-first: sm:, md:, lg:, xl:, 2xl: breakpoints
- Use min-width with @media (Tailwind default)
- Test on real devices, not just browser resize

## Dark Mode
- Use dark: variant for dark mode styles
- Define both light and dark color tokens
- Prefer CSS custom properties for theming

## Animation
- Use transition-all, duration-200, ease-in-out for simple transitions
- Use animate-pulse, animate-spin for loading states
- Use tw-animate-css for more complex animations

## Common Patterns
```tsx
// Card component
<div className="rounded-xl border bg-card p-6 shadow-sm">

// Button
<button className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">

// Input
<input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2">
```

## Class Merging
Always use cn() utility for conditional classes:
```tsx
import { cn } from "@/lib/utils"

<div className={cn("base-classes", isActive && "active-classes", className)}>
```

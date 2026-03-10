---
name: ui
description: Radix primitives, TailwindCSS v4, theme-aware CSS variables, CVA component variants, and accessibility rules. Use when building UI components in apps/user-application — enforces no hardcoded colors.
---

# UI (Radix + Tailwind v4)

## Theme-Aware Colors (REQUIRED — No Hardcoded Colors)

```tsx
// Good
<div className="bg-background text-foreground">
  <p className="text-muted-foreground">Content</p>
</div>

// Bad — never do this
<div className="bg-white dark:bg-gray-900 text-gray-900">
```

| Purpose | Class |
|---------|-------|
| Text | `text-foreground`, `text-muted-foreground`, `text-primary`, `text-destructive` |
| Background | `bg-background`, `bg-muted`, `bg-card`, `bg-accent` |
| Border | `border-border`, `border-input` |

Never use: `text-gray-*`, `text-white`, `bg-white`, `bg-gray-*`

## Radix Primitives

```tsx
import * as Dialog from '@radix-ui/react-dialog'

export function Modal({ trigger, children }: ModalProps) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background text-foreground p-6 rounded-lg border">
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

## Component Variants (CVA)

```tsx
const button = cva('px-4 py-2 rounded font-medium', {
  variants: {
    intent: {
      primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    },
  },
})
```

## Layout

- Mobile-first responsive: `md:`, `lg:`
- Gap over margin: `<div className="flex gap-4">`
- Spacing scale: 4, 8, 12, 16, 24, 32, 48

## Accessibility

```tsx
<button className="focus:outline-none focus:ring-2 focus:ring-ring" aria-label="Close dialog">
  <XIcon />
</button>
```

---
name: shadcn
description: shadcn/ui theming with oklch, tweakcn theme installation, custom status colors, and semantic variant usage. Use when installing themes, adding components, or using Alert/Badge variants in user-application.
---

# shadcn/ui + tweakcn

## Installing a tweakcn Theme

```bash
cd apps/user-application
pnpm dlx shadcn@latest add https://tweakcn.com/r/themes/<name>.json
```

**After install checklist:**
1. Check `styles.css` for new `--font-*` values in `:root` and `.dark`
2. Add Google Fonts import at top of `styles.css`
3. Verify `@theme inline` has correct font mappings (`--font-family-sans`, `--font-family-mono`)
4. Restart dev server

## Color Format

All CSS vars use `oklch()`. Shadows remain `hsl()`. Manual paste: replace `:root` and `.dark` color vars only — keep `@theme inline` and custom status vars.

## Custom Status Colors

`--success`, `--warning`, `--info` (+ `-foreground` variants) are project-specific. After theme install, adjust their oklch values to match new palette. tweakcn CLI won't delete them.

## Semantic Colors — Never Hardcode

```tsx
// Good
<Alert variant="success">
<Badge variant="warning">
<span className="text-destructive">
<div className="bg-success/10">

// Bad — never use palette classes for semantic UI
<Alert className="bg-green-50 border-green-200">
<span className="bg-green-100 text-green-800">
<p className="text-red-500">
```

## Available Variants

- **Alert**: `default`, `destructive`, `success`, `warning`, `info`
- **Badge**: `default`, `secondary`, `destructive`, `success`, `warning`, `outline`

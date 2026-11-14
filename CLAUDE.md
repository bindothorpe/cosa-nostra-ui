# Project conventions

## Mobile first

This webapp is **mobile first**. Design and build for small screens first, then enhance upward.

- Base styles target phone width (~375px). No horizontal page scroll at 320px+.
- Use Tailwind mobile-first breakpoints: unprefixed = mobile, then `sm:` / `md:` / `lg:` to scale up. Never style desktop-first and scale down.
- Touch targets ≥ 44px. Use `min-h-11` / `size-11` on interactive elements.
- Side gutters: 16px (~`px-4`) minimum.
- Prefer stacked layouts, bottom sheets, and full-width controls on mobile; introduce multi-column/sidebar layouts only at `md:` or above.
- Test at 375px before considering a change done.

## UI: shadcn first

Use shadcn/ui wherever possible.

- Before writing custom UI, check `components/ui/` for an existing shadcn component.
- If missing, add it: `pnpm dlx shadcn@latest add <component>`.
- Compose shadcn primitives (Dialog, Popover, Select, Form, Tabs, ...) instead of hand-rolled equivalents or other component libraries.
- Style via Tailwind + shadcn tokens (`bg-background`, `text-muted-foreground`, ...), not ad-hoc colors.
- Only build custom when shadcn has no equivalent; note why in a code comment.

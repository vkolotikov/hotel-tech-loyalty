# Maison Vela

## Concept

Grand European brasserie with a cinematic arrival, typographic menu ledger and maître d’ tone. Best suited to polished city restaurants, modern brasseries and celebratory dining rooms.

## Blocks

`announcement`, `header`, `hero`, `trust`, `services`, `story`, `gallery`, `testimonials`, `faq`, `booking`, and the shared utility `footer`. Sections are self-contained and use `data-block` / `data-variant` boundaries.

## Design system

Rebrand through the `:root` palette, Playfair/DM Sans font stacks, type scale, spacing, container, border and widget-space tokens in `style.css`. The oxblood, ivory and brass palette plus the full-bleed hero create its formal restaurant character.

## Integration hooks

- `data-action="open-booking"` opens table availability or the reservation widget.
- `data-action="open-feedback"` opens the configured diner-review flow.
- `[data-ai-widget-slot]` reserves the footer’s right side for the future assistant.
- The fixed desktop `.booking-fab` stays bottom-left; mobile uses the visible in-page booking actions.

No JavaScript, reservation provider, tenant credentials or chat bootstrap is included. Replace fictional restaurant details, menus, prices, policies and social destinations before publication.

## Assets and dependencies

Two generated, project-local WebP photographs—`hero-brasserie.webp` and `oysters.webp`—are stored in `assets/`. Inline SVG geometry supplies interface icons, avoiding external icon dependencies. Google Fonts provides Playfair Display and DM Sans with system fallbacks.

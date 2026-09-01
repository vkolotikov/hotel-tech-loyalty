# Ember Table

## Concept

Cinematic restaurant and wine-bar direction with a low-light hero, menu ledger and service-led editorial composition. Best suited to destination restaurants, chef-led dining rooms, wine bars and intimate hospitality venues.

## Blocks

`announcement`, `header`, `hero`, `trust`, `services`, `story`, `gallery`, `testimonials`, `faq`, `booking`, and the shared utility `footer`. The `services` block represents the restaurant’s menus and service formats.

## Design system

All colours, Italiana/Inter/DM Mono font stacks, important type sizes, spacing, radii, borders and widget clearance values live in `:root`. Sharp rules, mono labels and the charcoal/ember rhythm distinguish this intimate tasting-room direction from the brighter restaurant kits.

## Integration hooks

- `data-action="open-booking"` opens table reservations.
- `data-action="open-feedback"` opens the configured diner-review flow.
- `[data-ai-widget-slot]` reserves the footer’s right side for future chat or concierge assistance.
- `.booking-fab` remains bottom-left on desktop and is removed on mobile in favour of in-page reservation buttons.

No JavaScript, reservation provider, tenant credentials or widget bootstrap is included. Menus, prices, opening times and venue details are fictional.

## Assets and dependencies

Two generated WebP photographs are local to `assets/`. All UI icons use inline SVG geometry. Google Fonts supplies Italiana, Inter and DM Mono with robust system fallbacks.

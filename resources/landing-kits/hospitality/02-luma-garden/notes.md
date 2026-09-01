# Luma Garden

## Concept

Luminous Mediterranean restaurant template with an image-first split hero, refined menu cards and a relaxed editorial rhythm. Best suited to garden restaurants, all-day dining rooms and produce-led destination restaurants.

## Blocks

`announcement`, `header`, `hero`, `trust`, `services`, `story`, `gallery`, `testimonials`, `faq`, `booking`, and the shared utility `footer`. Each section exposes `data-block` and `data-variant` identifiers for later builder extraction.

## Design system

The `:root` tokens control the limestone, olive and terracotta palette, Newsreader/Manrope typography, fluid type scale, spacing, restrained radii, borders, shadows and the reserved widget area. Cards and imagery retain a softer daylight character than the other restaurant kits.

## Integration hooks

- `data-action="open-booking"` opens table availability or the reservation widget.
- `data-action="open-feedback"` opens the diner-review flow.
- `[data-ai-widget-slot]` reserves footer space for the future assistant.
- `.booking-fab` is desktop-only; mobile keeps clear content and uses in-page booking buttons.

No JavaScript, reservation-provider integration, tenant credentials or widget bootstrap is included. Demo restaurant information, menus and policies are fictional.

## Assets and dependencies

Two generated WebP photographs—`hero-garden.webp` and `langoustine.webp`—live in `assets/`. Interface icons are self-contained inline SVG. Google Fonts supplies Newsreader and Manrope with Georgia and Arial fallbacks.

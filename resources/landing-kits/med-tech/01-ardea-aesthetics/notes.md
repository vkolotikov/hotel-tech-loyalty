# Ardea Aesthetics

## Concept

Quiet editorial template for a physician-led aesthetic medicine studio. It suits aesthetic doctors, injectables practices and small private skin clinics that lead with consultation rather than promotions.

## Blocks

`announcement`, `header`, `hero`, `trust`, `services`, `story`, `team`, `testimonials`, `faq`, `booking`, and the shared utility `footer`. Every section exposes `data-block` and `data-variant` boundaries for builder extraction.

## Design system

The `:root` tokens control the chalk/ink/copper palette, Cormorant Garamond and Manrope stacks, fluid type sizes, spacing, sharp radii, borders and AI-widget clearance. The full-bleed consultation hero and dark clinical manifesto are distinctive to this direction.

## Integration hooks

- `data-action="open-booking"` opens consultation availability.
- `data-action="open-feedback"` opens the configured patient-review flow.
- `[data-ai-widget-slot]` reserves the footer’s right side for the future assistant.
- `.booking-fab` stays bottom-left on desktop and becomes a full-width, safe-area-aware booking bar on mobile.

No JavaScript, booking provider, medical-record integration, credentials or chat bootstrap is included. Treatment suitability, fees and outcomes are fictional demonstration content and must be reviewed by the publishing clinic.

## Assets and dependencies

`hero-consultation.webp` and `skin-consultation.webp` are generated project-local images. Interface icons are inline SVG. Google Fonts supplies Cormorant Garamond and Manrope with system fallbacks.

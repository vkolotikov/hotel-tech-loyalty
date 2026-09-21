# Numa Skin Lab

## Concept

Dark, technology-led template for a small skin-analysis, laser or device-focused specialist studio. It uses a diagnostic ledger and technical labels while keeping the booking journey human and consultation-led.

## Blocks

`announcement`, `header`, `hero`, `trust`, `services`, `story`, `gallery`, `team`, `testimonials`, `faq`, `booking`, and the shared utility `footer`. Sections use `data-block` and `data-variant` identifiers for later extraction.

## Design system

The `:root` tokens control the graphite/ice/blue palette, Instrument Serif, Space Grotesk and DM Mono stacks, fluid type scale, spacing, sharp radii, rules and reserved widget area. Cinematic imagery, mono labels and protocol rows establish the technical direction.

## Integration hooks

- `data-action="open-booking"` opens consultation or skin-analysis availability.
- `data-action="open-feedback"` opens the configured patient-review flow.
- `[data-ai-widget-slot]` reserves the footer’s right-side assistant mount point.
- `.booking-fab` stays bottom-left on desktop and becomes a full-width, safe-area-aware booking bar on mobile.

No JavaScript, device integration, medical-record system, credentials or chat bootstrap is included. Protocols, medical wording, fees and expected outcomes are fictional and require professional review before publication.

## Assets and dependencies

`hero-analysis.webp` and `precision-device.webp` are generated project-local images. All interface icons use inline SVG. Google Fonts supplies Instrument Serif, Space Grotesk and DM Mono with system fallbacks.

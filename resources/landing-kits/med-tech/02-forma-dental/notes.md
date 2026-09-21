# Forma Dental

## Concept

Warm boutique dental template with a split hero, approachable care cards and natural-smile editorial language. It suits cosmetic dentists, private general practices and small family dental studios.

## Blocks

`announcement`, `header`, `hero`, `trust`, `services`, `story`, `gallery`, `team`, `testimonials`, `faq`, `booking`, and the shared utility `footer`. `data-block` and `data-variant` identifiers keep each section portable.

## Design system

The `:root` tokens control the porcelain/plum/clay palette, Fraunces and Manrope stacks, fluid type sizes, spacing, restrained rounded corners, borders, shadows and footer widget clearance. The warm architecture and explanatory care journey are specific to this kit.

## Integration hooks

- `data-action="open-booking"` opens dental appointment availability.
- `data-action="open-feedback"` opens the configured patient-review flow.
- `[data-ai-widget-slot]` reserves space for the future assistant.
- `.booking-fab` stays bottom-left on desktop and becomes a full-width, safe-area-aware booking bar on mobile.

No JavaScript, booking provider, patient portal, credentials or widget bootstrap is included. Services, prices, practitioner details and urgent-care wording are fictional and must be replaced before publication.

## Assets and dependencies

`hero-studio.webp` and `natural-smile.webp` are generated project-local images. UI icons are self-contained inline SVG. Google Fonts supplies Fraunces and Manrope with system fallbacks.

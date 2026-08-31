# Élan Atelier — Template 02

## Concept

Élan Atelier is the sharp editorial direction for premium hair salons, independent stylists and fashion-led beauty studios. Bone, ink and oxblood colours, Bodoni display type, numbered services and asymmetric photography keep it visually distinct.

All names, reviews, contact details, prices and addresses are fictional demonstration content.

## Page structure

The concise landing page includes announcement, header, hero, trust strip, numbered service menu, short studio story, lookbook, compact artist feature, one testimonial, FAQ, booking CTA and utility footer.

The former principles, membership and standalone contact sections were removed. Feedback and contact details now live in the footer, and the old booking/assistant dock was replaced with a single left-side `Book now` control. Only booking actions use button styling.

## Integration

- `data-action="open-booking"` opens booking; service links may also provide `data-service-id`.
- The footer review link uses `data-action="open-feedback"`.
- `[data-ai-widget-slot]` reserves the footer’s right side for the future chat widget.
- `.booking-fab` stays fixed at the bottom-left on larger screens; mobile uses the in-page booking actions so content remains unobstructed.

No JavaScript, tenant identifiers, API URLs or external booking URLs are included.

## Design, accessibility and assets

Rebrand from the `:root` tokens in `style.css`, especially the paper, ink and oxblood palette, typography scale, layout widths and borders. Navigation and FAQ use native `<details>`, images include intrinsic dimensions, focus is visible and reduced-motion preferences are respected.

Five local WebP images live in `assets/`. Booking, rating, contact and social icons use self-contained inline SVG geometry, avoiding third-party dependencies and external SVG fragment-loading issues. Google Fonts supplies Bodoni Moda and Manrope; declared system fallbacks keep the layout usable when those requests are unavailable.

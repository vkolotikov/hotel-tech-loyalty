# Nocturne Ritual — Template 01

## Concept

Nocturne is the dark, cinematic direction for premium spas, massage studios and evening wellness brands. The warm metallic palette, editorial serif type and treatment-led photography remain, but the page is now a concise booking funnel suitable for a new business.

All names, contact details, reviews, prices and policies are fictional demonstration content.

## Page structure

The composition includes announcement, header, cinematic hero, trust strip, service price list, short house story, gallery, compact practitioner feature, reviews, FAQ, booking panel and one utility footer.

The following former showcase blocks were intentionally removed:

- the duplicate image-card service category section;
- “The Nocturne standard” benefits section;
- standalone “Already visited?” feedback section;
- membership promotion;
- “A text-led hero alternative” demo section;
- standalone “Visit the house” contact section;
- standalone AI/booking action dock.

Contact, hours, review collection and social links now live in the footer. Only booking actions use button styling.

## Integration

- `data-action="open-booking"` opens the host booking widget. Service and practitioner links retain optional `data-service-id` values.
- The footer review link uses `data-action="open-feedback"` without being styled as a primary button.
- `[data-ai-widget-slot]` is an empty right-side footer mount point for the future AI chat widget.
- `.booking-fab` keeps `Book now` fixed at the bottom-left on larger screens; mobile uses the in-page booking actions so content remains unobstructed.

No widget script, API endpoint, tenant ID or loyalty integration is embedded.

## Design, accessibility and assets

Rebrand through the `:root` palette, type, size, spacing, radius and effect tokens in `style.css`. Mobile navigation and FAQ use native `<details>`. Images have intrinsic dimensions and non-hero images are lazy-loaded. Focus indicators and reduced-motion handling are included.

Seven local WebP images live in `assets/`. Booking, rating, contact and social icons use self-contained inline SVG geometry, avoiding third-party dependencies and external SVG fragment-loading issues. Google Fonts supplies Cormorant Garamond and Manrope; Georgia and Segoe UI remain as fallbacks.

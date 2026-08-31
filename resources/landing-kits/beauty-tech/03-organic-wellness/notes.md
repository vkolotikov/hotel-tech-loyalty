# Morrow & Moss — Template 03

## Concept

Morrow & Moss is the bright modern-organic direction for facialists, massage practices and small wellness studios. Daylight photography, oat/sage/clay surfaces, modular cards and organic crops keep it warm and approachable.

All names, prices, contact details and reviews are fictional demonstration content.

## Page structure

The lean page includes announcement, header, hero, trust strip, four-service grid, short studio story, gallery, compact team feature, reviews, FAQ, booking panel and utility footer.

The former visit-journey, membership, standalone contact and assistant sections were removed. AI prompts and secondary action buttons were also removed, leaving booking as the single button objective. Contact, feedback and socials now sit in the footer.

## Integration

- `data-action="open-booking"` opens booking; services and practitioners may add `data-service-id`.
- The footer review link uses `data-action="open-feedback"`.
- `[data-ai-widget-slot]` reserves clear space on the footer’s right side for the future chat widget.
- `.booking-fab` remains fixed at the bottom-left on larger screens; mobile uses the in-page booking actions so content remains unobstructed.

No JavaScript, tenant credentials, loyalty integration or widget bootstrap is included.

## Design, accessibility and assets

Rebrand through the `:root` palette, typography, spacing, organic radius and depth tokens in `style.css`. Native `<details>` powers navigation and FAQ; images have intrinsic dimensions; focus states and reduced-motion support are included.

Five generated WebP images live in `assets/`. Booking, rating, contact and social icons use self-contained inline SVG geometry, avoiding third-party dependencies and external SVG fragment-loading issues. Google Fonts supplies Newsreader and Manrope, with Georgia and Arial fallbacks.

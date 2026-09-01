# Hospitality template collection

Three standalone plain-HTML/CSS restaurant kits cover distinct dining concepts while sharing the builder’s integration contract.

| Kit | Direction | Best suited to |
| --- | --- | --- |
| `01-maison-vela` | Grand European brasserie | Polished city restaurants and celebratory dining rooms |
| `02-luma-garden` | Luminous Mediterranean garden | All-day restaurants and produce-led destinations |
| `03-ember-table` | Cinematic chef-led tasting room | Intimate restaurants, wine bars and open-fire kitchens |

Each kit contains `index.html`, `style.css`, local `assets/` and practical `notes.md`. Files directly inside `hospitality/` form the collection browser.

## Shared page model

```text
announcement  header  hero  trust  services  story
gallery       testimonials  faq  booking  footer
```

The content stays intentionally achievable for a new independent restaurant. Each design needs only a short menu list, a kitchen story, a few dining formats, one review and basic visit information.

## Integration contract

- `data-action="open-booking"`: open table reservations.
- `data-action="open-feedback"`: open the configured diner-review flow.
- `data-ai-widget-slot`: mount the future chat/concierge widget in the reserved right-side footer zone.

Only booking actions use button styling. The host application owns all behavior; templates include no JavaScript, credentials or invented APIs. The desktop booking control sits bottom-left and disappears on mobile, where prominent in-page actions remain.

## Builder rules

- Preserve `data-block` and `data-variant` boundaries when extracting sections.
- Keep colours, font families, important type sizes and radii in `:root`.
- Do not add inline scripts, inline styles, DOM event handlers or `javascript:` URLs.
- Keep images local with numeric intrinsic dimensions and useful alt text.
- Retain native `<details>` navigation/FAQ behavior, visible focus states and reduced-motion handling.
- Replace all fictional names, rates, menus, policies, reviews and contact details before publishing.

## Validate

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\hospitality\tools\validate-templates.ps1
```

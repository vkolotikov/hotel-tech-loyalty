# MedTech clinic template collection

Three standalone plain-HTML/CSS kits cover distinct small private-practice use cases while sharing the builder’s integration contract.

| Kit | Direction | Best suited to |
| --- | --- | --- |
| `01-ardea-aesthetics` | Quiet medical editorial | Aesthetic physicians and private skin clinics |
| `02-forma-dental` | Warm boutique dentistry | Cosmetic, general and small family dental studios |
| `03-numa-skin-lab` | Precision skin technology | Laser, imaging and device-led specialist clinics |

Each kit contains `index.html`, `style.css`, local `assets/` and practical `notes.md`. Files directly inside `med-tech/` form the collection browser.

## Shared page model

```text
announcement  header  hero  trust  services  story
team          testimonials  faq  booking  footer
```

The content is intentionally achievable for a new independent practice: a short treatment list, one practitioner profile, one review, a few consultation FAQs and basic contact information. Forma and Numa also demonstrate a small process/gallery block.

## Integration contract

- `data-action="open-booking"`: open consultation or appointment availability.
- `data-action="open-feedback"`: open the configured patient-review flow.
- `data-ai-widget-slot`: mount the future assistant in the reserved right-side footer zone.

Only booking actions use button styling. The host application owns behavior; templates include no JavaScript, credentials, patient-data collection or invented APIs. The desktop booking control sits bottom-left and becomes a full-width, touch-friendly booking bar on smaller screens.

## Builder and clinical-content rules

- Preserve `data-block` and `data-variant` boundaries when extracting sections.
- Keep colours, font families, important type sizes and radii in `:root`.
- Do not add inline scripts, inline styles, DOM event handlers or `javascript:` URLs.
- Keep images local with numeric intrinsic dimensions and useful alt text.
- Retain native `<details>` navigation/FAQ behavior, visible focus states and reduced-motion handling.
- Avoid guaranteed outcomes, unsupported superiority claims and procedure suitability claims without professional review.
- Replace all fictional names, registrations, prices, treatment descriptions, policies, reviews and contact details before publishing.

## Validate

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\med-tech\tools\validate-templates.ps1
```

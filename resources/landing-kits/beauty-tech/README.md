# BeautyTech template collection

This directory contains three standalone HTML/CSS kits with distinct visual systems and one deliberately lean landing-page structure. The content model is designed for new beauty businesses that may only have a short service menu, a small team and a handful of reviews.

| Kit | Direction | Best suited to |
| --- | --- | --- |
| `01-nocturne-ritual` | Dark, cinematic ritual luxury | Premium spas, massage and evening wellness brands |
| `02-editorial-atelier` | Sharp editorial fashion | Hair studios and image-led beauty ateliers |
| `03-organic-wellness` | Bright modern organic | Skin, body and approachable wellness studios |

Each self-contained kit has `index.html`, `style.css`, `assets/` and `notes.md`. The files directly inside `beauty-tech/` form the collection browser and are not a fourth kit.

## Lean page model

The previews now demonstrate a practical single-page funnel rather than an exhaustive block library:

```text
announcement  header  hero  trust  services  story
gallery       team    testimonials  faq  booking  footer
```

The footer is the shared utility hub. It nests the compact `feedback`, `contact` and `assistant` widget-slot blocks so address, contact channels, review collection and integrations do not require separate page sections. Optional blocks can still be removed when a tenant has less content.

Only booking actions use button styling. Navigation, review, contact and social destinations remain simple text/icon links. This keeps the page focused on opening the booking widget instead of suggesting nonexistent secondary pages.

## Shared footer contract

Every kit uses the same functional footer pattern while retaining its own typography and colours:

- booking and the main brand message on the left;
- compact rating and `data-action="open-feedback"` review link;
- address, phone, email and a short hours line;
- accessible social icon links;
- an empty right-side `[data-ai-widget-slot]` mount point reserved for the future AI chat widget.

A persistent `Book now` control is fixed to the bottom-left. The bottom-right is intentionally kept clear for the future chat launcher.

## Integration contract

Templates contain no JavaScript and no tenant credentials. The host application owns connected behaviour:

| Contract | Purpose |
| --- | --- |
| `data-action="open-booking"` | Open the configured booking widget; service links may add `data-service-id` |
| `data-action="open-feedback"` | Open the configured review flow from the footer text link |
| `data-ai-widget-slot` | Mount or coordinate the future AI chat widget in the reserved footer area |

Loyalty and standalone AI launch actions are intentionally absent from these starter compositions. They can be introduced later for established tenants without making new businesses fill unnecessary sections.

## Markup and design rules

- Keep colours, font families, important font sizes and radii in `:root` custom properties.
- Do not add inline scripts, styles, DOM event handlers or `javascript:` URLs.
- Keep every image local to its kit and give it numeric `width` and `height` attributes.
- Preserve semantic landmarks, native `<details>` navigation/FAQs, visible keyboard focus and reduced-motion behaviour.
- Replace all fictional prices, ratings, addresses, policies and social destinations before publishing.

## Validate

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\beauty-tech\tools\validate-templates.ps1
```

The no-dependency validator checks kit structure, CSP-hostile markup, required blocks and hooks, footer widget slots, local references, intrinsic image sizes, duplicate IDs and design-token leakage.


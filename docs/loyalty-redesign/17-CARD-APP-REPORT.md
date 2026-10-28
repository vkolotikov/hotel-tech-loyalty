# Card & app milestone — implementation record

Status: implemented and verified in the isolated release artifact; production verification pending. Exact Figma CA-01 `144:6931`, 1440 × 1522, file `d6IGmk3hOoMw0V5rONbI1A`, inspected through the connected plugin with full design context and screenshot. Figma's `primitives` package is not installed; the page composes the existing OverviewButton (workspace Button), fields and native dialog. All 17 static exports were downloaded and SHA-256 audited: 16 reuse identical Overview assets, and Program uses its exact new export with original SVG geometry.

## Implementation map

| Behavior | Integration |
|---|---|
| Appearance form and saved/draft preview | Existing `AppLook`, `appApi`, validated look math and server option catalogues |
| Dark / Light | Server-supplied neutral colour palettes, saved through existing colour settings; preserve accent/status colours |
| Logo upload | Existing immediate `AppLook::setLogo`, limits and ownership checks; Discard does not undo an uploaded logo |
| Example member/device/state controls | Clearly illustrative local preview; real workspace, saved/draft colours and server programme facts; no member lookup or transaction |
| Wallet connections | Existing manager/plan-gated wallet read, readiness reasons, credential uploads and `WalletSettings` writer |
| Advanced and currency settings | Existing controls, validation and currency dry-run/confirmation; existing tab bookmarks preserved |
| Shell and responsiveness | Shared Overview shell, scoped Card & app CSS; dark/light workspace themes and five languages |

## Verified boundaries

- Card name is the workspace name. There is no independent member-card name setting; show its source rather than saving an unused value or renaming the organization implicitly.
- Existing member apps consume one saved colour palette, not an automatic light/dark mode. Dark/Light can save actual colours; automatic switching remains explicitly unavailable.
- Wallet readiness comes from the server and means configuration readiness, not proof of a device installation. No admin sample-pass endpoint exists. Test-on-device opens accurate test guidance, never an invented download or a real member pass.
- Wallet appearance is configured separately from member-app colours. Provider layouts are their own. No promise that an app colour save updates native passes.
- Keep all three card styles, eleven colours, twelve presets, radius, button style, accent strength, wallet files/password rules and currency workflows.
- Browser writes use intercepted local fixtures. No production member/pass or credential operation is part of UI verification.

## Verification and visual comparison

- Full isolated backend suite: **7,085 passed, 7 existing skips, 45,393 assertions**, in **75 foreground scoped runs** with PHP 8.4.20. Every run's Tests summary was read; `evidence/card-app/php-scopes.json` records each result.
- The final permission-loss refinement releases navigation after a rejected save while hiding the draft. It passed **344 focused frontend tests**, fresh TypeScript/Loyalty ESLint/build and both new compiled-browser checks. The final compiled bundle passed all 90 browser/render checks.

- New PHP palette integration test verifies the existing writer, public member-theme response, unchanged accent/status colours and tenant isolation. Focused AppLook suite: **6 passed, 92 assertions**.
- Final artifact TypeScript and Loyalty ESLint passed. Full frontend suite: **5,668 passed, zero failed, 392 files**. The initial suite caught missing Loyalty scoping on the new stylesheet; every rule is now scoped under `[data-loyalty][data-overview]`, and the full rerun passed. Fresh Vite/postbuild passed; no dependency or migration changes.
- Compiled Chrome checks: **79 interactions/state checks plus 11 render checks**, zero runtime errors. Covers save/discard/validation/failure recovery, serialized upload/save, immediate logo persistence, navigation guard, draft/saved preview, all advanced controls, provider settings/save/upload/cache refresh, plan/permission restrictions, six widths (1440/1280/1024/768/390/320), five languages and light workspace theme. The existing settings tab navigation was corrected to keep an explicit `?tab=wallet`.
- Exact 1440px measurements: sidebar 232, header 72, editor 664, gap 16, preview 464. All ten navigation images preserve their intrinsic export geometry within 20px wrappers. Local Poppins loads successfully. Mobile columns actually stack; fields/dialogs remain usable at 320px. Keyboard modal focus, Escape restoration and 200% equivalent viewport reflow passed.
- Main editor text/link colours were measured against both gradient endpoints, canvas and recessed fields in dark/light themes: minimum **4.537:1** dark and **5.062:1** light. Primary button text region is **5.506:1**; its cyan highlight sits above the label. These measurements do not claim every arbitrary customer-supplied preview palette is accessible; preview colours deliberately reflect saved/draft settings.
- Final compiled desktop, mobile viewport/preview, expanded desktop dialog and settled light-theme renders were visually compared with CA-01. The Figma proportions, hierarchy, typography, navy panels and controls are retained. Extra guidance for the workspace name, immediate logo uploads, real benefit eligibility and wallet testing adds height (1651 versus 1522). The existing shell's navigation disclosures remain, and production has no demo-data badge. No separate mobile/light Figma frame was supplied; these adapt existing responsive/theme conventions.
- Browser tests use only intercepted local APIs. They prove client contracts and interaction behavior; isolated PHP integration tests prove actual persistence/authorization. They do not assert a real Apple/Google installation or mutate production credentials. Playwright MCP transport became unavailable, so the same local fixture checks ran through installed Playwright with system Chrome.
- Evidence: `evidence/card-app/asset-audit.json`, `browser-checks.json`, `render-audit.json`, exact Figma screenshot and compiled `render-*.png` files. Release scripts and full logs are on `E:/Hexa-Tech-release/`.

Previous deployed source baseline: `e21e9258264614f239fc291e9331ca1746ea36fd`. Production parent: `f5edeb36304821a8ec9def97b75f5a82b2435955`. The isolated artifact has whole-source parity with the feature source, excluding only generated SPA files. Production content verification follows the push.

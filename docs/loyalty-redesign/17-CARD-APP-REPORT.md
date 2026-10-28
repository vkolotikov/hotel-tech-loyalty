# Card & app milestone — implementation record

Status: in progress. Exact Figma CA-01 `144:6931`, 1440 × 1522, file `d6IGmk3hOoMw0V5rONbI1A`, inspected through the connected plugin with full design context and screenshot. Figma's `primitives` package is not installed; compose the existing OverviewButton (workspace Button), fields and native dialog. Static exports are downloaded and hash-audited; the Program icon needs its exact new export.

## Implementation map

| Behavior | Source / planned integration |
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
- Browser writes will use intercepted local fixtures. No production member/pass or credential operation is part of UI verification.

Previous deployed source baseline: `e21e9258264614f239fc291e9331ca1746ea36fd`. Production parent: `f5edeb36304821a8ec9def97b75f5a82b2435955`. Final test and live deployment evidence will be appended.

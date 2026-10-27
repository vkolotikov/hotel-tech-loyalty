# Hexa loyalty — Codex implementation package

Version: 1.0 · 27 October 2026  
Current milestone: **Implement the new Overview and the shared shell needed for it.**

## How to use this package

1. Extract this folder into your application's repository at `docs/loyalty-redesign/`.
2. Open the real application repository in VS Code. These files are specifications, not an application.
3. Connect the Figma plugin/MCP to Codex using your own account. The user will provide that connection.
4. Give Codex the instruction below. Keep the Markdown files in the repository so they remain available across sessions.

### Paste into Codex

> Read `docs/loyalty-redesign/01-CODEX-TASK.md` and all documents it references. Implement the current Overview milestone in our existing application, including the new design, responsive states, interactions and verified data integration. Use the connected Figma plugin to inspect the exact frames in `02-DESIGN-AND-FIGMA.md`; match their typography, palette, gradients, raised controls, spacing and layout. Inspect the repository first, preserve existing features and routes, then continue through implementation and testing. Do not stop at a plan or a static mockup. Follow the scope and acceptance criteria in this package. Complete Overview before starting the later Members redesign. Report implemented work, validation evidence and any specific unresolved dependencies.

Main Figma target: [OV-01 Daily Overview](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-365)  
All states: [Overview review index](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-387)  
Mobile: [OV-24 scrollable viewport](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=38-2341)

## Files and reading order

| File | Purpose |
|---|---|
| [01-CODEX-TASK.md](01-CODEX-TASK.md) | Task, scope, working rules and completion requirements |
| [02-DESIGN-AND-FIGMA.md](02-DESIGN-AND-FIGMA.md) | Exact visual source, Figma workflow and implementation fidelity |
| [03-OVERVIEW-SPEC.md](03-OVERVIEW-SPEC.md) | Page anatomy, all states, actions and 34-frame index |
| [04-DATA-AND-INTEGRATION.md](04-DATA-AND-INTEGRATION.md) | Metrics, permissions, data sources, checks, queues and unresolved dependencies |
| [05-FEATURE-PRESERVATION.md](05-FEATURE-PRESERVATION.md) | Existing features/routes that must remain available |
| [06-IMPLEMENTATION-PLAN.md](06-IMPLEMENTATION-PLAN.md) | Ordered implementation milestones and practical completion gates |
| [07-QA-AND-ACCEPTANCE.md](07-QA-AND-ACCEPTANCE.md) | Functional, visual, responsive and regression checks |
| [08-FUTURE-ROADMAP.md](08-FUTURE-ROADMAP.md) | Remaining product improvements, explicitly outside this milestone |
| [09-IMPLEMENTATION-REPORT-TEMPLATE.md](09-IMPLEMENTATION-REPORT-TEMPLATE.md) | Evidence-based handoff/report template |

## What “final” means here

This is the consolidated implementation handoff for the current Overview milestone. It is not a claim that every loyalty section has a finished screen design or that all backend semantics have been verified.

The latest request moves Overview from design review into an implementation task. Codex should not ask again whether to begin routine implementation. Source verification is part of its work. A material change to points economics, qualification, fulfillment, tenant/program scope or authorization is a separate product decision.

The other sections stay functional. Their full redesign is sequenced in the roadmap, starting with Members. The earlier Guided setup and Points rewards concepts are not complete implementation specifications.

This package supersedes conflicting earlier planning text for **this milestone**, including the old seven-item sidebar and first-pass flat/Inter design. Do not combine old and new instructions indiscriminately. Repository instructions and the user's later decisions still apply.

## Source boundaries

The live UI/guide audit observed feature surfaces and representative editors without executing production transactions. It did not inspect the application's source, database, job execution, all permissions or integration delivery. The source repository is authoritative about what actually exists.

Figma is authoritative for the selected visual design. These Markdown specifications define behavior and scope. A screenshot with a demo value is not a business rule or an API contract.

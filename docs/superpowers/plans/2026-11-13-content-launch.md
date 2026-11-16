# Content Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the accepted Content audit fixes and improvements and deploy the verified product.

**Architecture:** Extend the existing Content services/workspace. Preserve API compatibility around updated_at, centralize safe writes, add asynchronous work/media/collaboration APIs, then reuse one editor draft in panel/full views. Complete independent tasks sequentially with fresh task reviews.

**Tech Stack:** Laravel13, PHP8.5.12, PostgreSQL18/SQLite, React19/TypeScript/Vite, existing React Query and workspace tokens.

**Spec:** `docs/superpowers/specs/2026-11-13-content-launch-design.md`

## Global Constraints

- User accepted `docs/audits/2026-11-13-content-prelaunch.md` and requested all fixes/improvements plus deployment; keep a coverage record F01–F17 and additional recommendations.
- Work only in `E:/Hexa-Tech-content-launch-20261113`, feature/content-launch-20261113; no production data, messages or provider calls during implementation tests.
- Read all CLAUDE.md and the area's docs. PHP is C:/wamp64/bin/php/php8.5.12-nts/php.exe. Never bare artisan test. No vendor junction. No credentials output.
- All Content APIs stay under admin/content, behind tenant/brand/workspace/AccessMap rules; managers alone change organisation/brand setup. IDs must be this org/brand's.
- Frontend uses existing a-*/c-* tokens, five locales en/ru/de/fr/es, no new dependency unless necessary. Shared changes keep sibling workspaces compatible.
- Provider calls outside database locks; compare current post revision before result writes. Cancelled, stale, unauthorized or exhausted work cannot commit.
- Keep existing saved posts/profiles/images/links. No public booking widget change. No automatic social publishing or real test emails.
- Test behavior first, preserve meaningful existing assertions. Run focused checks during iteration and complete relevant scope before commit. Never commit feature-generated frontend/dist/public/spa/resources/spa-shell.
- Agent does not spawn subagents. Root owns reviews, combined checks, build/deployment and PHP-test slot coordination.

**Execution order:** Tasks1-5, supplemental Task10 (current provider compatibility), then6-9. Task numbers are stable for existing reports.

## Review Focus

1. A response arriving after a new editor/account/brand must never erase current work; prove deferred Create/Save/duplicate and drawer/full-view transitions.
2. A provider completing after publication, cancellation, midnight or allowance exhaustion must not create hidden or past/stale changes; test worker boundaries and full PostgreSQL varchar constraints.
3. An old browser/raw timestamp and a frozen clock still distinguish every meaningful post write; test same-second and same-microsecond save/approve/AI/media writers.
4. A restricted user or an inactive/expired account must not obtain another brand's media/work/export/notification; prove denial before provider/storage/mail effects.
5. Multiple invites/activations/uploads/results must preserve quotas, exact target recipients and idempotency; include PostgreSQL concurrency where the database matters.

---

### Task 1: Subscription and active-team quotas

**Files:** Modify `app/Http/Middleware/CheckSubscription.php`, `app/Services/PlanLimitGuard.php`, `app/Http/Controllers/Api/V1/Admin/TeamController.php`; extend `tests/Feature/Auth/`, `tests/Feature/PlanLimits/` (discover actual suite), shared team/access tests. Do not touch Content post services yet.

**Interfaces:** Existing subscription_required and plan_limit responses remain. PlanLimitGuard::KEY_TEAM counts active Staff. Invite/reactivation serialize under Organization lock.

- [x] Add regressions: expired non-platform owner denied Content read/create; actual platform operator exempt; recovery routes remain accessible; one active+three inactive can use Lite2; activation at limit refused; reinvite existing active allowed; concurrent last-seat claims cannot both succeed. Adapt private audit proofs into desired assertions.
- [x] Run new cases and record expected failures, then implement the narrow shared fixes.
- [x] Run relevant Auth/PlanLimits/AdminAccess/team suites on SQLite; PostgreSQL concurrency proof when root provides its test database. No real invitations/mail.
- [x] Self-review, commit only task source/tests with Co-Authored-By; write report with RED/GREEN evidence and exact scopes. Root dispatches task review.

### Task 2: Reliable post revisions, AI commits and publication

**Files:** `app/Models/ContentPlannerPost.php`, post/approval controllers, `app/Services/Content/ContentPostPresenter.php`, new `ContentPostWrites.php` and `ContentPublication.php`, ContentPostGenerationService, ContentVisualBriefService, ContentPlanner/ImageGenerationService, quality/version/repeat writers as required, additive precision migration, `tests/Concerns/SetsUpContentSchema.php`, Content/Unit tests; `frontend/src/content/panel/panelState.ts` revision comparison only.

**Interfaces:** updated_at stays the external ISO revision token with six fractional digits. `ContentPostWrites::apply(ContentPlannerPost $snapshot, callable $write): ContentPlannerPost` locks/reloads/compares then executes write on current row in one transaction. Callback receives current post. Shared publication transition stamps metadata consistently. No transaction held during provider calls.

- [x] Write failing tests for same-second stale save/approve, frozen/backward-clock monotonic tokens, changed-after-provider save/publish/platform/delete, invalid brief style/CTA lengths and rollback on brief failure, safe subsequent image-error GET, Published via create/save/goals, images/brief changes invalidate staff approval. Preserve group/quality/comment version semantics and sent-back behavior.
- [x] Implement precision migration/model formatting and meaningful-save logical timestamps; compare full instants. Update schema fixtures so SQLite and PostgreSQL reflect precision; update frontend newer() to retain sub-millisecond order without changing public types.
- [x] Route post/AI/brief/image commits through the shared boundary, normalize all output to schema limits, record approval history with the write, sanitize old/raw image_error on presentation, unify publication including conservative legacy backfill.
- [x] Run Content/ContentCalendar/Unit suites; root runs real PostgreSQL fixtures. Self-review/commit/report, including all writers checked and RED/GREEN evidence.

### Task 3: Worker-safe AI allowances, dates and cancellable asynchronous work

**Files:** new Content work migration/model/service/controllers/job, existing GenerationController/GenerateContentCalendar/GenerateContentStrategy/ContentGenerationRun/ContentAiGate/CalendarGenerationService/AiClient/ImageGenerationService, routes/api.php, AccessMap when needed, focused Content tests. Extend Task2 commit boundary only to enforce current-work cancellation before commit.

**Interfaces:** `POST work` takes `{action, request_key, post_id?, instructions?, type?, guidance?, template_id?, date?, platform?}`; actions write/rewrite/quality/brief/image/fill. Response202 `{work:{id,action,status,post_id,started_at,finished_at,error,result,can_cancel}}`; GET work/{id} returns same; GET work?post_id= returns latest active/recent run for that post; DELETE marks cancellable work cancelled, idempotently. Results carry `{post_id?,variation?,quality?}`; UI reads current post by id. Safe statuses queued/running/succeeded/failed/cancelled. All rows tenant+brand scoped. Existing routes compatible.

- [x] Fail-first regressions: allowance exhausted after enqueue/between weeks/JSON repair/image fallback; same-org parallel attempts use fresh spend; expired/inactive/restricted actor stops before provider; queue crossing midnight inserts no past posts; cancel before/during provider leaves no result write; request_key retry creates one work; worker failure yields local error and releases ownership.
- [x] Add shared fresh allowance checks around each Content provider attempt and ledger recording; preserve partial generation/budget reasons. Recompute today at worker start and per insertion. Do not hold DB row locks during provider calls.
- [x] Add async actions on existing ai queue with captured revision, safe ownership/idempotency and bounded failures; cancellation checked at every commit (including Fill). Bound synchronous legacy provider transports below web timeout and disable unsafe automatic paid retries. Add calendar cancel endpoint tied to run owner.
- [x] Run complete Content-related scope, queue/config checks; commit/report new endpoint and result contracts verbatim for frontend tasks.

### Task 4: Content planning settings and purchased locations

**Files:** new ContentSettings/ContentLocations services/controllers, Content bootstrap/pulse route/controller, ContextBuilder, Property/PlanLimitGuard reuse, routes, focused feature tests. Frontend setup UI belongs Task6.

**Interfaces:** GET settings returns `{timezone,timezone_named,timezones:[…],locations_limit,locations_used}`; PUT settings `{timezone}` manager-only uses venue setting writer and returns current settings. GET locations returns current-brand safe locations; POST/PUT locations accept name,address,city,country,timezone,email,phone,website,is_active only; no PMS/booking fields. Responses `{locations}` / `{location}`. Content pulse's now/today/timezone match saved planning zone; UTC/no-name is explicit. Existing venue settings remain untouched until a manager chooses Save.

- [x] Add tests for pulse/bootstrap same zone at midnight and unset UTC hint; supported-zone validation and staff denial; Pro3 own-brand locations accessible and quota enforced inside org lock; cross-brand IDs denied; forbidden PMS/booking data neither accepted nor exposed.
- [x] Implement using existing Property/venue settings, own-brand queries, active location context in AI. No destructive delete or automatic customer timezone conversion.
- [x] Run Content + Dashboard + module/access scopes and commit/report. Document any shared setting implications.

### Task 5: Editor draft integrity, navigation, focus and locale

**Files:** ContentApp/ContentShell/ContentProvider, PanelProvider/PostPanel/panelState, new Content draft registry/helpers, Brand SectionCard/summary/bio/list editors, PostsPage placeholder, shared WorkspaceShell optional navigation guard, i18n document language, Dialog focus primitives; relevant frontend tests and persistent browser regression script.

**Interfaces:** one account/brand/editor-scoped draft owner; async completion verifies owner/opening. Submitted snapshot distinguishes post-click edits/undo. Shared registry exposes dirty/guard/retain for Brand forms; post draft persists across internal navigation. Optional shared frame navigation guard defaults to existing behavior for siblings. Task2 raw timestamp contract retained.

- [x] Reproduce audit's seven local browser cases against desired assertions before fix; pure tests for completion ownership, submitted-snapshot rebase, brand placeholder and retained drafts.
- [x] Keep Create identity transition in place and preserve post-click edits. Reject stale callbacks from old brands/targets without replacing current editor; include duplicate/delete/action outcomes.
- [x] Protect all Brand drafts on every supported leave path, section switch and browser Back; do not cross account/brand. Add real Retry to failed reads.
- [x] Trap phone/full-overlay focus with covered content inert and restoration; keep desktop dock nonmodal. Update document lang on locale changes.
- [x] Run focused tests/typecheck and browser delayed-response cases; commit/report. Full composer in Task6 consumes the same draft rather than copying it.

### Task 10: Current image provider compatibility and usage pricing (execute after 5, before 6)

**Files:** `config/openai.php`, ContentPlanner ImageGenerationService/AiClient and narrow model/pricing helper if useful; `AiUsageService`; Content error/result mappings; focused provider/ledger/work tests, configuration example/runbook. No unrelated model upgrades, schema/billing changes or historical-log rewrite.

**Interfaces:** default `gpt-image-2.6-sunburst`; current alternative `gpt-image-2.6-flare`; fallback empty unless configured; legacy primary aliases canonicalize to current Sunburst except mini to Flare; legacy configured fallback to Flare, deduplicated. Unknown/unpriced Content model fails `ai_model_unpriced` before any provider call, including text repairs/image fallback. New error remains safe through async work/Fill/legacy callers. Preserve existing deadlines, fresh shared allowance and no ambiguous retry contracts.

- [x] Fail-first regressions for retired default/explicit legacy overrides, real SDK request serialization and parsed usage, exact text/image input/output rates and conservative missing-usage estimate, positive-cent rounding, unknown-model zero-provider refusal, alias duplicate fallback and moderation/invalid-prompt/transport no-fallback. Existing budget-exhaustion-before-fallback remains proved.
- [x] Implement the supplement Spec's exact provider configuration/PNG-quality-sizes/prices. Record complete usage when present, conservatively estimate missing data, use a common cost calculation for diagnostic generation estimate and ledger; leave historical rows unchanged. Correct mapped Claude prices/tier and keep Content's active text default.
- [x] Run Content/ContentCalendar/provider/AI ledger scopes, SQLite and affected PostgreSQL; update config/runbook with current source links and exact estimator/alias behavior. No real provider requests, keys, buckets or messages. Commit/report red/green, actual SDK fixture and downstream frontend error contract. Root dispatches fresh scoped review.

### Task 6: Full composer, media and structured workspace

**Files:** new media migration/model/services/controller, media/post-media routes and copy/repeat/version integration, ContentApp/ContentShell, new write/media pages/helpers, PostPanel/PostFormFields, Brand/Strategy navigation, planning/settings/location UI, Plan skeleton/layout, content CSS/i18n (all five), tests/e2e. Reuse media writer and Task2 safe writes.

**Interfaces:** media GET/POST/PUT archive/restore under content/media; verified JPEG/PNG/WebP, MP4/WebM, PDF <=20MB; post attachment IDs ordered max10, own-brand only. Media metadata has id,name,mime,size,url,archived,usage_count. GET media also returns max_upload_bytes computed per web request from the hard20MiB cap and effective server limits with multipart margin; uploader validation/help use this capability. Existing AI image remains fallback. `/content/write/new|id` shares exact draft with panel, uses Task3 work endpoints and polls/reopens/cancels using the server can_cancel capability. Character limits and manual-copy rules are the Spec's values.

- [x] Add behavior tests for upload MIME/size/tenant boundaries, attachment optimistic conflict and approval reset, reference copying, reversible archive; composer draft identity and counts/caption URL rules, explicit Published action labeling; async work progress/cancel/failed Retry; structured URL section navigation/guards.
- [x] Implement media backend and library, single draft full composer/preview with visible Platform/Topic, ordered media attachment and manual publishing handoff. For an explicit transition to Published, label Save as Save and mark published and explain manual recording; other saves/previews never implicitly publish. No automatic network sends. Add Open channel only from saved safe channel URL; Mark published remains explicit.
- [x] Implement Brand/Strategy section navigation and Content settings/locations UI, sticky accessible navigation/actions. Reserve stable Plan header/filters/goals/calendar loading dimensions; do not shift controls as queries arrive. Preserve house tokens, both themes, reduced motion.
- [x] Test all five locales, 390/1024/1440, keyboard focus, full↔panel without loss, real local backend and delayed requests; inspect screenshots and refine. Run frontend/Content scope, commit/report with screenshots and F17 trace comparison.

### Task 7: Guide and explicit collaboration notifications

**Files:** new Content guide page/logic/translations, Help entry, notification preference/API/model/migration/job/mail, comments/approval/inbox event integration, bell/timeline mention UI, lang email bundles, tests. Shared notification/mail patterns reused without enabling existing-user consent.

**Interfaces:** personal review/mention email defaults off; explicit preference endpoint (and bootstrap flag). Comment requests optionally carry own-brand mentioned_user_ids and media_id for an attached own-brand asset; plain body stays plain. Validate the media association under the post lock; keep it fixed on edit and preserve safe timeline asset context after detach/archive. In-app mentions visible to intended authorized staff. Unique recipient/event notification identity, queued after commit, active/authorized/opted-in rechecked on send.

- [x] Tests first: only selected own-brand team IDs may be mentioned; foreign/unattached media IDs refused, media comments retain context after archive/detach, comment edit preserves the association; no foreign/missing/inactive recipient/provider call; notifications deduplicated; email off by default; opted-in active recipients get locale-correct review/mention email, suppression/sender respected; no ordinary save/upload/preview sends without a review or mention event. Same-second comments/approval news before and after read_at retain precise ordering on SQLite and PostgreSQL, including a delayed seen acknowledgment. Guide search/task actions respect rights.
- [x] Implement notification events and opt-in UI, safe plain-text mentions and guide walkthroughs from Spec; keep existing morning email separate. All real sends disabled in test fixtures.
- [x] Run Content/mail/locale/shared frame suites and browser guide/search/mentions using captured local mail. Commit/report.

### Task 8: Campaign workspace and schedule exports

**Files:** existing ContentPlannerCampaign model plus scoped service/controller, exports service/controller, routes, PostRules/ContextBuilder/Generation campaign context/retag integration; campaign page, post campaign selector/filter, export controls/API/types/i18n; tests.

**Interfaces:** own-brand campaigns managers create/update/archive, staff read/assign; fields name,goal,start_date,end_date,brief,status. Existing schema reused/add only missing safe fields. CSV/ICS GET export uses validated Posts filters (no page), at most5000 rows; spreadsheet formula neutralization, correct quoted UTF8 CSV, ICS escaping/UID/timezone/day semantics. No public feed/token.

- [x] Add tests for cross-brand campaign/assignment/export denial, staff rights, archive retaining history, campaign in generation context and existing UTM retag behavior, >5000 refusal, CSV formula strings and ICS injection/timezones/DST/date-only entries.
- [x] Implement campaign management and reuse via posts/generation; export filtered view from Posts/Plan with meaningful empty/error feedback. Keep historical post/link data.
- [x] Run relevant backend/frontend/PG export and browser download checks. Commit/report.

### Task 9: Integrated verification and source-patch deployment

**Files:** runbook/handoff/audit coverage/evidence and source manifest; dedicated fresh deploy worktree from latest origin/main. Root owns this task.

- [ ] Reconcile every F01–F17/additional design item to implemented paths/tests. Read fresh whole-branch review and fix Critical/Important findings before release.
- [ ] Run relevant complete PHP scopes on SQLite and fresh migrated PostgreSQL; all frontend tests, TypeScript, lint baseline, PHPStan/Pint as relevant; real-backend browser journeys in both themes/all locales/device sizes, delayed requests/permissions/media/exports/jobs and captured mail. No real customer messages or production posts.
- [ ] Prepare exact A/M/D allowlisted manifest from this clean feature baseline. Rebase source patch onto fresh origin/main in separate deploy worktree with physical vendor; verify full-source parity except generated/documented unrelated main-only additions. No feature generated assets shipped.
- [ ] Run required artifact suites, fresh production build, content/auth/landing checks; commit deploy artifact and push deploy branch to main under explicit authorization. Verify actual loaded Content chunks/new words/endpoints, landing/sibling workspaces, migrations/workers through content/health checks. Stop if a required gate fails.
- [ ] Update runbook/handoff and coverage with exact release/testing/live receipts; stop owned helpers/PG; clean only verified owned worktrees/junctions per Windows rules. Final report states what shipped and any actual limitation.

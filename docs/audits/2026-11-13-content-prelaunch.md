# HexaTech Content — pre-launch audit

**13 November 2026 · Target: https://app.hexa-tech.uk/content · Verdict: hold public launch.**

There are **17 confirmed findings, grouped into four P1 launch blockers and thirteen P2 issues**. The core product has substantial working functionality and its existing tests pass, including on PostgreSQL. The blockers concern paid access and loss or invalid approval of users' work. Passing the current suite does not cover those cases.

This session was an audit. No application code was repaired or deployed, no production posts or brand settings were saved, no real AI generation was requested, and no email or social message was sent. Appearance changes made during inspection were restored to English / Light / Week, with FDS Cards selected and the post editor closed.

## Scope and evidence

Reviewed the Content workspace, its controllers/services/jobs, shared post generation and image generation, tenant/brand middleware, subscription enforcement, module packages and team limits. Inspected all six live areas: Plan, Ideas, Posts, Promote, Strategy and Brand. Opened post details, AI controls and Generate configuration without submitting a live write. Inspected desktop and real 390px device emulation, keyboard behavior, language switching, network responses and runtime diagnostics.

Source checkout: `d38eec69a33dd3cdaf472305ce68ffde54aaae8a`, branch `audit/content-prelaunch-20261113`. Fetched `origin/main`: `99e004ee2a776cc191e6fba41813f0f15bb234c0`. The cited Content files, subscription middleware and team/package implementation have no differences against that fetched main. Shared files have unrelated CRM additions on main; they were inspected for relevance. A fetched commit is not asserted to be the exact deployed build.

| Validation | Observed result |
|---|---|
| PHP 8.5.12, existing Content / ContentCalendar feature and unit suites, SQLite | 541 passed; 3,524 assertions |
| Same suites, PostgreSQL 18.3 database built from all migrations | 541 passed; 3,524 assertions |
| TypeScript build check | Exit 0 |
| Content and shared-workspace Vitest suites | 131 files; 1,284 tests passed |
| Private backend reproductions on PostgreSQL | 34 checks; 221 assertions: 12 audit cases plus 22 inherited module cases |
| Actual React components with deferred local API responses | Seven behaviors reproduced; zero browser page errors |
| Signed-out live requests | Content bootstrap, posts and brand: 401; retired planner profile: 404 |
| Live Strategy Lighthouse snapshot | Accessibility 100; Best Practices 100; manual gaps still found below |
| Live Plan, two desktop performance traces | LCP 928 / 881 ms; CLS 0.30 / 0.30; unthrottled network, CPU 1x |

The audit reproductions deliberately assert the current unsafe behavior. Their passing result confirms the defects; it is not a claim that the intended behavior passes. The image-approval case among the 12 backend audit cases establishes a policy limitation, rather than a counted defect.

Machine-readable results: [verification receipt](2026-11-13-content-prelaunch-evidence/verification.json), [browser reproductions](2026-11-13-content-prelaunch-evidence/browser-reproductions.json), [performance observations](2026-11-13-content-prelaunch-evidence/performance.txt). Screenshots: [desktop Plan](2026-11-13-content-prelaunch-evidence/live-plan-desktop.jpg), [phone post editor](2026-11-13-content-prelaunch-evidence/live-post-phone.jpg), [phone Brand](2026-11-13-content-prelaunch-evidence/live-brand-mobile.jpg).

Private, runnable fixtures and logs remain in `E:/Hexa-Tech-audit-content-20261113/`. The frontend fixture imports the production React components and substitutes only its HTTP boundary and outer test frame. Backend proofs use real controllers/services with fake providers. The disposable PostgreSQL cluster and owned frontend fixture server are stopped.

## P1 — fix before public launch

### F01. Expired customer owners can still use the paid Content API

**Evidence:** [CheckSubscription.php](../../app/Http/Middleware/CheckSubscription.php#L21), [Staff.php](../../app/Models/Staff.php#L39), [User.php](../../app/Models/User.php#L112), [AuthController.php](../../app/Http/Controllers/Api/V1/Auth/AuthController.php#L1262).

The subscription middleware exempts anyone whose tenant staff role is `super_admin`. Registration grants that role to ordinary customer owners. The application already distinguishes those owners from the internal platform administrator through `User::isPlatformAdmin()`.

**Reproduced:** an EXPIRED Content organisation's manager receives 403 `subscription_required`. The same non-platform account with the normal owner role receives bootstrap 200 and creates a post with 201. The organisation remains EXPIRED. Confirmed on SQLite and PostgreSQL without a billing or AI provider call.

**Impact:** owners can continue using paid APIs after a trial or subscription expires; a frontend billing screen cannot enforce this boundary.

**Repair and acceptance:** restrict the exemption to the actual platform operator. Test expired/cancelled owners, managers and staff while preserving access to account/billing recovery routes and the deliberate internal-operator exemption.

### F02. Same-second revisions allow lost saves and approval of unseen text

**Evidence:** [PostController.php](../../app/Http/Controllers/Api/V1/Admin/Content/PostController.php#L307). The revision check compares Unix seconds, which is also the stored timestamp precision.

**Reproduced:** editor A saves at 200 ms and editor B submits its old revision at 700 ms of the same second. Both receive 200; B replaces A's text. With approvals enabled, a staff member changes the words in that second and a manager's old revision still approves them. The final approved words were never the words the manager reviewed. Row locking does not prevent this because both versions have the same timestamp. Confirmed on the real PostgreSQL schema as well as SQLite.

**Repair and acceptance:** use a monotonically increasing revision that every relevant writer advances. Compare it after acquiring the row lock. Include same-second save/save, save/move and save/approve tests; stale operations must return 409 without changing the newer post or approving it.

### F03. An AI response can overwrite a later human edit or publication

**Evidence:** [PostAiController.php](../../app/Http/Controllers/Api/V1/Admin/Content/PostAiController.php#L37), [ContentPostGenerationService.php](../../app/Services/ContentPostGenerationService.php#L37).

The endpoint reads the post, waits for the AI, then updates the old model's words and `status=needs_review` without comparing the current revision.

**Reproduced:** while the provider response is deferred, another writer saves final human text and marks the post published. The AI request then returns 200 with AI words and `needs_review`, overwriting that later work while leaving `published_at` populated. Confirmed through the real service on both databases.

**Repair and acceptance:** capture the input revision and facts, call the provider outside a database transaction, then lock and compare the current row before committing. Preserve newer work and return a conflict when it changed. Apply words, visual brief and approval history atomically. Test intervening saves, platform changes, approval/send-back, publication and deletion.

### F04. A late Create response can erase an unrelated new draft

**Evidence:** [PostPanel.tsx](../../frontend/src/content/panel/PostPanel.tsx#L169), [PanelProvider.tsx](../../frontend/src/content/panel/PanelProvider.tsx#L122).

Create awaits its response and then calls the global `panel.replace(created.id)`. It checks neither the current brand nor the editor's current target. The replacement clears dirty state unconditionally.

**Reproduced in Chromium:** start Create on brand A; switch to B while it is pending, accepting the existing discard prompt; start and type a new B draft; let A finish. B's newer draft disappears without another prompt. A's post is opened under B; the local test API returns the expected brand-scoped 404 and the editor fails to load it. That browser fixture did not exercise a real server refusal. The duplicate callback has the same unguarded replacement pattern; that path is source-confirmed, while Create was executed.

**Repair and acceptance:** bind completion callbacks to the originating brand and editor opening. A stale completion may update its own cache, but must not replace the current editor. Test close/open, another post, brand switching and duplicate completion with newer dirty work.

## P2 — functional and reliability issues

### F05. Edits made while Save is pending can disappear

**Evidence:** [PostPanel.tsx](../../frontend/src/content/panel/PostPanel.tsx#L151), [panelState.ts](../../frontend/src/content/panel/panelState.ts#L153), [SectionCard.tsx](../../frontend/src/content/brand/SectionCard.tsx#L75).

Three separate browser cases reproduced:

- **First Create:** submit hook A, type B while pending, receive success: B disappears when the editor remounts.
- **Existing-post Save:** load A, submit B, intentionally restore A while pending: success replaces that undo with B because rebase compares against the old loaded base instead of the submitted snapshot.
- **Brand Save:** submit a brand name, keep typing while the request waits: success closes the form and drops the later typing.

Preserve changes made after the submitted snapshot, including an intentional return to the original value. Alternatively, consistently disable the entire affected form during the operation. Cover all three cases and the equivalent summary editor behavior before release.

### F06. Unsaved Brand settings are not protected when leaving

**Evidence:** [SectionCard.tsx](../../frontend/src/content/brand/SectionCard.tsx#L43), [ContentShell.tsx](../../frontend/src/content/ContentShell.tsx#L120).

Brand drafts live only in their individual components. Internal navigation unmounts them without protection; switching brand, Full admin, sign-out and unload protection consult only the post panel's dirty state.

**Reproduced:** edit Brand DNA, change its name, navigate to Plan and back: the saved name returns without a prompt. The shared guard reports no dirty work. Register all editable Brand sections with leave protection, and keep drafts scoped to their own brand. Include website summary, link-in-bio and list editors in acceptance.

### F07. Posts can show the old brand's rows under the new brand

**Evidence:** [PostsPage.tsx](../../frontend/src/content/posts/PostsPage.tsx#L52); a suitable existing pattern is [planMath.ts](../../frontend/src/content/plan/planMath.ts#L103).

`keepPreviousData` is unconditional across brand changes. With a warm destination bootstrap and a delayed Posts response, the old rows remain under the new brand's heading, even after the source cache-clearing step. The source then opens those IDs using the new brand's API context; a resulting not-found is inferred rather than a clicked-row outcome executed by this fixture.

**Reproduced:** the production Posts component with deferred B data. Keep placeholder rows only within the same brand. This is a context-display defect; no server tenant or brand escape was established.

### F08. Choosing Published in Status does not update weekly publication goals

**Evidence:** [PostController.php](../../app/Http/Controllers/Api/V1/Admin/Content/PostController.php#L138), [ContentGoals.php](../../app/Services/Content/ContentGoals.php#L47).

Saving `status=published` does not set `published_at`, whereas Mark published does. Goals count the publication timestamp.

**Reproduced:** change a post to Published through the normal save: its status is Published but its weekly count remains zero. Calling Mark published on that same post changes the count to one. Both databases agree.

Use one server transition for every route into Published, including create/save, with a consistent timestamp and history policy. Consider repairing existing Published rows without a timestamp using an explicitly chosen historical-date rule.

### F09. Queued Generate can continue spending after the AI allowance is exhausted

**Evidence:** [GenerateContentCalendar.php](../../app/Jobs/GenerateContentCalendar.php#L80), [ContentCalendarGenerationService.php](../../app/Services/ContentCalendarGenerationService.php#L168), [AiClient.php](../../app/Services/ContentPlanner/AiClient.php#L101).

The monthly allowance is checked when the request queues the job, not when the worker executes it or before each weekly provider attempt. The calendar's transport time budget is a separate limit and does not stop monthly overspend.

**Reproduced:** queue below the cap, consume the allowance before execution, then handle the job: it still calls the fake provider and creates a post. A two-week run on a one-cent cap makes two one-cent calls. Queued strategy execution has the same missing recheck by source review.

Check a fresh, shared allowance immediately before each paid attempt, including retries and weekly chunks. Serialize or reserve allowance across brands/workers where needed; a worker-local cached total cannot provide a strict shared cap. Report partial completion with a budget reason and release the generation lock.

### F10. Write with AI can report failure after already replacing the post

**Evidence:** [ContentPostGenerationService.php](../../app/Services/ContentPostGenerationService.php#L44), [visual brief upsert](../../app/Services/ContentPostGenerationService.php#L349).

Post text/status are saved before the visual brief, without a transaction. Some AI fields are not bounded to their actual varchar columns.

**Reproduced on PostgreSQL:** the AI returns a 256-character brief style for a 255-character column. The response is 502 `ai_failed`, yet the AI hook and `needs_review` have already been committed and no brief exists. This was tested with production-like autocommit behavior in the disposable database, not a synthetic PostgreSQL constraint. The SQLite proof uses a trigger to model that limit.

Normalize and validate all AI output shapes and lengths, then commit post, brief and approval event together after the revision check. A failed save must not leave an apparently failed request's hidden changes behind.

### F11. Raw image-provider error details are exposed by the next post read

**Evidence:** [ImageGenerationService.php](../../app/Services/ContentPlanner/ImageGenerationService.php#L58), [ContentPostPresenter.php](../../app/Services/Content/ContentPostPresenter.php#L144).

The immediate image error is sanitized, but the raw exception is stored in `image_error` and returned on a subsequent GET.

**Reproduced:** a harmless provider-detail sentinel is absent from the 502 response, then appears verbatim in `post.visual_brief.image_error` on GET. This proves the sanitization gap; it does not establish that a real credential has leaked.

Expose a local error code or safe sentence, retain provider details only in server diagnostics, and sanitize historical values on reads. Test both the immediate failure and later reload.

### F12. A queued Generate crossing midnight writes yesterday's posts

**Evidence:** [GenerationController.php](../../app/Http/Controllers/Api/V1/Admin/Content/GenerationController.php#L51), [GenerateContentCalendar.php](../../app/Jobs/GenerateContentCalendar.php#L80).

The past-date clamp runs only before enqueue. **Reproduced:** enqueue a single-day range at 23:59, wait two minutes within the valid lease, execute it after midnight: the provider is called and a post is inserted on the now-past day. Both databases reproduce this.

Recompute venue today at worker start and before inserting results from an in-flight call. Refuse an entirely elapsed range before spending on it, and clearly report skipped days in a partial run.

### F13. The live clock banner and the planner can use different time zones

**Evidence:** [BootstrapController.php](../../app/Http/Controllers/Api/V1/Admin/Content/BootstrapController.php#L46), [VenuePulse.php](../../app/Services/Dashboard/VenuePulse.php#L65), [HolidayCountry.php](../../app/Services/Content/Days/HolidayCountry.php#L33).

**Observed live:** Content bootstrap answers `timezone=UTC`, `timezone_named=false`. Its clock banner answers `Europe/Riga`, `timezone_source=place`, and displays “Riga · venue time”. The latter falls back to the location's zone; planning and reminders continue using UTC. Brand's automatic holiday choice consequently finds no country.

At a day boundary the displayed venue day and planner day can disagree, and reminders can run two hours later than a Riga user expects in winter. Make the effective zone consistent or require an explicit zone during setup and clearly show that planning still uses UTC until chosen. Recheck month, week, reminders, morning email and holiday defaults together.

### F14. Former, inactive colleagues consume seats and block valid downgrades

**Evidence:** [PlanLimitGuard.php](../../app/Services/PlanLimitGuard.php#L104), [PlanModulesController.php](../../app/Http/Controllers/Api/V1/Auth/PlanModulesController.php#L309).

The documented package policy counts active staff, but the quota query counts every historical Staff row. The normal Team interface offers deactivation rather than permanent row removal.

**Reproduced:** Content Standard with one active and three inactive colleagues cannot change to Lite's two seats: 422 `over_limit`, count 4. Confirmed on PostgreSQL and SQLite.

Count active seats consistently. Enforce the same rule on reactivation and invitations under the organisation lock so the repair does not introduce an over-cap activation path.

## P2 — accessibility and visual behavior

### F15. Phone keyboard focus can move behind the full post editor

**Evidence:** [PostPanel.tsx](../../frontend/src/content/panel/PostPanel.tsx#L224), [phone screenshot](2026-11-13-content-prelaunch-evidence/live-post-phone.jpg).

The phone editor uses `role=dialog`, `aria-modal=false`, with no focus trap or inert covered content. **Reproduced in the styled live 390px portal:** Shift+Tab from its heading focuses a covered “Fill with AI” button outside the editor. `elementFromPoint` confirms the panel covers that focused control. No AI action was activated.

Use modal focus management for the full-screen phone editor, prevent interaction with covered content, and restore focus on close. Preserve the intentionally nonmodal desktop dock. Test forward/reverse Tab and resizing between modes.

### F16. Changing UI language leaves the document declared as English

**Evidence:** [LanguageSelect.tsx](../../frontend/src/workspace/ui/LanguageSelect.tsx#L10), [index.html](../../frontend/index.html#L2).

**Observed live:** the Ideas heading becomes “Ideen”, “Idées” and “Идеи” after switching German, French and Russian, while `document.documentElement.lang` remains `en`. The document is never synchronized with the selected locale. This affects assistive-technology pronunciation even though translated strings exist and automated accessibility scored 100 on the English page.

Synchronize the document language with the active UI locale in the shared application shell. Also consider a language annotation for post text whose language differs from the interface. English was restored after the check.

### F17. The Plan jumps noticeably while its data loads

**Evidence:** two live desktop Chrome traces; [PlanPage.tsx](../../frontend/src/content/plan/PlanPage.tsx#L294).

At 1440 × 1000, with CPU 1x and no network throttling, the observed CLS is **0.30 in both runs**. The largest shift in the first trace contributes 0.2495 and affects the calendar/toolbar wrappers; other shifts follow as data appears. Conditional goals and late-loading surrounding data are likely contributors based on source review, rather than a fully isolated cause.

Reserve stable space for the header, goals, channel filters and calendar skeleton. Match skeleton dimensions to the eventual view and check font fallback sizing. LCP was 0.88–0.93 seconds in these samples, so layout stability deserves attention before adding more dashboards. These are lab observations; no real-user field-performance result is claimed.

## Additional review findings and product decisions

These are kept separate from the 17 reproduced/observed issues.

| Item | Evidence and consequence | Recommendation |
|---|---|---|
| Invitation cap has a race | [TeamController.php](../../app/Http/Controllers/Api/V1/Admin/TeamController.php#L208) checks the cap before taking the organisation lock at line 215. Two different invitations can pass the last-seat check before either inserts. Source-confirmed; no concurrent-process reproduction in this audit. | Recheck the quota inside the locked transaction; cover invitations and reactivation with a PostgreSQL concurrency test. |
| Content Pro advertises three locations without a supported management path | [productSignup.ts](../../frontend/src/pages/productSignup.ts#L181) shows locations from the package, while Content-only organisations cannot reach brand/property management under the access map. No Content location-management flow was found. | Provide a permitted management flow or align the package promise with what a Content-only customer can use. Verify the complete paid-customer journey. |
| Approvals currently cover words, not the whole visual post | A staff member can replace an approved/ready image without reapproval and, if assigned as poster, mark it published. Reproduced on both databases. The written release-4 specification deliberately lists word changes only, so this is a policy gap rather than a counted implementation violation. | Decide whether approval covers images/briefs. If the product is presented as approving the complete post, invalidate approval after visual changes as well. |
| Synchronous AI latency remains a launch rehearsal gap | Write, quality, brief, Fill and image actions run inside web requests. The image client allows 120 seconds while the runbook records a 60-second Cloud request timeout. | Rehearse real provider latency/failure on a dedicated test organisation; queue operations that can outlive the request. Fake-provider tests do not establish live upstream reliability. |

## Design and missing-feature priorities

The current typography, brand accent, channel identities and desktop calendar are coherent. A broad visual redesign is less urgent than protecting work and improving the path through existing features.

1. **Give Brand and Strategy section navigation.** On the live 390px screen, Brand is 10,207px tall and Strategy 19,350px. Brand has thirteen sections. Add a visible section index, focused subpages or collapsible sections with clear edit/save state. Keep the important actions reachable while reading a long strategy. This is the highest-value design improvement.
2. **Finish the writing experience.** The 400px panel is useful for quick edits; a full writing view would suit longer copy. Put Platform and Topic near the start rather than hiding both under Targeting & language. Add a channel preview, character guidance and a clear image/media area. The runbook already identifies the larger writing view as deferred release 7b.
3. **Make the manual publishing handoff explicit.** The current product does not publish to social networks. Explain this in onboarding and provide a simple flow: review final caption and destination, copy caption, obtain the asset, open the channel, then mark published. Copy text currently includes hook/body/CTA/hashtags; it does not automatically append a separately saved destination. Insert link is a separate action. This is a workflow limitation, not a claimed clipboard defect.
4. **Add practical media support.** A business needs its own photos, product imagery, video and possibly carousels. Current documented functionality has AI images but no media-library/campaign screens or normal post attachments. Prioritize upload/reuse and asset export before positioning it as an end-to-end production tool. Automatic social publishing can remain a later integration if the launch promise is clearly a planner.
5. **Provide a real getting-started guide.** Live Help & resources contains only Keyboard shortcuts and Find. Add short task walkthroughs for brand setup, time zone/channel rhythm, creating a week, approvals, repeating/versioning, tracking links and manual publication. Include the supported limits and what happens when AI fails or the allowance ends.
6. **Make recovery and long jobs clearer.** Add Retry to a failed post read; currently the initial failure has a notice and reopening the same active ID is short-circuited. Give long generation clearer progress, budget context and cancellation where supported. Explain empty/no-scan/no-profile states with the next action.
7. **Add export and collaboration depth after reliability.** CSV/calendar export, richer approval notifications, mentions, media comments and reusable campaigns would reduce reliance on other tools. They are currently absent or limited, but are not all prerequisites for an honestly positioned planning product.

## What was covered, and what remains unproven

| Area | Coverage during this audit | Remaining acceptance work |
|---|---|---|
| Authentication, subscription and roles | Live signed-out protection; local expired-owner/manager tests; existing access suites | Dedicated launch-account sign-in, expiry and paid recovery against the deployed billing integration |
| Plan, slots, goals, date handling | Live desktop/phone Plan; Generate dialog; existing month/week/list, move, repeat and date tests; midnight and goals proofs | Populated styled drag/undo and long-range generation after repairs |
| Ideas, capture and scheduling | Live board; production component editor tests; existing capture/stage/schedule suites | Styled populated board with manager and staff test accounts |
| Posts and editing | Live real post, AI controls and filters; seven deferred-response browser cases | Retest repaired races with the actual backend in a disposable test organisation |
| Approval, comments, assignments and reminders | Existing PostgreSQL/SQLite suites; stale approval and image-policy proofs; live controls inspected | Two-role browser approval journey and real scheduled morning email in a safe test mailbox |
| Brand, templates, snippets and setup | Live populated Brand; settings draft/save browser proofs; existing setup/template/snippet suites | A completely new Content-only customer's setup, persistence, time zone and package options |
| Website promotion and tracking | Live Promote/no-scan state; scanner, public-address, redirects, links/bio and promotion test suites | Real allowed website scan, queued promotion and public phone link/bio journey using test data |
| AI and worker behavior | Real services with fake text/image providers; queue, money-cap, midnight and storage-failure proofs | Real provider credentials/model access, tail latency, retries, worker restart and monitoring checks |
| Design, accessibility and performance | 1440px and 390px inspection; language smoke checks; Lighthouse snapshot; styled phone focus proof; two Plan traces | Full populated journeys in both themes, all five languages, keyboard/screen-reader checks and a representative slow phone/network |

No new tenant/brand authorization escape was identified in the tested paths. That is a scoped finding, not a guarantee that every possible issue has been excluded. Documented choices—ordinary staff editing posts, public links surviving post deletion, and public pages staying available after expiry—were not reclassified as defects.

## Recommended release order

**First:** fix F01–F04 and preserve pending/unsaved work (F05–F07). Introduce reliable revisions before repairing AI concurrency so the new protection is not still vulnerable within one second.

**Then:** make publication state consistent; enforce worker-side allowances and dates; normalize/atomically save AI results; sanitize stored provider failures; unify the planning clock; repair team quotas. Close the accessibility and layout-stability gaps.

**Before opening sales:** reconcile the Pro location promise and visual-approval policy, add a short manual-publishing/setup guide, and run the remaining real-provider/worker/billing journeys with disposable launch accounts. Convert the reproduced cases into regressions that assert the corrected outcomes. Deploy repaired code only after the repository's source-patch release checks pass.

The evidence supports requesting changes before launch. It does not support a “no functional issues” sign-off.

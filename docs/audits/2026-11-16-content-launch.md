# Content launch release — 16 November 2026

Status: deployed and verified by live content and authenticated read-only checks.

The accepted pre-launch audit fixes and design/features are implemented. All seven whole-branch review findings (three Important, four Minor) were fixed in one wave and closed by the scoped re-review with no new breakage. The original F01–F17 findings and accepted additions are covered below.

## What changed

- Reliability: strictly increasing revisions, stale-result/write refusal, complete-post approval, correct manual publication timestamps, retained drafts and safe Brand/Back/URL transitions.
- AI: queued actions with progress/reopen/retry/cancel, fresh access and allowance checks per attempt, venue-day boundaries, current provider compatibility and stricter usage accounting.
- Workflow and design: one shared panel/full composer, previews and character guidance, structured Brand/Strategy navigation, saved planning time zone and purchased-location management, stable Plan loading, accessible modal focus and all five locales.
- Media and collaboration: verified image/video/PDF upload and reuse, ordered attachments, reversible archive, media-linked comments, explicit mentions, off-by-default personal review/mention emails and a searchable nine-task Guide.
- Campaigns and exports: own-brand campaign management, assignment and generation/UTM context, filtered CSV and ICS downloads with an explicit 5,000-row cap. Publishing to social networks remains manual.

## Verification on the deployed source artifact

| Gate | Passed | Skipped | Assertions | Scopes |
|---|---:|---:|---:|---:|
| release16-core-pgsql | 1379 | 2 | 15790 | 14 |
| release16-core-sqlite | 1371 | 10 | 15744 | 14 |
| release16-booking-sqlite | 841 | 6 | 4403 | 9 |
| release16-booking-pgsql | 47 | 0 | 181 | 5 |
| release16-time-sqlite | 122 | 0 | 776 | 2 |
| release16-time-pgsql | 122 | 0 | 776 | 2 |
| release16-landing-sqlite | 2069 | 0 | 12909 | 3 |

These are per-gate totals; overlapping support scopes are deliberately not advertised as unique tests. PostgreSQL uses a fresh database built from all merged migrations, with UTC test sessions. PHP is pinned to 8.5.12. Every suite is explicit; no bare artisan test was run. PHP source fingerprints stayed unchanged throughout every gate.

- Frontend: 7273 tests across 491 files; TypeScript forced build passes; lint regression passes with 1,381 pre-existing diagnostics remaining. The codebase is not claimed to be globally free of lint diagnostics.
- The final loading source d3430ab8c633264b41c54c0bc0b541ab48fcf0b3 was independently re-reviewed after the large-count repairs. Its exact production-source patch 351b3c1dd2a018fec2b5d176e6406ba861775f9d passed 260 canonical and 290 large-count layout checks (30 cases each), the original110 browser checks, forced TypeScript and the full frontend suite. The three mandatory Landing scopes passed on this same checkout; all PHP/Landing dependency trees remain byte-identical after the frontend-only repairs. Backend and dependency blobs remain identical to the first verified release, so the seven backend gates and PHPStan evidence above remain applicable. Existing conditional wheel checks naturally do not run when the wider desktop strip fits all five platforms; native Tab visibility checks remain.
- Static analysis: all 71 changed application PHP paths pass with zero PHPStan global/file errors; no new suppression or baseline change.
- Dependencies: locked Composer install preserves main’s Laravel 13.40.0 and phpseclib 4.0.3 security updates. Composer audit and frontend npm audit report zero advisories.
- Final code CI00e4de78: all8 jobs pass, including PostgreSQL18 with only the documented known-failure allowance, three SQLite shards, Larastan, Node24/26 and the dependency audit. [Pipeline](https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/43848030732).
- Behavioral evidence: 110 deterministic browser checks retain the original 84 and add 26 final cases; real local API/database/queue checks cover stale actions (22), media (59), collaboration/logged mail (37) and raw PostgreSQL inbox precision (4). Campaign/export checks include real 5,000-row CSV/ICS files and 5,001-row refusal.
- Visual coverage: both themes, all five locales and 390/1024/1440 layouts, delayed responses, keyboard focus, native image/video/PDF rendering, form retention, upload/download and manual handoff. Actual provider transport is faked locally; controllers, storage, database and queue services execute normally.

## Source integrity and deployment

Reviewed feature: 8bd8f1629071270afde462d20001e1158dd044da, from baseline 99e004ee2a776cc191e6fba41813f0f15bb234c0. The final release is a source patch onto current production main 013d05e72c17cd3cafb18aca0873a0848e82c90d, preserving its booking journey, promotions and Time Planner work. Source commit: 1c95c79e1b69fab34e06a7d0814e66550a9cf063.

The manifest contains 235 Content source paths: 233 exact feature blobs, plus the verified three-way route union and exact combined historical handoff. The Windows booking helper is renamed without changing its current-main implementation; exactly two imports change. Of 149 incoming-main source paths, 144 remain byte-identical; the five exceptions are the two compositions and the three rename/import paths. Dependency locks remain main’s. No Content process artifacts or feature-built assets are shipped. Main’s pre-existing unrelated process note is preserved unchanged.

Deployment uses a separate fresh-main worktree with physical dependencies on E:, a fresh production build and the repository source-patch recipe. The generated public assets exclude the admin shell and build statistics. Cloud rebuilds assets, so live verification checks content rather than expecting local bundle hashes.

Release record: {"date":"2026-11-16","main_base":"013d05e72c17cd3cafb18aca0873a0848e82c90d","feature":"8bd8f1629071270afde462d20001e1158dd044da","source":"1c95c79e1b69fab34e06a7d0814e66550a9cf063","build":"2b4ed33a76d02f45d0903cd9f42f74f8c67f50f2","remote_main":"2b4ed33a76d02f45d0903cd9f42f74f8c67f50f2","stage":"initial launch deployed and functionally checked; F17 completed by final follow-up","final_followup":"00e4de78e4e472b55340c5eaef7cb9ac38685537"}
Layout follow-up release: {"date":"2026-11-16","main_base":"2b4ed33a76d02f45d0903cd9f42f74f8c67f50f2","feature_tip":"d3430ab8c633264b41c54c0bc0b541ab48fcf0b3","source":"351b3c1dd2a018fec2b5d176e6406ba861775f9d","build":"00e4de78e4e472b55340c5eaef7cb9ac38685537","remote_main":"00e4de78e4e472b55340c5eaef7cb9ac38685537","stage":"deployed; live content and authenticated verification passed","live_verified":true,"pushed_at":"2026-11-16T10:20:58.6807263Z","live_checked_at":"2026-11-16T10:38:40.317Z","live_entry":"/spa/assets/index-_xYuyRgF.js","live_content_chunk":"/spa/assets/ContentApp-OmO6Ta2S.js"}

## Live checks and loading behavior

Live verification receipt: {"passed":true,"checked_at":"2026-11-16T10:38:40.317Z","entry":"/spa/assets/index-_xYuyRgF.js","content_chunk":"/spa/assets/ContentApp-OmO6Ta2S.js","content_markers":{"Save and mark published":true,"collaboration-email":true,"max_upload_bytes":true,"exports/":true,"write/":true,"c-plan-platforms":true,"number_labels":true},"signed_out":[{"path":"bootstrap","status":401},{"path":"media","status":401},{"path":"work","status":401},{"path":"settings","status":401},{"path":"locations","status":401},{"path":"campaigns","status":401},{"path":"exports/csv","status":401}],"authenticated":{"bootstrap":200,"settings":200,"media":200,"locations":200,"campaigns":200,"inbox":200,"absent_work":404},"max_upload_bytes":20971520,"timezone":"UTC","timezone_named":false,"collaboration_email":false,"footer_menu_passed":true,"ui_preferences_restored":true,"cold_loads":6,"worst_cls":0.004076408536326477,"browser_errors":0,"api_errors":0,"document_overflow":0,"landing":{"status":200,"styles":[{"path":"/landing/nocturne_ritual.css","status":200,"bytes":64577,"rp_markers":0,"exact_local_bytes":true}],"refused":[{"path":"/landing/ruled_page.css","status":404},{"path":"/spa/index.html","status":404},{"path":"/spa/stats.html","status":404}]},"siblings":[{"path":"/time/assistant","status":200,"admin_shell":true},{"path":"/time/coach","status":200,"admin_shell":true},{"path":"/loyalty","status":200,"admin_shell":true},{"path":"/crm","status":200,"admin_shell":true},{"path":"/appointments","status":200,"admin_shell":true}],"ci_commit":"00e4de78e4e472b55340c5eaef7cb9ac38685537","ci_success":8,"ci_pending":0,"production_writes":0,"paid_provider_calls":0,"real_external_email_sends":0,"live_worker_console_health_verified":false}

| Viewport | Before CLS (two cold loads) | After CLS (two cold loads) |
|---|---|---|
| 1440 | 0.268061 / 0.268061 | 0.000000 / 0.000000 |
| 1024 | 0.141623 / 0.354485 | 0.004076 / 0.000000 |
| 390 | 0.062709 / 0.166183 | 0.000000 / 0.000000 |

The live comparison uses the same signed-in tenant, exact emulated viewport/DPR and read-only Plan route on 16 November. It is a small lab sample, not field Core Web Vitals. The earlier same-data local 12-run comparison also reduced CLS at all three sizes; development LCP is not compared with production.

## Acceptance coverage

| Accepted item | Final implementation and evidence |
|---|---|
| F01 customer-owner subscription bypass | CheckSubscription reserves bypass for real platform admins; access/product/auth suites and actual tenant/product boundary6. |
| F02 same-second stale writes | Monotonic microsecond updated_at, model/migration and shared locked ContentPostWrites; SQLite/PG frozen/backwards revisions and actual HTTP9. Final Mark ready/published also require the viewed revision; root actual22. |
| F03 AI replacing newer work | Per-attempt current revision/access/allowance and locked result comparison; actual HTTP/database queue47+35 checks across all six actions, edit/cancel/deadline cases. Browser110 includes typing retained while results arrive. |
| F04 pending Create losing later text | One shared draft provider with submitted-snapshot rebase and in-place identity; original RED, root response-held actual API8 and final full-composer11. |
| F05 stale brand/editor callbacks | Origin/opening/discard fences across brand, URL, Back and pending Duplicate; final same-opening Duplicate merges later typing rather than discarding it; browser110. |
| F06 leaving Brand loses changes | Retained registry and navigation guards for original forms, settings/locations and all new sections; snippet/template completion fixed, clean planning zone refresh adopts authoritative settings while dirty forms retain edits. |
| F07 previous-brand placeholder | Current-brand-only placeholders, deterministic browser RED/GREEN and actual cross-brand UI acceptance. |
| F08 Published missing timestamp | Shared publication writer, conservative existing-data migration, idempotent repeated mark; explicit Save and mark published label/manual explanation. Actual HTTP9+final22. |
| F09 stale allowance | Current shared allowance before every paid attempt, canonical current image models, strict unpriced refusal and conservative malformed-usage accounting; process-level PG race and actual SDK/queue16. |
| F10 partial AI/varchar writes | Normalize words/brief before atomic locked changes; production-like PG constraints and rollback assertions preserve approval/history on refusal. |
| F11 raw provider failures | Persist/answer safe local error codes; all five locales translate model/setup/failure reasons, Blob export failures decoded before workspace/subscription observers. |
| F12 late worker dates | Venue-day clipping at execution and recheck before each insert, deadline/cancel/fresh access checks; actual queued-action cases. |
| F13 planning clock disagreement | Account's saved named zone governs pulse/planning/reminders/exports; explicit unnamed UTC and manager setup. Real settings HTTP9 and all-five locale UI; final clean refresh4 cases preserves Riga and dirty draft. |
| F14 inactive seats | Active-only quota and shared org lock for invite/reactivate; deterministic PG last-seat proof and account/module regression scopes. |
| F15 focus behind phone editor | Shared modal scope/inert stack/restore, nested confirmations, overlay-to-dock, full composer and keyboard acceptance; browser110, actual theme/width checks. |
| F16 document language | i18n synchronizes html lang for all five locales; post preview uses its content language. Actual locale/theme/size matrix and focused tests. |
| F17 loading shift | Final viewport-bound Content rail, independently scrolling navigation/unclipped footer, reserved filter rows and intrinsic figure grid. Exact artifact 260 canonical + 290 large-count checks/60 locale-theme-size cases + original110 pass. Actual same-tenant live CLS: 1440: 0.000000/0.000000; 1024: 0.004076/0.000000; 390: 0.000000/0.000000. All six cold loads have0 overflow/browser/APIerrors; small lab sample, no field-CWV claim. |
| Invite race / purchased locations | Shared org-level quotas include inactive/all-brand properties. Full-admin upload occurs outside lock, authoritative insert inside; own-request cleanup on failure. Content rights/endpoints/UI, safe actual HTTP9. |
| Complete-post approval | Brief/image/ordered media changes invalidate approval under the same revision; root media59 includes stale/no-op/approval/archive/copy/restore cases. |
| Long synchronous actions | Queued six-action work API with progress, reconnect/reopen, retry and cancel; existing ai worker queue. No real paid provider smoke claimed. |
| Brand/Strategy navigation | Twelve explicit Brand groups retain thirteen original areas; URL/Back/sticky controls and all new forms use shared ownership guards. Long Strategy fixture now ~888px overview versus12930px baseline. |
| Spacious composer | /content/write/new or id shares the panel's exact draft; platform/topic, preview/counts, ordered assets and transitions; no second editor controller. |
| Manual handoff | Copy ready caption, safe saved channel URL, obtain assets, explicit manual Mark published; destination append avoids duplication. Automatic social publishing remains later. |
| Media library | Verified JPEG/PNG/WebP, MP4/WebM, PDF, effective web cap up to20MiB, max10 ordered own-brand refs and reversible archive. Actual HTTP59, three images decode/two videos play/PDF links safe. Live Cloud effective upload cap20MiB (20971520bytes). |
| Guide | Nine task walkthroughs with search/filter/role-aware actions, help/setup/timezone/recovery/manual limits; actual Guide30 plus feedback16 and reviewed screenshots. |
| Recovery | Read Retry, actionable queued errors/progress/cancel/reopen, ownership checks through Full/panel/list/Back/brand; original84 browser checks retained plus26 final cases. |
| Collaboration | Explicit own-brand mentions, immutable attached-media comment context, same-second inbox read precision; off-default personal review email separate from morning consent, after-commit dedupe and fresh delivery rights. Root actual HTTP/logmailer37 and raw PG inbox4; no real external messages. |
| Campaigns / exports | Manager own-brand CRUD/archive, staff assignment, generation/UTM context, history-safe links. Filtered human CSV with BOM/formula tab protection and scheduled ICS, strict5000 limit/no truncation. Root small57 + large6 + real UTM/queue16;5001 refused and5000 files parsed (~102MB CSV/~107MB ICS), all fixtures removed. |
| Current provider prices | Current Sunburst/Flare and canonical legacy aliases, SDK normalization and strict price guards. Omitted optional total derived only from valid complete components; actual SDK ledger1c vs old6c regression. No paid output-quality claim. |
| Same-second inbox loss | Microsecond delivery/read storage and delayed acknowledgment comparison; real PG RED then4 GREEN, no main-post revision mutation. |
| Old serialized jobs | Actual nullable defaults for calendar campaignId and version/repeat userId; old payloads execute continuation/chaining tests without uninitialized fields. |
| Static analysis | Final71 changed application PHP files: zero PHPStan global/file errors; no suppression/baseline changes. Frontend lint regression passes with1381 pre-existing diagnostics, not a globally clean lint claim. |

## Limits and failed-attempt accounting

No paid provider/output-quality smoke test, real external mail send, production media upload or production post write was made. Automatic social publishing remains later. Review/mention emails are at-most-once attempts and can be lost after ambiguous/failed transport; in-app news remains. Usage insertion is best effort through ledger outages. Non-destructive image retention can leave unreferenced files. These are explicit accepted limits, not delivery or outage-durability guarantees.

Earlier failed runs are retained: Windows paging/disk pressure stopped the first artifact startup; the filename ambiguity was fixed by the unchanged-helper rename and the current typecheck passes. An incoming booking PostgreSQL assertion exposed the local server’s Europe/Kiev default; UTC is now pinned only for isolated test processes, with the full required PostgreSQL gates rerun. No failing attempt is counted as a pass.

The first follow-up matrix attempt also stopped on Windows memory allocation. The same committed code passed when local Tailwind/esbuild worker concurrency was bounded; tests and assertions were not weakened. The initially deployed tablet CLS remained 0.299750, so that attempt was not accepted as final F17 closure: the follow-up reserves the platform strip, separates figures, and bounds the Content rail while leaving footer menus unclipped.

The extra delayed five-digit-count fixture caught two further phone vertical failures (wrapping figures and Key dates), plus a small desktop horizontal movement. An intermediate source matrix was280/300 with20 desktop-position failures. That deferral was revoked under Ruling23: desktop filters now also reserve separate full-width platform/control rows, so the final canonical and large-count matrices pass fully without weakening any assertion. Historical failed exploratory receipts are retained and are not described as green tests.

## Rulings I made

1. Ruling: extend existing services and UI rather than rewrite — preserves proven behavior and approved house design — costs compatibility complexity.

2. Ruling: keep updated_at as a strictly increasing microsecond revision instead of introduce a mandatory new client field — compatible with old raw API tokens — requires full-precision comparison/model/migration/client helper checks.

3. Ruling: visual approval invalidates staff approval after image/brief/media change — user approved audit's complete-product improvements — may create additional review work, safer than silently publishing unseen visuals.

4. Ruling: saved planning zone governs Content pulse/reminders; unset UTC is explicit, manager must choose — avoids silently reinterpreting stored wall clocks — one setup step.

5. Ruling: include all audit current improvements, exports/campaigns/mentions/opt-in notifications; automatic social publishing remains explicitly later per audit — preserves the agreed manual planner scope — no network connection wizard in this release.

6. Ruling: use E: because C: has about5.6GB free; physical vendor, frontend node_modules junction allowed — protects owner workspace and PHPUnit identity — larger owned worktree remains until release complete.

7. Ruling: implement media comments as plain-text discussion optionally associated with one of this post's attached own-brand media assets; timeline preserves safe asset context after detach/archive. This fulfills asset feedback with existing comments instead of a separate annotation engine; if wrong, users needing pixel/frame annotation still need that later. Add optionalmedia_id POST, validate attachment under post lock, immutable association on comment edit, tests foreign/unattached/detach/archive/notification cases; UI asset selector and timeline preview/link. No root source edits while Task3 runs.

8. Ruling: preserve explicit status transitions/API compatibility; Save/preview have no implicit publication. If a draft is changed to Published, label the action 'Save and mark published' and explain it records manual publication; primary handoff remains explicit Mark published. This avoids a misleading generic Save label; if wrong, the workflow gains a small extra wording burden. Amend Spec/Task6 before its dispatch. No source edit during Task3.

9. Ruling: use fast quota precheck, upload outside transaction, authoritative quota recheck+insert under same short org lock; safely retire only newly generated request asset on lost race/insert failure outside lock. Preserves original no-property-on-upload-failure semantics and avoids blocking all org work through R2 I/O; cost if wrong is rare refused-race upload/retirement overhead or orphan on cleanup failure. Implementer agreed, adding autocommit storage-adapter test for actual upload/cleanup depth0, precheck no-upload and failure cleanup. Before refinement fullPG equivalent760 passed2skips12177 assertions; affected scopes will rerun. Task4 not yet committed/reviewed.

10. Ruling: supplemental provider compatibility task executes before composer integration because retired default and unmapped successful-image cost can fail launch/bypass AI allowance; keep current Content text model, existing saved media/history, and no paid integration smoke; if wrong, conservative cost estimates may consume allowance faster and legacy image aliases intentionally change generated appearance.

11. Ruling: preserve new safe ai_model_unpriced in existing promotion/website-summary/version error-code result fields as well as post/work/Fill/calendar, but do not add error fields to Strategy/repeat - legacy callers should direct setup rather than futile Retry; costs a few narrow test/consumer-mapping updates. Root answered activeTask10 agent; exact affected frontend unions/families go in its report for6. No broader error-taxonomy refactor. Actual SDK malformedusage REDconfirmed before narrow PSRnormalizationfix; agentfullSQLite scope nowrunning with final13providercases174assertions and PHPStan clean.

12. Ruling: CSV is a human spreadsheet export, protect risky formula prefixes (incl leading controls/whitespace/full-width variants) using tab inside quoted field per current primary OWASP guidance; if wrong, programmatic importers must handle a retained tab. Do not claim universal roundtrip safety. Task8 brief linked actualprimarydocs.

13. Ruling: CSV includes filtered undated posts with blankdates; ICS excludes undated because no truthful event day exists, date-only scheduled posts remain all-day and timed export derives actualinstantfromsavedzone. Empty export422 export_empty; >5000exportables422 export_too_many/refinefilters, never silenttruncation. If wrong, users seeking an undated backlog in calendar need CSV or assign dates first. Task8 brief records explicit UI/Guide explanation, no undefinedTZID, boundedmemoryselection.

14. Ruling: use the Spec's12 explicit Brand navigation groups (Overview,Website,Identity,Audiences,Voice,Positioning,Channels,Locations,Links,Dates & approvals,Reusable content,Rhythm), retaining all13 original areas through grouped subcontent. The prior13 count described existing sections, not13required new nav labels; costs one extra click into grouped dates/reusable areas if wrong. Task6brief corrected beforedispatch, no artificial extra group.

15. Ruling: review email listens to existing semantic approval events (including explicitCreate/Save reviewtransition andchanged_after_approval), not genericSave hooks; ordinarysave/upload/previewwithoutevent sendsnothing. BindingSpec intendsapprovalnotifications whileTask7'sno-save-mail wordingwasambiguous; ifwrong, opted-in recipients receive additional genuine review-event emails. PersonalconsentdefaultoffandexistingInboxrecipientpolicypreserved. Task7brief/pendingSpecparagraphclarified; commitatclean6barrier, notduringsourcefix.

16. Ruling: the human spreadsheet CSV emits UTF8 BOM for normal Excel opening, per current Microsoft primary guidance, alongside existing quoted formula protection; SpecUTF8 doesnotforbidBOM. Without it, non-Latin/accented text may require manual encoding import. Ifwrong, programmatic consumers must strip the first header marker. Task8brief updated and activeimplementer notified; no producttechnicaljargon/newformat/dependency. Root parser alreadytoleratesBOM; smallactualbytes rerunafterfinalbackend, prior100MBboundaryspoolingunchangedapart3bytes.

17. Ruling: retain documented at-most-once review/mention email attempts with in-app news rather than adding a delivery outbox/retry redesign; avoids duplicate ambiguous sends and fits existing mail patterns. If wrong, an ambiguous or failed transport can lose an email and require manual follow-up.

18. Ruling: retain existing best-effort usage insertion policy without an outage-reservation subsystem, explicitly excluded by Spec; do not advertise durable allowance accounting through ledger outages. If wrong, a billable attempt whose usage insert fails may be absent from allowance totals and needs operational investigation.

19. Ruling: preserve current non-destructive generated-image retention during this launch rather than invent reference-aware garbage collection; referenced media/history must remain safe. If wrong, a stale/cancelled result can leave an unreferenced file consuming storage until a later cleanup policy.

20. Ruling: keep platform filters in one reserved, horizontally scrollable strip, with Status, Unscheduled and Key dates in a stable group — late channel data otherwise moves existing controls and guessed minimum heights fail with languages or different channel counts — on narrow screens or panels some platforms need horizontal scrolling; keyboard, touch, focus visibility and a visible scrolling affordance must remain usable. This implements F17 within the existing filter design; no control or platform is removed.

21. Ruling: use a Content-only optional native title fallback for slim navigation links when their rail must scroll, retaining custom CSS tooltips where they are not clipped — this keeps the short-window menu reachable without introducing a new portaled-tooltip subsystem — native tooltip appearance and timing follow the browser and can differ from the house popup; accessible link names, focus and keyboard reachability must remain intact.

22. Ruling: retain the small desktop horizontal count-width movement for this release instead of adding an arbitrary maximum-width placeholder or rearranging all filter groups — the scoped review confirms it preserves reserved vertical space, full labels, reachability and negligible measured CLS, while the demonstrated phone vertical failures must be repaired — a delayed five-digit backlog can still move the desktop Status/Unscheduled controls about26px; further horizontal alignment polish remains open and must be reported.

23. Ruling: supersede the desktop movement deferral in Ruling22 and require the retained large-count regression to pass fully before deployment — the repository release guard stops on failing checks, and the user's authorized all-fixes scope lets us repair the remaining alignment without requesting another approval — a structural second desktop filter row may use more vertical space; keep all controls/labels usable and do not hide or weaken the count-position assertion. Preserve Ruling22 as a superseded decision rather than erase it.

## Evidence and operating notes

Detailed local receipts and the curated task/final-review archive are at E:/Hexa-Tech-content-launch-evidence-20261113. Do not publish local-session.json or environment files. The repository runbook is docs/content-workspace.md; the original audit is docs/audits/2026-11-13-content-prelaunch.md. Reload Content/admin tabs left open across deployment before saving.

# Landing-Page Builder Phase 2 — Wizard and Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A non-technical tenant on the Enterprise plan can create, edit and publish their landing page entirely from the admin panel, without an API client.

**Architecture:** Phase 1 shipped the renderer, the public host, publishing and redirects, and is live in production. This phase adds the two write paths that are missing from the backend (section enable/reorder, and a writer for `is_featured`), then builds the admin surface on top: a four-step wizard following the house onboarding contract, and a two-pane editor with a live iframe preview of the tenant's real page.

**Tech Stack:** Laravel 13 (PHP 8.3+), React 18 + TypeScript + Tailwind, react-query v5, react-hot-toast, i18next, lucide-react. Tests: PHPUnit (Feature + Unit), Vitest for frontend units.

**Spec:** `docs/superpowers/specs/2026-08-21-landing-page-builder-design.md` (§9 wizard/editor, §10 gating, §11 phases)
**Conventions brief:** `docs/superpowers/specs/2026-08-21-landing-page-builder-appendix-a-integration.md` (§7 is the binding UI convention set; §2 security; §5 images)
**Template brief:** `docs/superpowers/specs/2026-08-21-landing-page-builder-appendix-b-templates.md`

---

## Global Constraints

These bind every task. Copied from the spec and Appendix A §7; exact values are verbatim.

**Scope**
- **No media upload in this phase.** No logo upload, no hero upload, no gallery. Spec §9 "Placeholder imagery" records why. Do not add an `<input type="file">` anywhere in this plan.
- The public renderer is **not** gated and must not be touched except where a task says so explicitly.

**Backend**
- Admin API path prefix is `/v1/admin/…` and is **mandatory**.
- Landing-page admin routes live inside `Route::middleware('feature:landing_pages')` in `routes/api.php`. The **teardown verbs (`unpublish`) deliberately sit outside it** and carry `->withoutMiddleware('check.subscription')` — do not move them back in.
- A route that writes a resource must sit in the same feature-gate group as the settings screen that owns those fields, or a downgraded org gets a wizard that 402s halfway through.
- Every landing-page query in admin controllers is tenant- and brand-scoped by the model's global scopes. Never add `withoutGlobalScopes()` to an admin path.

**Frontend**
- **Surface token: `bg-dark-surface`** for every card in this feature. Appendix A §7.4 flags `bg-dark-card` vs `bg-dark-surface` as an unresolved conflict (525 vs 18 uses, and they are different shades). Resolved here in favour of `bg-dark-surface`.
- **No hardcoded hex or font in admin chrome.** `applyThemeToDom()` rewrites `--color-*` per tenant. Inline hex is correct **only** for values that ARE customer data being previewed (the template swatches, the page's own brand colour).
- All server calls go through the shared axios `api` (`frontend/src/lib/api.ts:19`), which auto-attaches the Bearer token **and `brand_id`**. **Never pass `brand_id` manually.**
- **No optimistic updates.** No `onMutate`, no rollback — matches the whole codebase.
- **No autosave, no debounce.** Appendix A §7.6: neither exists anywhere in the admin, and introducing one is a new pattern, not a convention. The spec's word "autosave" is delivered as: an explicit Save button disabled until dirty, the verbatim status bar from §7.6, **plus** localStorage draft persistence for the wizard so a crash loses nothing.
- **i18n: always the inline-default form**, `t('landing_pages.x', 'Fallback')`. Appendix A §7.8 notes the existing wizards contain zero `t()` calls while their host pages are fully translated; we translate, so nothing can ever render as a raw key.
- Pages **never set their own padding or max-width** — `Layout` supplies `p-4 lg:p-6`. Wizards self-centre as the documented exception (`max-w-3xl mx-auto pb-16`).
- The word **"slug" never appears in the UI**. It is "Web address", shown whole with a Copy button.

**Verbatim class strings** (Appendix A §7.4 — copy exactly, do not restyle):
```
card       = 'bg-dark-surface border border-dark-border rounded-xl p-5'
cardTitle  = 'text-sm font-semibold text-white flex items-center gap-2'
label      = 'block text-xs text-t-secondary mb-1.5'
input      = 'w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:border-primary-500 outline-none'
btnSec     = 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-dark-bg border border-dark-border text-t-secondary rounded-lg hover:text-white'
kicker     = 'text-[11px] font-mono uppercase tracking-[0.14em] text-primary-500'
btnPrimary = 'px-5 py-2.5 text-sm font-medium bg-primary-500 text-black rounded-lg hover:bg-primary-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
```

**Environment (these will cost an hour each if ignored)**
- **NEVER run bare `php artisan test`** — it segfaults. Always scope: `php artisan test tests/Feature/Landing/`.
- Local PHP is older than `symfony/var-dumper` wants: a FAILING test can crash the reporter inside `Caster.php` instead of printing a failure. If you get a crash rather than a red test, re-run that one test in isolation.
- **Never use a bash heredoc containing backslashes** — this environment mangles them and has corrupted source files. Use the Edit tool, or write a Python script with the Write tool and run it.
- Run `php artisan view:clear` after restoring any mutated Blade file, or the compiled-view cache serves the mutated template and fakes your result.
- `npm install` in `frontend/` after any pull, or the build fails.
- Frontend `useSubscription().hasFeature()` **returns `true` on localhost before it reads anything** (Appendix A §3.3) — local testing proves nothing about gating. Gating must be proven by a backend test.
- Baseline that must stay green: `php artisan test tests/Feature/Landing/ tests/Unit/Landing/ tests/Unit/Support/` → **415 passed, 1253 assertions**.

---

## File Structure

**Backend — create**
- `app/Http/Controllers/Api/V1/Admin/LandingPageSectionController.php` — enable/reorder only. Separate from `LandingPageController` because that file already owns page CRUD and publishing; sections are a different resource with a different validation shape.
- `app/Http/Controllers/Api/V1/Admin/LandingOnboardingController.php` — the wizard's prefill + apply endpoints. Thin, delegates to the service below.
- `app/Services/Landing/LandingOnboardingService.php` — builds the prefill payload and applies the wizard in one transaction.

**Backend — modify**
- `routes/api.php` — register the new routes inside the existing `feature:landing_pages` group; add one review-submission write route inside the existing `feature:reviews` group.
- `app/Http/Controllers/Api/V1/Admin/AdminReviewController.php` — add `setSubmissionFeatured()`.
- `app/Http/Middleware/LandingPageSecurity.php` — allow the admin origin to frame **the preview route only**.
- `app/Http/Controllers/Landing/LandingPageController.php` — mark the preview response as framable.

**Frontend — create**
- `frontend/src/pages/LandingPages.tsx` — host page. Owns the gate/wizard decision and the tab state, nothing else.
- `frontend/src/pages/landing/LandingWizard.tsx` — the four-step wizard.
- `frontend/src/pages/landing/LandingEditor.tsx` — two-pane editor shell + save bar.
- `frontend/src/pages/landing/LandingPreview.tsx` — the iframe preview pane with desktop/mobile toggle.
- `frontend/src/pages/landing/sections.ts` — shared section metadata + types used by both wizard and editor.

**Frontend — modify**
- `frontend/src/App.tsx` — lazy import + gated route.
- `frontend/src/components/Layout.tsx` — nav entry.
- `frontend/src/pages/Reviews.tsx` — the featured toggle in the submissions list.

---

## Task 1: Section enable/reorder API

Phase 1's `store()` seeds `landing_page_sections` rows with `enabled = true` and `sort = index`, and **nothing can change them afterwards**. The wizard's step 4 and the editor's section list both need this. Two existing tests — `RuledPageRenderTest::test_a_disabled_section_is_not_rendered` and `RuledPageSectionsTest::test_switching_booking_off_takes_its_dead_anchors_with_it` — currently assert behaviour no API caller can produce; this task is what makes them mean something.

**Files:**
- Create: `app/Http/Controllers/Api/V1/Admin/LandingPageSectionController.php`
- Modify: `routes/api.php` (inside the existing `feature:landing_pages` group)
- Test: `tests/Feature/Landing/LandingPageSectionApiTest.php`

**Interfaces:**
- Consumes: `App\Models\LandingPage` (has `sections()` hasMany), `App\Models\LandingPageSection` (columns `landing_page_id`, `key`, `enabled`, `sort`).
- Produces: `PUT /api/v1/admin/landing-pages/sections` accepting `{sections: [{key: string, enabled: bool, sort: int}, ...]}`, returning `{page: LandingPage with sections}`. The frontend calls this as `api.put('/v1/admin/landing-pages/sections', {sections})`.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Landing/LandingPageSectionApiTest.php`. Follow the auth/tenant setup used by `tests/Feature/Landing/LandingPageAdminApiTest.php` — read that file first and reuse its `actingAsEnterpriseAdmin()` helper (or its inline equivalent) rather than inventing a new fixture.

```php
public function test_it_toggles_a_section_off(): void
{
    $page = $this->makePageWithSections();   // helper from LandingPageAdminApiTest

    $res = $this->putJson('/api/v1/admin/landing-pages/sections', [
        'sections' => [['key' => 'reviews', 'enabled' => false, 'sort' => 5]],
    ]);

    $res->assertOk();
    $this->assertDatabaseHas('landing_page_sections', [
        'landing_page_id' => $page->id, 'key' => 'reviews', 'enabled' => false, 'sort' => 5,
    ]);
}

public function test_it_refuses_a_key_that_is_not_on_this_page(): void
{
    $this->makePageWithSections();

    $this->putJson('/api/v1/admin/landing-pages/sections', [
        'sections' => [['key' => 'not_a_section', 'enabled' => true, 'sort' => 0]],
    ])->assertStatus(422);
}

public function test_it_cannot_touch_another_organizations_sections(): void
{
    $mine    = $this->makePageWithSections();
    $theirs  = $this->makeOtherOrgPageWithSections();

    $this->putJson('/api/v1/admin/landing-pages/sections', [
        'sections' => [['key' => 'reviews', 'enabled' => false, 'sort' => 0]],
    ])->assertOk();

    // Their row is untouched: the tenant scope resolved MY page, not theirs.
    $this->assertDatabaseHas('landing_page_sections', [
        'landing_page_id' => $theirs->id, 'key' => 'reviews', 'enabled' => true,
    ]);
}

public function test_it_404s_when_this_brand_has_no_page_yet(): void
{
    $this->putJson('/api/v1/admin/landing-pages/sections', [
        'sections' => [['key' => 'reviews', 'enabled' => false, 'sort' => 0]],
    ])->assertNotFound();
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php artisan test tests/Feature/Landing/LandingPageSectionApiTest.php`
Expected: FAIL — route not defined (404 on every case).

- [ ] **Step 3: Write the controller**

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\LandingPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Enable/disable and reorder the sections of the caller's own landing page.
 *
 * Separate from LandingPageController because that class owns page CRUD and
 * publishing; a section is a different resource with a different shape, and
 * folding this in would have made update() a second, differently-validated
 * write path into the same row.
 *
 * The page is resolved through the model's global scopes, never from a route
 * parameter -- there is one page per brand, so the caller's tenant + brand
 * already identify it, and an {id} segment would be an IDOR surface with
 * nothing to gain.
 */
class LandingPageSectionController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'sections'           => 'required|array|min:1',
            'sections.*.key'     => 'required|string|max:64',
            'sections.*.enabled' => 'required|boolean',
            'sections.*.sort'    => 'required|integer|min:0|max:999',
        ]);

        $page = LandingPage::with('sections')->first();

        abort_if($page === null, 404);

        $known = $page->sections->pluck('key')->all();

        foreach ($data['sections'] as $row) {
            if (!in_array($row['key'], $known, true)) {
                // Refused rather than created. A key this page does not own is
                // either a stale client or a typo, and silently inserting it
                // would put a section on the page that the renderer has no
                // partial for -- which the layout then skips, leaving a row in
                // the table that nothing will ever explain.
                throw ValidationException::withMessages([
                    'sections' => "This page has no section called '{$row['key']}'.",
                ]);
            }
        }

        DB::transaction(function () use ($page, $data) {
            foreach ($data['sections'] as $row) {
                $page->sections()
                    ->where('key', $row['key'])
                    ->update(['enabled' => $row['enabled'], 'sort' => $row['sort']]);
            }
        });

        return response()->json(['page' => $page->fresh('sections')]);
    }
}
```

- [ ] **Step 4: Register the route**

In `routes/api.php`, inside the existing `Route::middleware('feature:landing_pages')->group(...)` block (the one containing `show`, `store`, `update`, `publish`, `preview-url`), add:

```php
Route::put('sections', [LandingPageSectionController::class, 'update']);
```

Add the import at the top of the file next to the existing `LandingPageController` import:

```php
use App\Http\Controllers\Api\V1\Admin\LandingPageSectionController;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `php artisan test tests/Feature/Landing/LandingPageSectionApiTest.php`
Expected: PASS, 4 tests.

- [ ] **Step 6: Prove the tests bite**

Mutate, run, restore, run. Report each:
1. Delete the `in_array` refusal block → `test_it_refuses_a_key_that_is_not_on_this_page` must go red.
2. Change `abort_if($page === null, 404)` to `abort_if(false, 404)` → `test_it_404s_when_this_brand_has_no_page_yet` must go red.
3. Drop `->where('key', $row['key'])` → the toggle test must go red.

If a mutation does **not** turn a test red, the test is not testing what it claims — strengthen it and say so.

- [ ] **Step 7: Confirm the two orphaned Phase 1 tests now have a reachable premise**

Run: `php artisan test tests/Feature/Landing/RuledPageRenderTest.php tests/Feature/Landing/RuledPageSectionsTest.php`
Expected: PASS. In your report, state plainly that `test_a_disabled_section_is_not_rendered` and `test_switching_booking_off_takes_its_dead_anchors_with_it` are now producible through the API.

- [ ] **Step 8: Commit**

```bash
git add app/Http/Controllers/Api/V1/Admin/LandingPageSectionController.php routes/api.php tests/Feature/Landing/LandingPageSectionApiTest.php
git commit -m "Let a tenant turn landing-page sections on and off"
```

---

## Task 2: A writer for `is_featured`, and the toggle that uses it

Phase 1 shipped the `is_featured` column and the `featured()` scope. **Nothing in the app can set them** — `reviews/submissions` has three GET routes and no write path. The visible reviews band is gated on a *featured* review, so today it renders for nobody. This task is what switches that section on at all.

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/AdminReviewController.php`
- Modify: `routes/api.php` (inside the existing `feature:reviews` group)
- Modify: `frontend/src/pages/Reviews.tsx`
- Test: `tests/Feature/Landing/FeaturedReviewWriteTest.php`

**Interfaces:**
- Produces: `PUT /api/v1/admin/reviews/submissions/{id}/featured` accepting `{featured: bool}`, returning `{submission: {id, is_featured}}`. Frontend: `api.put(\`/v1/admin/reviews/submissions/${id}/featured\`, { featured })`.

- [ ] **Step 1: Write the failing test**

```php
public function test_it_features_a_submission(): void
{
    $s = $this->makeSubmission(['is_featured' => false]);

    $this->putJson("/api/v1/admin/reviews/submissions/{$s->id}/featured", ['featured' => true])
        ->assertOk()
        ->assertJsonPath('submission.is_featured', true);

    $this->assertDatabaseHas('review_submissions', ['id' => $s->id, 'is_featured' => true]);
}

public function test_it_cannot_feature_another_organizations_submission(): void
{
    $theirs = $this->makeOtherOrgSubmission(['is_featured' => false]);

    $this->putJson("/api/v1/admin/reviews/submissions/{$theirs->id}/featured", ['featured' => true])
        ->assertNotFound();

    $this->assertDatabaseHas('review_submissions', ['id' => $theirs->id, 'is_featured' => false]);
}

public function test_featuring_a_review_makes_the_landing_band_render(): void
{
    // The whole point of the column. Publish a page, confirm the reviews band
    // is ABSENT, feature a review, confirm it APPEARS -- asserted on the real
    // public response bytes, not on the model.
    $page = $this->publishedPageWithRatedSubmissions(count: 5, featured: 0);

    $before = $this->get($this->landingUrl($page->slug));
    $this->assertStringNotContainsString('data-section="reviews"', $before->streamedContent());

    $this->putJson("/api/v1/admin/reviews/submissions/{$this->firstSubmissionId}/featured", ['featured' => true])
        ->assertOk();

    $after = $this->get($this->landingUrl($page->slug));
    $this->assertStringContainsString('data-section="reviews"', $after->streamedContent());
}
```

For `landingUrl()` and the published-page fixture, read `tests/Feature/Landing/RuledPageSectionsTest.php` and reuse its helpers.

- [ ] **Step 2: Run to verify it fails**

Run: `php artisan test tests/Feature/Landing/FeaturedReviewWriteTest.php`
Expected: FAIL — 404, route not defined.

- [ ] **Step 3: Add the controller method**

In `AdminReviewController.php`, next to `showSubmission()`:

```php
/**
 * Curate a submission onto the landing page.
 *
 * `is_featured` shipped with the landing renderer but had no writer anywhere
 * in the app, which meant the visible reviews band -- gated on a FEATURED
 * review, not merely a rated one -- could never render for any tenant. The
 * aggregate rating in the page's JSON-LD is gated on the same switch, so
 * without this the page also published no review markup at all.
 *
 * Deliberately not part of a general submission-update endpoint: a review is
 * a customer's words and nothing in the admin may edit them. Curation is the
 * one property of a submission the tenant owns.
 */
public function setSubmissionFeatured(Request $request, int $id): JsonResponse
{
    $data = $request->validate(['featured' => 'required|boolean']);

    // Tenant-scoped by the model's global scope; a foreign id resolves to
    // null and 404s rather than reporting that it exists.
    $submission = ReviewSubmission::findOrFail($id);

    $submission->update(['is_featured' => $data['featured']]);

    return response()->json([
        'submission' => ['id' => $submission->id, 'is_featured' => $submission->is_featured],
    ]);
}
```

Ensure `use App\Models\ReviewSubmission;` and `use Illuminate\Http\JsonResponse;` are present at the top of the file.

- [ ] **Step 4: Register the route**

In `routes/api.php`, inside the existing `Route::middleware('feature:reviews')->group(...)` block, directly under `Route::get('reviews/submissions/{id}', ...)`:

```php
Route::put('reviews/submissions/{id}/featured', [AdminReviewController::class, 'setSubmissionFeatured']);
```

It goes in the **`feature:reviews`** group, not `feature:landing_pages` — it writes a review, and the screen that owns reviews is gated on `reviews`. An Enterprise org has both, so the landing page is unaffected.

- [ ] **Step 5: Run to verify it passes**

Run: `php artisan test tests/Feature/Landing/FeaturedReviewWriteTest.php`
Expected: PASS, 3 tests.

- [ ] **Step 6: Add the toggle to the reviews UI**

In `frontend/src/pages/Reviews.tsx`, inside `SubmissionsTab`, add the mutation and a per-row control. Read the file first and match its existing row markup.

```tsx
const qc = useQueryClient()

const featureMut = useMutation({
  mutationFn: ({ id, featured }: { id: number; featured: boolean }) =>
    api.put(`/v1/admin/reviews/submissions/${id}/featured`, { featured }).then(r => r.data),
  onSuccess: (_d, v) => {
    qc.invalidateQueries({ queryKey: ['review-submissions'] })
    toast.success(v.featured
      ? t('reviews.featured_on', 'Added to your landing page')
      : t('reviews.featured_off', 'Removed from your landing page'))
  },
  onError: (e: any) => toast.error(
    e.response?.data?.error ?? e.response?.data?.message ?? t('common.error', 'Something went wrong')),
})
```

The control itself — a star toggle, labelled so its effect is obvious to a non-technical user:

```tsx
<button
  type="button"
  aria-pressed={s.is_featured}
  title={t('reviews.feature_hint', 'Show this review on your landing page')}
  onClick={() => featureMut.mutate({ id: s.id, featured: !s.is_featured })}
  disabled={featureMut.isPending}
  className={'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 '
    + (s.is_featured
      ? 'bg-primary-500/[0.12] text-primary-500 border border-primary-500/30'
      : 'bg-dark-bg border border-dark-border text-t-secondary hover:text-white')}
>
  <Star size={13} className={s.is_featured ? 'fill-current' : ''} />
  {s.is_featured
    ? t('reviews.featured', 'On your page')
    : t('reviews.feature', 'Feature')}
</button>
```

Add `Star` to the existing `lucide-react` import. Add `is_featured: boolean` to the submission type in that file.

- [ ] **Step 7: Prove the tests bite**

1. Change `$submission->update(['is_featured' => $data['featured']])` to `$submission->update([])` → `test_it_features_a_submission` and `test_featuring_a_review_makes_the_landing_band_render` must both go red.
2. Change `ReviewSubmission::findOrFail($id)` to `ReviewSubmission::withoutGlobalScopes()->findOrFail($id)` → `test_it_cannot_feature_another_organizations_submission` must go red. **This is the important one** — it is the tenancy boundary.

- [ ] **Step 8: Commit**

```bash
git add app/Http/Controllers/Api/V1/Admin/AdminReviewController.php routes/api.php frontend/src/pages/Reviews.tsx tests/Feature/Landing/FeaturedReviewWriteTest.php
git commit -m "Let a tenant choose which reviews appear on their landing page"
```

---

## Task 3: Let the admin frame the preview, and only the preview

The editor's live pane iframes the tenant's real page. `LandingPageSecurity::policy()` currently sets `frame-ancestors 'none'` on every landing response, so that iframe would be blocked. Published pages must keep `'none'` — that is their clickjacking defence, and a tenant's live marketing page has no reason to be framable by anyone. **Only the signed preview route** becomes framable, and only by our own admin origin.

**Files:**
- Modify: `app/Http/Middleware/LandingPageSecurity.php`
- Modify: `app/Http/Controllers/Landing/LandingPageController.php` (`preview()`)
- Test: `tests/Feature/Landing/LandingPreviewFramingTest.php`

**Interfaces:**
- Produces: preview responses carry `frame-ancestors 'self' <admin origin>`; published responses keep `frame-ancestors 'none'`.

- [ ] **Step 1: Write the failing test**

```php
public function test_a_published_page_still_refuses_to_be_framed(): void
{
    $page = $this->publishedPage();

    $csp = $this->get($this->landingUrl($page->slug))->headers->get('Content-Security-Policy');

    $this->assertStringContainsString("frame-ancestors 'none'", $csp);
}

public function test_the_preview_may_be_framed_by_the_admin_origin_only(): void
{
    $page = $this->draftPage();

    $csp = $this->get($this->signedPreviewUrl($page))->headers->get('Content-Security-Policy');

    $this->assertStringContainsString("frame-ancestors 'self' " . config('app.url'), $csp);
    $this->assertStringNotContainsString("frame-ancestors 'none'", $csp);
    // A wildcard here would let any site frame a draft.
    $this->assertStringNotContainsString('frame-ancestors *', $csp);
}

public function test_the_preview_carries_the_rest_of_the_policy_unchanged(): void
{
    $page = $this->draftPage();

    $csp = $this->get($this->signedPreviewUrl($page))->headers->get('Content-Security-Policy');

    foreach (["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"] as $directive) {
        $this->assertStringContainsString($directive, $csp,
            "Relaxing frame-ancestors must not have disturbed {$directive}.");
    }
}
```

Reuse `signedPreviewUrl()` / `draftPage()` from `tests/Feature/Landing/LandingSecurityHeadersTest.php` — read it first.

- [ ] **Step 2: Run to verify it fails**

Run: `php artisan test tests/Feature/Landing/LandingPreviewFramingTest.php`
Expected: FAIL on `test_the_preview_may_be_framed_by_the_admin_origin_only` — the preview currently says `'none'`.

- [ ] **Step 3: Parameterise the policy**

In `LandingPageSecurity.php`, change `policy()` to take the frame-ancestors value, defaulting to the safe one:

```php
/**
 * @param string $frameAncestors The frame-ancestors value. Defaults to
 *        'none': a tenant's live page has no reason to be framable, and
 *        leaving it open is a clickjacking surface on a page carrying their
 *        booking and contact actions. The editor's preview pane is the one
 *        exception and passes the admin origin explicitly -- see
 *        LandingPageController::preview().
 */
public static function policy(string $nonce, string $frameAncestors = "'none'"): string
{
    // ... existing directives unchanged ...
    "frame-ancestors {$frameAncestors}",
    // ...
}
```

Then let the response opt in. Add near the top of `harden()`:

```php
// A response may ask to be framable by the admin origin -- only the preview
// route does, and it sets this attribute on the request. Anything else gets
// the default 'none'. Read from the REQUEST, not from a response header a
// controller could be tricked into echoing.
$frameAncestors = $request->attributes->get('landing.frame_ancestors', "'none'");
```

and pass it into the `policy()` call in that method.

- [ ] **Step 4: Have `preview()` opt in**

In `app/Http/Controllers/Landing/LandingPageController.php`:

```php
public function preview(Request $request, int $page): Response
{
    $model = LandingPage::withoutGlobalScopes()->find($page);

    abort_if($model === null, 404);

    // The editor's live pane iframes this URL from the admin origin. Only the
    // PREVIEW relaxes frame-ancestors; a published page keeps 'none'. The URL
    // is signed and short-lived, so framability is not an exposure on its own
    // -- and the value names our own origin rather than '*', so a draft still
    // cannot be framed by a third party who somehow obtains the link.
    $request->attributes->set('landing.frame_ancestors', "'self' " . config('app.url'));

    return $this->render($model)
        ->header('Cache-Control', 'no-store')
        ->header('X-Robots-Tag', 'noindex');
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `php artisan test tests/Feature/Landing/LandingPreviewFramingTest.php tests/Feature/Landing/LandingSecurityHeadersTest.php`
Expected: PASS. The existing security-headers suite must stay green — if it goes red you have changed published-page behaviour, which this task must not do.

- [ ] **Step 6: Prove the tests bite**

1. Change the `preview()` attribute value to `'*'` → `test_the_preview_may_be_framed_by_the_admin_origin_only` must go red on the wildcard assertion.
2. Change the `policy()` default from `"'none'"` to `"'self'"` → `test_a_published_page_still_refuses_to_be_framed` must go red. **This is the one that matters** — it is what keeps the relaxation confined to the preview.

- [ ] **Step 7: Commit**

```bash
git add app/Http/Middleware/LandingPageSecurity.php app/Http/Controllers/Landing/LandingPageController.php tests/Feature/Landing/LandingPreviewFramingTest.php
git commit -m "Let the editor frame the preview, and only the preview"
```

---

## Task 4: The wizard's prefill and apply endpoints

Follows the house onboarding contract (Appendix A §7.2): a `GET` returning prefill, a `POST` applying it in one transaction.

**Files:**
- Create: `app/Http/Controllers/Api/V1/Admin/LandingOnboardingController.php`
- Create: `app/Services/Landing/LandingOnboardingService.php`
- Modify: `routes/api.php`
- Test: `tests/Feature/Landing/LandingOnboardingTest.php`

**Interfaces:**
- Produces:
  - `GET /api/v1/admin/landing-pages/onboarding` → `{completed: bool, prefill: {business_name, headline, subtext, phone, email, address, brand_color}, templates: [{key, name, blurb}], sections: [{key, label, source_label, available, count}], suggested_slug: string}`
  - `POST /api/v1/admin/landing-pages/onboarding` accepting `{template_key, slug, copy: {headline, subtext}, theme: {brand_color, font_pairing}, sections: [{key, enabled}]}` → `{page}`
- Consumed by `LandingWizard.tsx` (Task 6/7).

- [ ] **Step 1: Write the failing test**

```php
public function test_prefill_comes_from_the_tenants_own_property(): void
{
    $this->makeProperty(['name' => 'Maison Mimi', 'phone' => '+371 20000000']);

    $res = $this->getJson('/api/v1/admin/landing-pages/onboarding')->assertOk();

    $res->assertJsonPath('prefill.business_name', 'Maison Mimi');
    $res->assertJsonPath('prefill.phone', '+371 20000000');
    $res->assertJsonPath('completed', false);
}

public function test_a_section_with_no_data_is_reported_unavailable_with_its_count(): void
{
    $this->makeProperty();          // no services, no featured reviews

    $res = $this->getJson('/api/v1/admin/landing-pages/onboarding')->assertOk();

    $services = collect($res->json('sections'))->firstWhere('key', 'services');
    $this->assertFalse($services['available']);
    $this->assertSame(0, $services['count']);
}

public function test_a_section_with_data_reports_its_real_count(): void
{
    $this->makeProperty();
    $this->makeServices(12);

    $res = $this->getJson('/api/v1/admin/landing-pages/onboarding')->assertOk();

    $services = collect($res->json('sections'))->firstWhere('key', 'services');
    $this->assertTrue($services['available']);
    $this->assertSame(12, $services['count']);
}

public function test_apply_creates_a_draft_page_with_the_chosen_sections(): void
{
    $this->makeProperty();

    $this->postJson('/api/v1/admin/landing-pages/onboarding', [
        'template_key' => 'ruled_page',
        'slug'         => 'maison-mimi',
        'copy'         => ['headline' => 'Quiet luxury', 'subtext' => 'Considered care'],
        'theme'        => ['brand_color' => '#1f5fa8', 'font_pairing' => 'editorial'],
        'sections'     => [['key' => 'reviews', 'enabled' => false]],
    ])->assertCreated();

    $page = LandingPage::first();
    $this->assertSame('maison-mimi', $page->slug);
    $this->assertNull($page->published_at, 'The wizard creates a DRAFT. Publishing stays a deliberate, separate act.');
    $this->assertFalse($page->sections->firstWhere('key', 'reviews')->enabled);
}

public function test_apply_is_atomic(): void
{
    // A reserved slug must leave NOTHING behind -- not a page, not sections.
    $this->makeProperty();

    $this->postJson('/api/v1/admin/landing-pages/onboarding', [
        'template_key' => 'ruled_page',
        'slug'         => 'admin',                 // reserved
        'copy'         => ['headline' => 'x', 'subtext' => 'y'],
        'theme'        => ['brand_color' => '#1f5fa8', 'font_pairing' => 'editorial'],
        'sections'     => [],
    ])->assertStatus(422);

    $this->assertDatabaseCount('landing_pages', 0);
    $this->assertDatabaseCount('landing_page_sections', 0);
}

public function test_completed_is_true_once_a_page_exists(): void
{
    $this->makeProperty();
    $this->makePage();

    $this->getJson('/api/v1/admin/landing-pages/onboarding')
        ->assertOk()
        ->assertJsonPath('completed', true);
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `php artisan test tests/Feature/Landing/LandingOnboardingTest.php`
Expected: FAIL — route not defined.

- [ ] **Step 3: Write the service**

Create `app/Services/Landing/LandingOnboardingService.php`. Read `app/Landing/PageContent.php` first — it already resolves the same content sources for the renderer, and the availability counts here **must agree with what the page will actually show**, or the wizard offers a section that then renders empty.

```php
<?php

namespace App\Services\Landing;

use App\Landing\PageContent;
use App\Models\LandingPage;
use App\Support\LandingSlug;
use Illuminate\Support\Facades\DB;

/**
 * Builds the wizard's prefill and applies its result.
 *
 * The availability counts come from the SAME resolution the renderer uses
 * (PageContent), not from a second set of queries written here. Two
 * implementations of "does this tenant have any services" is how the wizard
 * ends up offering a section that renders empty -- the exact failure the
 * spec's "an empty section is never offered as a choice" rule exists to
 * prevent.
 */
class LandingOnboardingService
{
    /** Completion is the existence of a page, not a crm_settings marker. */
    public function prefill(): array { /* see steps below */ }

    public function apply(array $data): LandingPage { /* see steps below */ }
}
```

**`completed` is deliberately `LandingPage::exists()`, not a `crm_settings` marker.** Appendix A §7.2 documents that `crm_settings` is unique on `(organization_id, key)` with **no brand column**, so a marker-gated wizard runs once per *organisation*. A landing page is per *brand*. A marker would mean brand B never sees the wizard because brand A finished it.

Implement `prefill()` to return the shape in the Interfaces block, reading the business fields from the tenant's `Property` (see how `PageContent` resolves `contact`), and building `sections` from the same predicates `PageContent::has()` uses. Implement `apply()` to run `validatedSlug()` (reuse `LandingPageController`'s existing helper — extract it to the service or call through) and create the page + its section rows inside **one** `DB::transaction`.

- [ ] **Step 4: Write the controller**

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\Landing\LandingOnboardingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Thin, per the house onboarding contract (Appendix A 7.2): validate, hand to
 * the service, return what the confirmation UI reads.
 */
class LandingOnboardingController extends Controller
{
    public function __construct(private LandingOnboardingService $service) {}

    public function show(): JsonResponse
    {
        return response()->json($this->service->prefill());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'template_key'       => 'required|string|in:ruled_page',
            'slug'               => 'required|string|max:63',
            'copy.headline'      => 'nullable|string|max:120',
            'copy.subtext'       => 'nullable|string|max:200',
            'theme.brand_color'  => 'nullable|string|max:32',
            'theme.font_pairing' => 'nullable|string|in:editorial,modern,classic',
            'sections'           => 'nullable|array',
            'sections.*.key'     => 'required|string|max:64',
            'sections.*.enabled' => 'required|boolean',
        ]);

        return response()->json(['page' => $this->service->apply($data)], 201);
    }
}
```

Note the `copy` and `theme` leaves are typed as scalars — Phase 1's `ScalarLeaves` rule exists because unconstrained JSON columns let a tenant 500 their own live page. Do not weaken these to bare `array`.

- [ ] **Step 5: Register the routes**

Inside the existing `Route::middleware('feature:landing_pages')->group(...)`:

```php
Route::get('onboarding',  [LandingOnboardingController::class, 'show']);
Route::post('onboarding', [LandingOnboardingController::class, 'store']);
```

- [ ] **Step 6: Run to verify it passes**

Run: `php artisan test tests/Feature/Landing/LandingOnboardingTest.php`
Expected: PASS, 6 tests.

- [ ] **Step 7: Prove the tests bite**

1. Remove the `DB::transaction` wrapper in `apply()` → `test_apply_is_atomic` must go red.
2. Hardcode `'available' => true` in the section builder → `test_a_section_with_no_data_is_reported_unavailable_with_its_count` must go red.
3. Set `published_at` in `apply()` → `test_apply_creates_a_draft_page_with_the_chosen_sections` must go red.

- [ ] **Step 8: Commit**

```bash
git add app/Http/Controllers/Api/V1/Admin/LandingOnboardingController.php app/Services/Landing/LandingOnboardingService.php routes/api.php tests/Feature/Landing/LandingOnboardingTest.php
git commit -m "Give the landing wizard its prefill and apply endpoints"
```

---

## Task 5: Page shell, route, nav and gating

The host page that decides between wizard and editor. Appendix A §7.2 is emphatic: **the gate lives in the host page, and every hook must run before any early return** — `Members.tsx` carries a comment about this exact crash ("Rendered more hooks than during the previous render" on hard refresh).

**Files:**
- Create: `frontend/src/pages/LandingPages.tsx`
- Create: `frontend/src/pages/landing/sections.ts`
- Modify: `frontend/src/App.tsx`, `frontend/src/components/Layout.tsx`
- Test: `tests/Feature/Landing/LandingPageEntitlementTest.php` (extend), `frontend/src/pages/landing/sections.test.ts`

**Interfaces:**
- Produces: route `/landing-pages`; `sections.ts` exports `type SectionKey`, `type SectionMeta = {key: SectionKey; label: string; sourceLabel: string; available: boolean; count: number}`, and `SECTION_ORDER: SectionKey[]`.

- [ ] **Step 1: Write `sections.ts` and its test**

```ts
export type SectionKey = 'hero' | 'services' | 'about' | 'team' | 'reviews' | 'booking' | 'contact'

export const SECTION_ORDER: SectionKey[] = ['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact']

export type SectionMeta = {
  key: SectionKey
  label: string
  sourceLabel: string
  available: boolean
  count: number
}

/**
 * The spec's rule, in one place: an empty section is never offered as a
 * choice. Both the wizard's step 4 and the editor's section list ask this,
 * and they must agree -- a section the wizard hid must not reappear as an
 * editable-but-empty row.
 */
export function isOfferable(s: SectionMeta): boolean {
  return s.available && s.count > 0
}
```

```ts
// sections.test.ts
it('never offers a section with no data', () => {
  expect(isOfferable({ key: 'reviews', label: '', sourceLabel: '', available: true, count: 0 })).toBe(false)
  expect(isOfferable({ key: 'reviews', label: '', sourceLabel: '', available: false, count: 4 })).toBe(false)
  expect(isOfferable({ key: 'reviews', label: '', sourceLabel: '', available: true, count: 4 })).toBe(true)
})
```

- [ ] **Step 2: Run it**

Run: `cd frontend && npx vitest run src/pages/landing/sections.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the host page**

```tsx
export function LandingPages() {
  const { t } = useTranslation()
  const [wizardDone, setWizardDone] = useState(false)

  // EVERY hook runs before any early return. Putting the gate above these
  // crashes with "Rendered more hooks than during the previous render" on a
  // hard refresh -- Members.tsx carries a comment about this exact bug.
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['landing-onboarding'],
    queryFn: () => api.get('/v1/admin/landing-pages/onboarding').then(r => r.data),
  })

  if (isLoading) return (
    <div className="flex items-center justify-center py-24 text-t-secondary">
      <Loader2 size={18} className="animate-spin mr-2" />
      {t('landing_pages.loading', 'Preparing your page…')}
    </div>
  )

  if (error) return <QueryError onRetry={() => refetch()} message={t('landing_pages.load_error', 'Could not load your landing page.')} />

  if (data && !data.completed && !wizardDone) {
    return <LandingWizard prefill={data} onDone={() => setWizardDone(true)} />
  }

  return <LandingEditor />
}
```

Keep the local `wizardDone` latch — Appendix A §7.2: `invalidateQueries` alone leaves the wizard on screen through the refetch.

Wrap the editor in `<BrandRequired feature="landing_pages">`: a landing page is per brand (Phase 1 put `BelongsToBrand` on the model).

- [ ] **Step 4: Register route and nav**

`App.tsx`:
```tsx
const LandingPages = lazy(() => import('./pages/LandingPages').then(m => ({ default: m.LandingPages })))
```
```tsx
<Route path="/landing-pages" element={<LazyRoute gate="admin" product="chat" feature="landing_pages"><LandingPages /></LazyRoute>} />
```

`Layout.tsx`, in the nav array:
```tsx
{ path: '/landing-pages', labelKey: 'nav.items.landing_pages', defaultLabel: 'Landing Page', icon: Globe, gate: 'admin', product: 'chat', feature: 'landing_pages' },
```

- [ ] **Step 5: Prove the gate by BACKEND test, not by clicking**

`useSubscription().hasFeature()` returns `true` on localhost before reading anything, so clicking proves nothing. Extend `tests/Feature/Landing/LandingPageEntitlementTest.php`:

```php
public function test_a_non_enterprise_org_cannot_reach_the_wizard_endpoints(): void
{
    $this->actingAsGrowthAdmin();

    $this->getJson('/api/v1/admin/landing-pages/onboarding')->assertStatus(402)
        ->assertJsonPath('code', 'feature_locked');
    $this->postJson('/api/v1/admin/landing-pages/onboarding', [])->assertStatus(402);
    $this->putJson('/api/v1/admin/landing-pages/sections', ['sections' => []])->assertStatus(402);
}
```

- [ ] **Step 6: Run**

Run: `php artisan test tests/Feature/Landing/LandingPageEntitlementTest.php`
Expected: PASS. Then `cd frontend && npx tsc -b` — expected: no errors.

- [ ] **Step 7: Prove it bites**

Remove `feature:landing_pages` from the onboarding routes → the new entitlement test must go red.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/LandingPages.tsx frontend/src/pages/landing/sections.ts frontend/src/pages/landing/sections.test.ts frontend/src/App.tsx frontend/src/components/Layout.tsx tests/Feature/Landing/LandingPageEntitlementTest.php
git commit -m "Add the Landing Page screen, its route and its plan gate"
```

---

## Task 6: Wizard steps 1–2 — pick a look, check your details

**Files:** Create `frontend/src/pages/landing/LandingWizard.tsx`

**Interfaces:**
- Consumes: the `prefill` payload from Task 4; `SECTION_ORDER`, `SectionMeta`, `isOfferable` from Task 5.
- Produces: `<LandingWizard prefill={...} onDone={() => void} />`.

- [ ] **Step 1: Build the shell**

Copy the anatomy from `ChatbotWizard.tsx:141` — it is the on-token reference. Outer `max-w-3xl mx-auto pb-16`, numbered-node stepper, footer `flex items-center justify-between mt-6` with Back left and primary right. State is plain `useState` + `{step === N && …}` + a module-level `const STEPS = [...]`. No context, no router-driven steps.

Form state uses the loose resolution documented in §7.1 — `form.headline ?? prefill.headline ?? ''` — which distinguishes "untouched" from "cleared" with no hydration effect.

- [ ] **Step 2: Step 1 — Pick a look**

Three selectable cards. Use the **exact** selectable-card shape from §7.4 (this is what it was documented for):

```tsx
<button
  type="button"
  aria-pressed={active}
  onClick={() => up('template_key', tpl.key)}
  className={'text-left rounded-xl border p-4 transition-all '
    + (active
      ? 'border-primary-500 bg-primary-500/[0.08] ring-1 ring-primary-500/30'
      : 'border-dark-border bg-dark-surface hover:border-primary-500/40 hover:bg-primary-500/[0.04]')}
>
```

Each card shows **their** business name, **their** brand colour and up to three of **their** service names — they are choosing between three versions of their own page, not three abstractions. The swatch is the one place inline hex is correct (it IS customer data being previewed).

Phase 2 ships one template (`ruled_page`); Phase 3 adds two more. Render the list the endpoint returns rather than hardcoding three, so Phase 3 is data-only. If only one is returned, still render it as a selected card — do not skip the step, because the step is also where they see their own content for the first time.

- [ ] **Step 3: Step 2 — Check your details**

Prefilled from `Property`. Read-only summary rows with a single "Edit in Settings" link, plus editable `headline` and `subtext` using the verbatim `input` and `label` classes. Most tenants press Continue.

If a prefill field is empty, show the field with a plain-English hint rather than hiding it — a missing business name is something they should fix here, not discover on the published page.

- [ ] **Step 4: Draft persistence**

Per §7.6, using the `SetupWizard.tsx:118` pattern:
```ts
const DRAFT_KEY = 'landing-wizard-draft-v1'
```
An effect writes `{step, form}`; `loadDraft()` **deep-merges over the empty form and clamps the step** — a raw `JSON.parse` into state breaks the wizard the first time a field is added. `removeItem` on successful apply. Every localStorage access wrapped in try/catch.

- [ ] **Step 5: Verify**

Run `cd frontend && npx tsc -b` — expected: no errors. Then run the app and walk steps 1–2, confirming your own business name appears on the template cards.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/landing/LandingWizard.tsx
git commit -m "Landing wizard: pick a look, check your details"
```

---

## Task 7: Wizard steps 3–4 — make it yours, choose what to show, apply

**Files:** Modify `frontend/src/pages/landing/LandingWizard.tsx`

- [ ] **Step 1: Step 3 — Make it yours**

Brand colour prefilled from the brand, shown as a swatch plus a colour input. **Three curated font pairings shown as specimens — never a font dropdown** (spec §9). Each specimen renders a heading and a line of body text in the actual pairing, as a selectable card.

No logo upload — Global Constraints. If the brand already has a logo, show it as a read-only preview with a link to Settings.

- [ ] **Step 2: Step 4 — Choose what to show**

One toggle per section, labelled in plain English **with its source**: `t('landing_pages.section_source', {count, defaultValue: '{{count}} from your Services'})`.

**An unavailable section is not offered as a choice.** Render it disabled, off, and say why in one short line — "No featured reviews yet. Choose some on the Reviews screen." Use `isOfferable()` from Task 5 so the wizard and editor cannot disagree.

- [ ] **Step 3: Apply**

```tsx
const applyMut = useMutation({
  mutationFn: (payload: ApplyPayload) =>
    api.post('/v1/admin/landing-pages/onboarding', payload).then(r => r.data),
  onSuccess: () => {
    clearDraft()
    qc.invalidateQueries({ queryKey: ['landing-onboarding'] })
    qc.invalidateQueries({ queryKey: ['landing-page'] })
    toast.success(t('landing_pages.created', 'Your page is ready to edit'))
    onDone()
  },
  onError: (e: any) => toast.error(
    e.response?.data?.error ?? e.response?.data?.message ?? t('common.error', 'Something went wrong')),
})
```

The wizard creates a **draft**. It must not publish — publishing stays a deliberate act in the editor.

- [ ] **Step 4: Verify**

`npx tsc -b`, then walk the whole wizard end to end against a local Enterprise org and confirm a draft row appears with the sections you chose.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/landing/LandingWizard.tsx
git commit -m "Landing wizard: make it yours, choose what to show, create the draft"
```

---

## Task 8: Editor — section list, fields, and save

**Files:** Create `frontend/src/pages/landing/LandingEditor.tsx`

**Interfaces:**
- Consumes: `GET /v1/admin/landing-pages` (existing `show`), `PUT /v1/admin/landing-pages` (existing `update`), `PUT /v1/admin/landing-pages/sections` (Task 1).

- [ ] **Step 1: Two-pane layout**

Per §7.5: `<div className="grid grid-cols-1 xl:grid-cols-12 gap-5">`, form in `xl:col-span-7 space-y-5 min-w-0`, preview in `xl:col-span-5` wrapping `<div className="xl:sticky xl:top-4">`.

**No canvas, no drag-and-drop for content.** The spec is explicit that a canvas is what inexperienced users struggle with most.

- [ ] **Step 2: Save UX — verbatim from §7.6**

```tsx
const [form, setForm] = useState<any>(null)
const f = form ?? page ?? {}
const update = (k: string, v: any) => setForm(p => ({ ...(p ?? page ?? {}), [k]: v }))
const dirty = form !== null
// onSuccess: () => setForm(null)   -- snaps back to server truth
```

Status bar, exact classes:
```tsx
<div className="sticky bottom-0 -mx-2 px-2 py-3 bg-dark-bg/95 backdrop-blur border-t border-dark-border flex items-center justify-between">
  <span className="text-xs text-t-secondary">
    {dirty ? t('landing_pages.unsaved', 'Unsaved changes') : t('landing_pages.saved', 'All changes saved')}
  </span>
  <button disabled={!dirty || saveMut.isPending} className={btnPrimary}>
    <Save size={14} /> {saveMut.isPending ? t('common.saving', 'Saving…') : t('landing_pages.save', 'Save changes')}
  </button>
</div>
```

**No autosave and no debounce** — Global Constraints.

- [ ] **Step 3: Section list**

One row per section, in `SECTION_ORDER`. Each row: enable toggle, plain-English label with its source, and the inline fields for that section. Reordering uses simple up/down buttons — not drag-and-drop, for the same reason as the canvas. Section changes call the Task 1 endpoint; copy/theme changes call the existing `update`.

A section that `isOfferable()` says is empty renders disabled with its one-line reason, matching the wizard exactly.

- [ ] **Step 4: Verify**

`npx tsc -b`. Then: edit a field, confirm the bar says "Unsaved changes"; save, confirm it says "All changes saved" and the field survives a reload.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/landing/LandingEditor.tsx
git commit -m "Landing editor: section list, inline fields, explicit save"
```

---

## Task 9: Editor — the live preview pane

**Files:** Create `frontend/src/pages/landing/LandingPreview.tsx`; modify `LandingEditor.tsx`

- [ ] **Step 1: Build the pane**

Follow `SurveyDesignPanel.tsx:246` — a real-page `<iframe>` in a device frame, `lg:sticky lg:top-6 self-start`, remounted on `key={previewNonce}`.

Fetch the signed URL from the existing `POST /v1/admin/landing-pages/preview-url` and iframe it. Task 3 is what makes this render instead of being blocked.

Desktop/mobile toggle: mobile is the phone frame (`rounded-[28px] border-4 border-[#222]`, `aspectRatio: '9/16'`); desktop is a plain bordered frame at full pane width.

- [ ] **Step 2: Be honest about staleness**

The preview shows the **saved draft**, not unsaved edits — the iframe renders server-side from the stored row. Say so, in the same spirit as the chat widget's caption:

```tsx
<p className="text-[11px] text-t-secondary mt-2">
  {t('landing_pages.preview_caption', 'Shows your saved draft. Save to see the latest changes.')}
</p>
```

Do **not** claim it reflects unsaved changes. Bump `previewNonce` in the save mutation's `onSuccess` so it refreshes the moment there is something new to show.

- [ ] **Step 3: Verify by execution**

Open the editor, confirm the iframe actually renders the page (not a blocked-frame error). Check the browser console for a CSP violation — if you see one, Task 3 did not do its job; fix it there, not by loosening the policy here.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/landing/LandingPreview.tsx frontend/src/pages/landing/LandingEditor.tsx
git commit -m "Landing editor: live preview of the real page"
```

---

## Task 10: Web address, publish and unpublish

- [ ] **Step 1: The address**

**The word "slug" never appears.** Label it "Web address", show the whole URL, and give it a Copy button:

```tsx
<label className={label}>{t('landing_pages.web_address', 'Web address')}</label>
<div className="flex items-center gap-2">
  <code className="flex-1 truncate text-xs text-white bg-dark-bg border border-dark-border rounded-lg px-3 py-2">{fullUrl}</code>
  <button type="button" className={btnSec} onClick={copy}><Copy size={13} /> {t('common.copy', 'Copy')}</button>
</div>
```

Editing it warns, in plain English, that the old address will keep working for 90 days — Phase 1's redirect TTL. Do not describe it as a redirect.

- [ ] **Step 2: Publish / unpublish**

Publish is a deliberate, primary action with a confirmation naming the public URL. Unpublish uses `POST /v1/admin/landing-pages/unpublish` and is styled as a quiet secondary action, not a destructive one — it is reversible.

Show live/draft state unambiguously: a tenant must never be unsure whether the public can see their page.

- [ ] **Step 3: Verify**

Publish from the UI, load the public URL in a private window, confirm 200. Unpublish, reload, confirm 404.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/landing/LandingEditor.tsx
git commit -m "Landing editor: web address, publish and unpublish"
```

---

## Task 11: Translations, empty states and final verification

- [ ] **Step 1: Translation sweep**

Every user-visible string in `LandingPages.tsx`, `LandingWizard.tsx`, `LandingEditor.tsx`, `LandingPreview.tsx` and the Reviews toggle uses the inline-default form. Add `nav.items.landing_pages` to the nav labels.

Grep your own files for bare strings in JSX text positions and in `toast.*(...)` calls. Report the count you found and fixed.

- [ ] **Step 2: Empty and error states**

- No page yet, non-Enterprise: the nav entry is hidden by the gate; a direct URL visit shows the standard upgrade path, not a broken screen.
- Query error: `QueryError` with `onRetry={() => refetch()}`.
- Loading: the centred inline line from §7.7 — not a skeleton.

- [ ] **Step 3: Full verification**

```bash
php artisan view:clear
php artisan test tests/Feature/Landing/ tests/Unit/Landing/ tests/Unit/Support/
php artisan test tests/Feature/RouteControllersExistTest.php
cd frontend && npx tsc -b && npx vitest run && npm run build
```
Expected: all green; the landing baseline **at or above 415 passed**, never below. `npm run build` must exit 0 — its postbuild asserts the admin shell and the analyser report stay out of the docroot.

- [ ] **Step 4: Walk it as a customer would**

Create an Enterprise org with a Property, some Services and 5 rated reviews. Then, without touching an API client: run the wizard, feature a review, see the reviews band appear, edit copy, publish, load the public URL, rename the address, confirm the old one still resolves.

Report anything that felt confusing to a non-technical user — that is a finding, not a nicety.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Landing builder phase 2: translations, empty states, verification"
```

---

## Self-Review

**Spec coverage:** §9 wizard four steps → Tasks 6, 7. §9 editor two panes → Tasks 8, 9. §9 "slug never appears" → Task 10. §9 empty section never offered → Tasks 5, 7, 8 (one shared predicate). §10 gating → Task 5, proven by backend test. §11 `is_featured` toggle → Task 2. §11 section endpoint → Task 1. §11 "no media upload" → Global Constraints.

**Deviations from the spec, deliberate and recorded:**
1. **No autosave.** Spec §9 says "autosave to draft"; Appendix A §7.6 says no autosave or debounce exists anywhere in the admin and introducing one is a new pattern. Delivered instead as explicit save + dirty indicator + localStorage draft persistence for the wizard. Cost if wrong: a tenant who closes the editor without saving loses that edit — mitigated by the always-visible "Unsaved changes" bar.
2. **`completed` is page existence, not a `crm_settings` marker.** A marker is per organisation and a page is per brand, so a marker would hide the wizard from every brand after the first.
3. **Preview shows the saved draft, not unsaved edits.** It renders server-side. Task 9 says so in the UI rather than implying live fidelity.

**Placeholder scan:** no TBDs. Tasks 6–10 give exact class strings, the endpoint shapes and the state pattern; where they say "follow X" they name the file and line to copy from, per the conventions brief.

**Type consistency:** `SectionKey`, `SectionMeta`, `isOfferable`, `SECTION_ORDER` defined in Task 5 and used unchanged in 7 and 8. Endpoint paths match between Tasks 1/2/4 (backend) and 5–10 (frontend).

**Known risk not solved here:** Task 9's iframe depends on Task 3. If Task 3 is skipped or reverted, the preview pane silently shows a blocked frame — Task 9 Step 3 checks for exactly that.

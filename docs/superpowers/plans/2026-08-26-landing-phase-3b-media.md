# Landing Phase 3b — Media Pipeline Repair and Image Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The media pipeline stops leaking files, accepting anything, and writing local uploads to the production bucket — and tenants can put a hero photograph and an about plate on their landing page.

**Architecture:** No new dependency anywhere. The browser downscales via Canvas before upload; the server backstops with core-PHP `getimagesize()`. Images are scalar URL leaves in the existing `content` JSON (`content.hero.image_url`, `content.about.image_url`) — `ScalarLeaves(depth:2)` already permits exactly that shape. One dedicated endpoint owns the field family; the text `update()` path refuses it, so two writers cannot disagree. The two unbuilt Appendix B plates (hero, about) get built, with byte-parity for imageless pages.

**Tech Stack:** Laravel 13 (pinned PHP 8.4.20 locally), React 18 + TS, vitest (node-env — no component rendering), Canvas API (browser), `getimagesize()` (core PHP).

**Spec:** `docs/superpowers/specs/2026-08-26-landing-phase-3b-media-design.md`
**Template reference:** `docs/superpowers/specs/2026-08-21-landing-page-builder-appendix-b-templates.md` §4.5 items 2 (hero) and 4 (about)

## Global Constraints

- **The live renderer must not move for imageless pages.** Golden byte captures for BOTH blades (hero, about), committed and passing BEFORE the plate wiring lands, in a separate commit — the reviewer verifies commit order (established discipline; a capture taken after proves nothing).
- **A public page must never 500 on stored data.** Hostile `image_url` values written via `DB::table()->update()` (javascript: scheme, quotes, arrays, objects, 200k strings) must render 200 with no plate and nothing escaping the `src` attribute context, on page AND preview.
- **One writer per field family** (spec D4): only the image endpoints write `content.*.image_url`; `update()` refuses it with a friendly message. No default Laravel validation text and no raw field path (like `content.hero.image_url`) may reach a tenant.
- Brand/page resolution ONLY through the established resolver (`LandingPageController::current()` / `LandingPageGuard`) — never a bare `first()` (the six-times phase-2 defect class).
- Frontend: surface token `bg-dark-surface`; shared `api` client (it auto-deletes Content-Type for FormData — `api.ts:28-37`); no optimistic updates; `t('key', 'Fallback')` with every new key in ALL FIVE locales (real translations); the editor's no-canvas-no-drag-drop rule — a plain file input.
- **Every fix proven by mutation** — named test goes red, restore, report. A test that stays green under its mutation gets strengthened or deleted, and the report says which.
- Environment (all hard-won): pinned `/c/wamp64/bin/php/php8.4.20/php.exe`; NEVER bare `php artisan test` — scope `tests/Feature/Landing/ tests/Unit/Landing/ tests/Unit/Support/`; reporter can crash in `Caster.php` on a failure — isolate that test; no bash heredocs with backslashes; Edit over `python -c`; `php artisan view:clear` after every Blade touch/restore; `Organization::create()` bootstraps a default brand — never hand-insert a second `is_default` brand; vitest is node-env.
- Baselines at dispatch time are restated by the coordinator (the industry-resync fix may land first); at spec time: backend landing scope 543/1936, frontend vitest 410 (+3 pre-existing `plannerMeta` failures).
- **Do not touch `frontend/dist` / `public/spa`** — rebuilds happen at deploy prep only.

---

## File Structure

- Modify: `app/Services/MediaService.php` — `delete()` disk inference; remove dead `url()`.
- Modify: `.env` (untracked — edit, report), `.env.example` (document `MEDIA_DISK` + `DO_SPACES_*`).
- Modify: `app/Http/Controllers/Api/V1/Admin/ServiceController.php` (both call sites), `app/Http/Controllers/Api/V1/Admin/BookingRoomController.php` (`applyPhotos`) — `gallery_files` rules.
- Create: `app/Rules/MaxImageDimensions.php` — core-PHP dimension backstop.
- Modify: `app/Http/Controllers/Api/V1/Admin/LandingPageController.php` — `uploadImage()`, `removeImage()`, D4 refusal in `update()`; `routes/api.php` — two routes in the `feature:landing_pages` group.
- Modify: `app/Landing/PageContent.php` — `imageUrl(string $section): ?string` safety helper.
- Modify: `resources/views/landing/ruled_page/sections/{hero,about}.blade.php`, `public/landing/ruled_page.css` — the two plates.
- Modify: `frontend/src/pages/landing/editorSections.ts` (field type), `frontend/src/pages/landing/LandingEditor.tsx` (image field branch); Create: `frontend/src/pages/landing/imageDownscale.ts` (+ test); five locale files.
- Tests: `tests/Unit/Support/MediaServiceDeleteTest.php` (new), `tests/Unit/Support/MaxImageDimensionsTest.php` (new), `tests/Feature/Landing/LandingImageUploadTest.php` (new), extend `RuledPageRenderTest` (goldens + hostile), gallery-rule tests in the two controllers' existing suites.

---

## Task 1: `delete()` infers its disk from the value; dead `url()` removed; env documented

**Files:**
- Modify: `app/Services/MediaService.php:109-135`
- Modify: `.env:42` (`MEDIA_DISK=do` → `MEDIA_DISK=public`; untracked — verify with `git ls-files .env`, do not commit it), `.env.example` (add documented keys)
- Test: `tests/Unit/Support/MediaServiceDeleteTest.php` (new)

**Interfaces:**
- Produces: `MediaService::delete(?string $url): void` with value-shape disk inference. Consumed by Task 4's replace/remove.

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Unit\Support;

use App\Services\MediaService;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MediaServiceDeleteTest extends TestCase
{
    public function test_a_storage_relative_value_deletes_on_the_public_disk_even_when_the_current_disk_is_cloud(): void
    {
        Config::set('filesystems.media_disk', 'do');
        Storage::fake('public');
        Storage::disk('public')->put('services/a.jpg', 'x');

        MediaService::delete('/storage/services/a.jpg');

        Storage::disk('public')->assertMissing('services/a.jpg');
    }

    public function test_a_cloud_url_deletes_on_the_cloud_disk_by_stripping_its_base(): void
    {
        Config::set('filesystems.media_disk', 'do');
        Storage::fake('do');
        Config::set('filesystems.disks.do.url', 'https://cdn.example.test');
        Storage::disk('do')->put('landing/b.jpg', 'x');

        MediaService::delete('https://cdn.example.test/landing/b.jpg');

        Storage::disk('do')->assertMissing('landing/b.jpg');
    }

    public function test_an_unresolvable_value_no_ops_loudly_not_silently(): void
    {
        Log::spy();

        MediaService::delete('https://unrelated.example/x.jpg');
        MediaService::delete(null);
        MediaService::delete('');

        Log::shouldHaveReceived('warning')->once(); // only the unrelated URL warns; null/empty are ordinary absent values
    }
}
```

- [ ] **Step 2: Run to verify it fails** — `php artisan test tests/Unit/Support/MediaServiceDeleteTest.php` → the first two FAIL against today's current-disk behaviour.

- [ ] **Step 3: Implement.** Replace `delete()`'s body: the stored value's shape is the only record of where it was written, so branch on it —

```php
public static function delete(?string $url): void
{
    if (!is_string($url) || trim($url) === '') {
        return;
    }

    // The value's shape is the only record of which disk wrote it: upload()
    // returns '/storage/...' on the public disk and an absolute CDN URL on a
    // cloud disk. Resolving against the CURRENTLY configured disk (what this
    // method did before) silently no-ops for every file written before a
    // disk change - which is how every replace-image flow leaked its old file.
    if (str_starts_with($url, '/storage/')) {
        Storage::disk('public')->delete(substr($url, strlen('/storage/')));
        return;
    }

    $cloudBase = rtrim((string) config('filesystems.disks.do.url'), '/');
    if ($cloudBase !== '' && str_starts_with($url, $cloudBase . '/')) {
        Storage::disk('do')->delete(substr($url, strlen($cloudBase) + 1));
        return;
    }

    // Not ours to delete - but say so. A silent no-op here is the old bug
    // wearing a different hat.
    Log::warning('media.delete.unresolvable', ['url' => $url]);
}
```

Delete the `url()` method entirely (verified: zero call sites). Add to `.env.example`, mirroring its existing comment style:

```
# Which filesystem disk MediaService writes uploads to. 'public' stores under
# storage/app/public (local dev). Set 'do' ONLY in production - pointing local
# dev at the production bucket means every test upload lands in front of
# customers.
MEDIA_DISK=public
# DO_SPACES_KEY=
# DO_SPACES_SECRET=
# DO_SPACES_BUCKET=
# DO_SPACES_REGION=
```

Edit local `.env:42` to `MEDIA_DISK=public`; report it (untracked). `.env.production` stays `do` — verify with `git ls-files` whether it is tracked before considering any edit; it needs none.

- [ ] **Step 4: Run to verify pass. Step 5: Mutations** — (1) swap the two branches' disks → both shape tests red; (2) drop the `Log::warning` → the loud-no-op test red. **Step 6: Full landing scope green; commit** — `MediaService::delete resolves the disk from the value it deletes`.

---

## Task 2: `gallery_files` validated everywhere it is accepted

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/ServiceController.php` (`store` ~:75, `update` ~:130), `app/Http/Controllers/Api/V1/Admin/BookingRoomController.php` (`applyPhotos` ~:130)
- Test: extend those controllers' existing feature suites (locate them first; create `tests/Feature/GalleryUploadValidationTest.php` if none covers uploads)

**Interfaces:** none new.

- [ ] **Step 1: Failing tests** — for each endpoint: a non-image file (a `.txt` renamed `.jpg` fails `image`; also send a genuine text file) in `gallery_files[]` → 422 with a friendly message; 25 files → 422 (`max:24`); a legitimate small JPEG array still accepted.

- [ ] **Step 2: Run → fail (today anything is accepted). Step 3: Implement** in all three call sites, added to the existing `$request->validate()` call of each:

```php
'gallery_files'   => 'nullable|array|max:24',
'gallery_files.*' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
```

with messages:

```php
'gallery_files.max'     => 'Please upload up to 24 photos at a time.',
'gallery_files.*.image' => 'One of the files is not a photo we can use. Please upload JPEG, PNG or WebP images.',
'gallery_files.*.mimes' => 'One of the files is not a photo we can use. Please upload JPEG, PNG or WebP images.',
'gallery_files.*.max'   => 'One of the photos is larger than 5 MB. Please use a smaller file.',
```

- [ ] **Step 4: Pass. Step 5: Mutation** — drop the `gallery_files.*` rule in ONE controller → that controller's test red, the other's green (proves per-site coverage, not incidental). **Step 6: Commit** — `Validate gallery uploads everywhere they are accepted`.

---

## Task 3: `MaxImageDimensions` — the core-PHP backstop

**Files:**
- Create: `app/Rules/MaxImageDimensions.php`
- Test: `tests/Unit/Support/MaxImageDimensionsTest.php` (new). Fixtures: generate in-test via GD when `function_exists('imagecreatetruecolor')`, else use two pre-committed tiny fixtures under `tests/fixtures/images/` (one 10×10, one deliberately reported large — a 1×1 upscaled is impossible; commit a real 4200×10 stripe PNG, a few hundred bytes).

**Interfaces:**
- Produces: `new MaxImageDimensions(int $maxEdge)` invokable rule. Consumed by Task 4.

- [ ] **Step 1: Failing tests** — a 4200px-wide image fails with the tenant-friendly message; a 10×10 passes; a non-image file fails with the unreadable-image message (never a PHP warning — `getimagesize` is called with `@`-free error control: use `is_file` + suppress via return-value check, `getimagesize()` returns `false` on unreadable input).

- [ ] **Step 2: Run → fail. Step 3: Implement**

```php
<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Dimension ceiling without an image library. The pipeline has no
 * intervention/spatie/imagick and GD is unreliable in production, but
 * getimagesize() is core PHP: it reads only the header, never decodes the
 * pixels, so this costs microseconds and works everywhere. The browser is
 * expected to downscale before upload; this rule is the backstop for the
 * client that did not.
 */
class MaxImageDimensions implements ValidationRule
{
    public function __construct(private readonly int $maxEdge) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $path = is_object($value) && method_exists($value, 'getRealPath')
            ? $value->getRealPath()
            : null;

        $size = ($path !== null && is_file($path)) ? getimagesize($path) : false;

        if ($size === false) {
            $fail('We could not read that image. Please upload a JPEG, PNG or WebP photo.');
            return;
        }

        if (max($size[0], $size[1]) > $this->maxEdge) {
            $fail("That image is very large — please use one up to {$this->maxEdge} pixels on its longest side.");
        }
    }
}
```

- [ ] **Step 4: Pass. Step 5: Mutation** — change `max(...)` to `min(...)` → the stripe-fixture test red (a 4200×10 stripe passes under min — this is exactly why the fixture is a stripe, not a square). **Step 6: Commit** — `Add a dimension backstop that needs no image library`.

---

## Task 4: The landing image endpoints, and the single-writer rule

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/LandingPageController.php` (add `uploadImage`, `removeImage`; D4 refusal in `update()`), `routes/api.php` (two routes inside the existing `feature:landing_pages` group)
- Test: `tests/Feature/Landing/LandingImageUploadTest.php` (new)

**Interfaces:**
- Consumes: `MaxImageDimensions` (Task 3), repaired `MediaService::delete()` (Task 1), the existing `current()` resolver.
- Produces: `POST /api/v1/admin/landing-pages/image` (multipart: `slot` in `hero,about`, `image` file) → `{slot, image_url}`; `DELETE /api/v1/admin/landing-pages/image` (json: `slot`) → `{slot, image_url: null}`. Task 6 calls both.

- [ ] **Step 1: Failing tests** (Storage::fake('public'), `Config::set('filesystems.media_disk','public')`; fixture images per Task 3's approach):

```php
public function test_uploading_a_hero_image_stores_the_url_on_the_page(): void
public function test_replacing_an_image_deletes_the_previous_file(): void          // assert old path missing on the fake disk
public function test_removing_an_image_clears_the_leaf_and_deletes_the_file(): void
public function test_a_slot_outside_the_enum_is_refused_kindly(): void             // 422, message names no field path
public function test_oversized_dimensions_are_refused_by_the_backstop(): void      // the 4200px stripe → 422
public function test_update_refuses_to_write_image_url_directly(): void            // D4: content.hero.image_url in PUT → 422 friendly
public function test_the_wizard_apply_path_also_refuses_image_url(): void          // onboarding store() with content-shaped payload — verify whether apply's copy fields could carry it; if structurally impossible, assert THAT (the payload shape has no such key) and say so
public function test_another_orgs_page_is_never_touched(): void                    // tenancy via the resolver
public function test_a_non_enterprise_org_is_refused(): void                       // 402 through the gate
```

- [ ] **Step 2: Run → fail. Step 3: Implement.** `uploadImage()`: validate (`slot` `required|in:hero,about`, `image` `required|image|mimes:jpeg,png,jpg,webp|max:5120` + `new MaxImageDimensions(4096)`, custom messages); resolve the page via `current()` (404 when none); capture `$old = $page->content[$slot]['image_url'] ?? null`; `MediaService::upload($file, 'landing')`; write the leaf via array-merge on `content` and `save()`; on success `MediaService::delete($old)` when it was a string. `removeImage()`: resolve, capture, clear the leaf (unset the key, drop the section array if it became empty only if that is how `content` normally behaves — read how update() writes content first and match it), save, delete the file. `update()` gains, before its content merge:

```php
foreach (($data['content'] ?? []) as $sectionKey => $fields) {
    if (is_array($fields) && array_key_exists('image_url', $fields)) {
        throw ValidationException::withMessages([
            'content' => 'Photos are changed with the photo controls, not by editing text.',
        ]);
    }
}
```

Routes, inside the existing gated group: `Route::post('image', [...]); Route::delete('image', [...]);`.

- [ ] **Step 4: Pass. Step 5: Mutations** — (1) drop the `$old` delete → replace test red; (2) drop the D4 refusal → its test red; (3) point the resolver at a bare `LandingPage::first()` → the cross-org test red. **Step 6: Full landing scope; commit** — `Landing pages get their photo endpoints, with one writer per field`.

---

## Task 5: The two plates, byte-parity first

**Files:**
- Modify: `app/Landing/PageContent.php` (add `imageUrl()`), `resources/views/landing/ruled_page/sections/hero.blade.php`, `about.blade.php`, `public/landing/ruled_page.css`
- Test: extend `tests/Feature/Landing/RuledPageRenderTest.php`

**Interfaces:**
- Produces: `PageContent::imageUrl(string $section): ?string` — returns the stored leaf only when it is a string, ≤2048 chars, and matches `^(https?://|/storage/)`; else null. Blades call ONLY this, never the raw leaf.

- [ ] **Step 1 — FIRST COMMIT, before any wiring: golden captures.** Two tests capturing today's exact bytes (nonce-normalised, `view:clear` first) for (a) a published page with hero copy and no `content.hero.image_url`, (b) the same for about with body copy. Use `var_export()` of the real response, the established technique. Run → green. **Commit alone** — `Golden captures for the imageless hero and about renders`.

- [ ] **Step 2: Failing tests for the plates** — with `image_url` set (via the Task 4 endpoint in the test, not raw DB — exercising the real writer): hero renders `<img class="rp-hero__plate-img"` with the URL in `src`; about renders the 3:4 plate and its text in the moved columns; the golden tests STILL PASS (imageless path untouched). Hostile battery via `DB::table()`: `javascript:alert(1)`, `"><script>`, an array, an object, a 200k string, `//evil.example/x.jpg` (protocol-relative — must be treated as absent: not in the allowed prefixes) → page and preview 200, no `<img` for that section, no hostile bytes in an attribute context.

- [ ] **Step 3: Implement.** `imageUrl()` per the interface above. Hero: plate markup per Appendix B §4.5 item 2 — read that section and `about.blade.php`'s existing docblock conventions before writing; the plate is desktop-side, full-bleed cover on mobile (the house mobile-parity rule: the key visual is never `display:none`d), monogram/no-image path = today's markup byte-for-byte. About: the 3:4 plate in columns 1-4 hung off the grid (`margin-inline-start:-40px; margin-block-start:-40px`, 1px `--line` border, mono caption), text moving to columns 6-11 when the plate renders; today's text-only path byte-for-byte otherwise. CSS additions appended in `ruled_page.css` under a clearly-commented block; no existing selector edited (the phase-1 selector-loss rule: diff every selector before/after).

- [ ] **Step 4: Pass (`view:clear` between renders). Step 5: Mutations** — (1) `imageUrl()` returns the raw leaf unchecked → the javascript:-scheme test red; (2) hero plate rendered unconditionally → both goldens red; (3) drop the about column shift → the about-plate test red. **Step 6: Full landing scope; commit** — `Build the hero and about plates Appendix B specifies`.

---

## Task 6: The editor's photo controls

**Files:**
- Modify: `frontend/src/pages/landing/editorSections.ts` (field descriptors), `frontend/src/pages/landing/LandingEditor.tsx` (image field branch); Create: `frontend/src/pages/landing/imageDownscale.ts` + `imageDownscale.test.ts`; five locale files
- Test: vitest for the downscale decision + descriptor mapping

**Interfaces:**
- Consumes: Task 4's endpoints.

- [ ] **Step 1: The pure part first.** `imageDownscale.ts`:

```ts
export const MAX_EDGE = 2560
export const JPEG_QUALITY = 0.85

/** Decide the target size. Returns null when no downscale is needed. */
export function downscaleTarget(w: number, h: number, maxEdge: number = MAX_EDGE): { w: number; h: number } | null {
  const edge = Math.max(w, h)
  if (edge <= maxEdge) return null
  const scale = maxEdge / edge
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
}
```

Failing vitest: 4000×3000 → 2560×1920; 2560×100 → null; 100×4000 → 64×2560; aspect preserved within rounding. Then the thin canvas wrapper (`drawToBlob(file, target): Promise<Blob>`) — NOT unit-testable in node-env; keep it under ten lines and say so in the report.

- [ ] **Step 2: Descriptors** — `hero` and `about` in `SECTION_CONTENT_FIELDS` gain `{ name: 'image_url', type: 'image' }`. Vitest: the mapping exposes an image field for exactly those two sections.

- [ ] **Step 3: The renderer branch** in `LandingEditor.tsx`'s field renderer: for `type === 'image'` render current-image thumbnail (from `f.content?.[key]?.image_url`, shown via a plain `<img>` with `max-height` in admin chrome) or `t('landing_pages.editor.no_photo', 'No photo yet')`; a plain `<input type="file" accept="image/jpeg,image/png,image/webp">`; Remove button (quiet secondary, only when a photo exists). On pick: downscale when `downscaleTarget` says so, POST FormData `{slot: key, image}` via shared `api`; on success `qc.invalidateQueries({queryKey:['landing-page', currentBrandId]})` and bump `previewNonce` (uploads save immediately — the preview caption's "saved draft" contract holds). On failure `toast.error` with the server's message. Remove calls the DELETE endpoint, same invalidation. **The image field never writes through the text-save path** — it is not part of `form`/dirty state (D4's frontend half); note this in a comment beside the branch.

- [ ] **Step 4: Locales** — `no_photo`, `upload_photo`, `remove_photo`, `photo_uploading`, plus any toast strings, in all five files, real translations. The completeness scan covers `landing_pages.*` automatically — confirm it picks the new keys up (it greps this directory).

- [ ] **Step 5: `tsc -b` clean; vitest green (baseline restated at dispatch); mutations** — (1) `downscaleTarget` returns null always → its tests red; (2) descriptor mapping dropped → mapping test red. **Step 6: Commit** — `Landing editor: photo controls for the hero and about plates`.

---

## Self-Review

**Spec coverage:** §3.1→T1, §3.2→T1, §3.3→T1, §3.4→T2, §3.5→T3; §4.1→T4, §4.2→T5, §4.3→T6, §4.4 (lifecycle note) → T4's replace/remove is the implementation; the no-destroy-endpoint note needs no task. §5's tests are embedded per task. §2 D1–D5 each traceable: D1→T3+T6, D2→T4/T5, D3→T4's enum, D4→T4 (+T6's never-in-form note), D5→T4.

**Placeholder scan:** clean — the two "read Appendix B §4.5 first" instructions name the exact section and file conventions to follow, with the structural requirements (columns, ratios, margins, mobile-parity) stated in the task itself.

**Type consistency:** `imageUrl(string): ?string` defined T5, consumed only by blades; endpoint shapes defined T4, consumed T6 verbatim; `MaxImageDimensions(int $maxEdge)` defined T3, constructed `(4096)` in T4; `downscaleTarget` signature consistent within T6.

**Known risks, named:** (1) T5's goldens depend on commit order — Step 1 commits alone, and the reviewer checks history (established discipline). (2) T4's wizard-path refusal test may prove a structural impossibility rather than behaviour — the task says assert whichever is true and report. (3) The canvas wrapper is untestable in this repo — bounded to <10 lines and flagged for the walkthrough.

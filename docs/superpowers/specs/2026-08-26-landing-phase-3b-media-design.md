# Landing Phase 3b — Media Pipeline Repair and Image Upload — Design

The user's decision, made before this spec: **fix the pipeline first, then build
upload**. Every fact below was verified at the current tip by direct read, with
citations, before being designed against.

## 1. The pipeline as it actually is

1. **`MediaService::delete()` resolves against the CURRENT disk, not the disk
   the file was written on** (`MediaService.php:109-124`). A legacy
   `/storage/...` value deleted while `MEDIA_DISK=do` runs
   `Storage::disk('do')->delete('/storage/...')` — a silent no-op. Every
   "replace image" flow in the app therefore leaks the old file.
2. **`MediaService::url()` is a no-op** (`:130-135`) — both branches return
   `$path` unchanged; nothing calls it. Dead code that misleads readers.
3. **Local dev uploads land in the production bucket.** `.env:42` and
   `.env.production:42` both set `MEDIA_DISK=do` with the same credentials;
   `.env.example` never mentions `MEDIA_DISK` or `DO_SPACES_*` at all.
4. **`gallery_files[]` is never validated** in `ServiceController` (`:75-79`,
   `:130-134`) or `BookingRoomController::applyPhotos` (`:130-183`) — any file
   of any type up to `upload_max_filesize` becomes public.
5. **No dimension validation exists anywhere**; `getimagesize()` is unused;
   no image-processing library is installed (`composer.json`: only
   `endroid/qr-code`; GD exists only as a QR fallback the code itself calls
   shaky). A 6000×4000 original would be served as-is to every visitor.
6. **Return shapes differ by disk** (relative `/storage/...` on `public`,
   absolute CDN URL on `do`) — consumer columns hold a mix. Accepted as-is
   for 3b; normalising stored history is not this round's job.

## 2. Decisions

- **D1 — resizing happens in the browser; the server is a backstop, not a
  processor.** No server-side image library exists and GD is unreliable in
  prod, but the fix needs no dependency at all: the editor downscales via
  the Canvas API before upload (long edge ≤ 2560px, JPEG ~0.85 — these are
  photographic plates), and the server enforces hard ceilings with core
  PHP's `getimagesize()` — reject width or height > 4096px or files > 5MB.
  No thumbnails, no variants, no WebP conversion in 3b.
- **D2 — landing images are scalar URL leaves**: `content.hero.image_url`
  and `content.about.image_url`. `ScalarLeaves(depth: 2)` already permits
  exactly this shape and forbids nested objects (`{url, id}` would be depth
  3). No new columns, no migration. Appendix B's phantom `image_id` (named
  by `about.blade.php`'s own docblock as resolving to nothing) is
  superseded by `image_url`.
- **D3 — two slots in 3b: hero and about.** They are the two the template
  design (Appendix B §4.5 items 2 and 4) defines and the two the code
  explicitly leaves unbuilt. Services/team photos already flow from their
  own modules. Gallery, logo and further slots are 3c-or-later.
- **D4 — one writer per field family.** A dedicated upload endpoint owns
  `image_url`; the text `update()` path REFUSES `content.*.image_url` (with
  a friendly message) so the two writers cannot disagree — the
  answered-in-two-places rule, applied in advance this time.
- **D5 — replace deletes the replaced file; remove deletes and clears.**
  This is what makes fixing `delete()` a prerequisite rather than tidiness.

## 3. Pipeline repair (Part A)

### 3.1 `delete()` infers the disk from the value it is deleting
The stored value's shape is the only record of where it was written — use
it: a value starting `/storage/` strips the prefix and deletes on the
`public` disk; an absolute URL matching the configured cloud disk's base
URL strips that base and deletes on the cloud disk; anything else no-ops
**loudly** (`Log::warning('media.delete.unresolvable', [...])`) rather than
silently. Unit-complete over all shapes, mutation: swap the branches → red.

### 3.2 Delete the dead `url()`; document `disk()`
Remove `url()` (nothing calls it — verified). `.env.example` gains
`MEDIA_DISK` and the `DO_SPACES_*` keys, each with a one-line comment
including the warning this round exists to enforce: local dev must never
point at the production bucket.

### 3.3 Local dev stops writing to production
`.env:42` changes to `MEDIA_DISK=public`. `.env.production` stays `do`.
(.env is untracked; the change is made directly and recorded in the
report — the durable artefact is `.env.example`'s documentation.)

### 3.4 `gallery_files.*` gets the house rule
`'gallery_files' => 'nullable|array|max:24'`,
`'gallery_files.*' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120'`
in both `ServiceController` call sites and `BookingRoomController::applyPhotos`,
with custom messages (no default Laravel text; no field-name leakage —
the `content.contact.email` lesson).

### 3.5 A shared dimension backstop
`App\Rules\MaxImageDimensions` (core-PHP `getimagesize()`, no extension):
rejects width or height above a constructor-given cap, message written for
a tenant ("That image is very large — please use one up to 4096 pixels on
its longest side."). Applied in 3b to the landing upload (4096); wiring it
into the other upload endpoints is deliberately left for their own owners
(changing eight shipped endpoints' acceptance behaviour is not a landing
round's blast radius to spend).

## 4. Landing image upload (Part B)

### 4.1 Endpoint
`POST /v1/admin/landing-pages/image` — multipart, fields `slot`
(`in:hero,about`) and `image`
(`required|image|mimes:jpeg,png,jpg,webp|max:5120` + `MaxImageDimensions(4096)`),
inside the existing `feature:landing_pages` group. Resolves the page via
`LandingPageGuard` (never a bare `first()`), uploads to folder
`landing` (org-prefixed by `MediaService`), writes the returned URL into
`content.{slot}.image_url`, and — when replacing — deletes the previous
file via the repaired `delete()`. `DELETE /v1/admin/landing-pages/image`
with `slot` removes: deletes the file, clears the leaf.
`update()` gains the D4 refusal for `content.*.image_url`.

### 4.2 Renderer: build the two plates Appendix B specifies
- **Hero** (`hero.blade.php` — currently no image code at all): with
  `image_url`, render the photographic plate per Appendix B §4.5 item 2
  (plate on desktop, full-bleed cover on mobile — the mobile-parity house
  rule: never `display:none` the key visual). Without it, the current
  markup **byte-identical** (golden-capture discipline, capture committed
  before wiring).
- **About** (`about.blade.php` — documents its own unbuilt plate): with
  `image_url`, the 3:4 plate in columns 1-4 hung off the grid per §4.5
  item 4, text moving to columns 6-11; without it, the existing text-only
  path byte-identical. The docblock's "when the media layer lands" note is
  replaced by the implementation.
- **Safety:** `image_url` is tenant data reaching an `src` attribute. The
  blade renders the plate only when the value parses as `http(s)://...` or
  `/storage/...` (one shared helper on `PageContent`); anything else is
  treated as absent. Hostile values written via `DB::table()` (javascript:
  scheme, quotes, arrays, 200k strings) must render 200 with no plate and
  nothing escaping the attribute context. CSP already permits
  `img-src 'self' data: https:` (`LandingPageSecurity.php:88`) — CDN URLs
  render without policy changes.

### 4.3 Editor
`SECTION_CONTENT_FIELDS` gains `{ name: 'image_url', type: 'image' }` on
`hero` and `about`; `LandingEditor.tsx`'s field renderer gains an `image`
branch: current-image thumbnail (or "No photo yet"), a plain file input
(the screen's own no-canvas rule), Remove button, upload progress, and the
client-side Canvas downscale (D1) before POST. Failures surface the
server's friendly messages. i18n: every new string in all five locales.
Preview refresh: bump the existing `previewNonce` on upload/remove success
(the preview shows the saved draft — uploads save immediately, so it
reflects them).

### 4.4 Lifecycle
`unpublish` does not touch images. Page deletion is out of 3b's scope
(no destroy endpoint exists for landing pages today — noted, not built).
Orphans are bounded by D5's replace/remove deletion.

## 5. Testing

- Golden byte-parity for BOTH blades with no `image_url` (captures
  committed before wiring — reviewer verifies commit order).
- Hostile `image_url` battery via `DB::table()` on page AND preview.
- Upload endpoint: happy path per slot; replace deletes the old file
  (assert on the fake/local disk); remove clears and deletes; `slot`
  outside the enum 422s friendly; oversize dimensions 422 via
  `MaxImageDimensions` (fixture PNGs generated in-test at known sizes —
  `imagecreatetruecolor` if GD exists locally, else a pre-committed tiny
  fixture pair); non-Enterprise 402; cross-tenant/brand isolation via the
  guard (the six-times lesson).
- `delete()` disk-inference unit-complete; gallery_files rules bite
  (mutation: drop the rule → red).
- D4 refusal: `update()` with `content.hero.image_url` → 422 friendly;
  mutation: drop the refusal → red.
- Frontend: pure-function tests for the downscale decision logic and the
  field-descriptor mapping (vitest is node-env; Canvas itself is
  walkthrough-verified, stated plainly as such).

## 6. Rollout

Feature branch off local main; subagent-driven with per-task review; the
established deploy discipline (patch onto `origin/main`; rebuild the SPA on
the deploy artifact — never ship the branch's committed build; local main
still carries ~80 unrelated commits). Post-deploy smoke: upload a hero
image on the demo page, see the plate live, replace it, confirm the first
file is gone from the bucket.

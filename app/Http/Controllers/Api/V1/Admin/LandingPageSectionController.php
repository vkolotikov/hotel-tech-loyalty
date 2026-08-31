<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Landing\SectionType;
use App\Models\LandingPage;
use App\Services\MediaService;
use App\Support\LandingPageGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Add, remove, enable/disable and reorder the sections of the caller's own
 * landing page.
 *
 * Separate from LandingPageController because that class owns page CRUD and
 * publishing; a section is a different resource with a different shape, and
 * folding this in would have made update() a second, differently-validated
 * write path into the same row.
 *
 * store()/destroy() are SIBLING VERBS ON THIS CLASS rather than new
 * endpoints somewhere else, and that is the whole reason update() could stay
 * as narrow as it is. All three verbs answer the same question — which
 * sections does this page have, in what order — and the invariant they share
 * (a row exists iff the key is one App\Landing\SectionType knows, and the
 * fixed ones are neither created nor destroyed) is only enforceable if one
 * class owns all of it. Splitting create/delete off would have meant a
 * second resolver, a second lock discipline, and two places to remember the
 * page cap.
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

        // Resolved through LandingPageGuard, not through BrandScope. The
        // scope no-ops on a null bound brand ("All brands" mode), so a bare
        // first() here would hand this write a SIBLING brand's page and
        // silently toggle that page's sections instead of this brand's.
        $page = LandingPageGuard::pageOnBrand(LandingPageGuard::currentBrandId());

        abort_if($page === null, 404);

        $known = $page->sections->pluck('key')->all();

        foreach ($data['sections'] as $row) {
            if (!in_array($row['key'], $known, true)) {
                // Refused rather than created. A key this page does not own is
                // either a stale client or a typo, and silently inserting it
                // would put a section on the page that the renderer has no
                // partial for -- which the layout then skips, leaving a row in
                // the table that nothing will ever explain.
                //
                // This stays a refusal even now that store() below exists:
                // adding a band is its own verb, with its own caps and its
                // own key allocation, and a reorder payload is not the place
                // to acquire one by accident.
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

    /**
     * Add one section of a repeatable type.
     *
     * TAKES A TYPE, NEVER A KEY. The instance key (`text_1`, `text_2`, ...)
     * is allocated here from the rows the page actually has — see
     * SectionType::nextInstanceKey(), which hands back the LOWEST free index
     * rather than the highest plus one, so a tenant who adds and removes a
     * band six times has not permanently exhausted the namespace. Letting a
     * caller name its own key would mean validating an arbitrary string
     * against the grammar, the cap, and the rows already present, i.e. three
     * ways for a client to be wrong about something the server already
     * knows.
     *
     * Only REPEATABLE types may be added: the fixed set is seeded when the
     * page is created (LandingPageController::store(), from the industry's
     * defaultSections) and can be switched off, never added and never
     * removed. Rule::in against SectionType::repeatableIds() rather than a
     * literal, so a second repeatable type is a change to the catalogue and
     * to nothing else.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'string', Rule::in(SectionType::repeatableIds())],
        ], [
            // Every message named, the house rule this file's siblings
            // already follow (LandingPageController::update()'s slug and
            // template_key messages, ThemeRules::messages()): Laravel's own
            // defaults here are "The type field is required." and "The
            // selected type is invalid.", both of which hand a tenant a raw
            // field name -- exactly what spec 9 says must never reach them.
            'type.required' => 'Please choose which kind of section to add.',
            'type.string'   => 'Please choose which kind of section to add.',
            'type.in'       => 'That kind of section cannot be added to a page.',
        ]);

        $page = LandingPageGuard::pageOnBrand(LandingPageGuard::currentBrandId());

        abort_if($page === null, 404);

        // Both caps and the key allocation read the ROW-LOCKED page inside
        // the transaction, never the snapshot resolved above -- the same
        // ruling (3b-6) every other content writer on this page follows.
        // Two simultaneous adds against a page holding fifteen sections
        // would otherwise both see fifteen and both insert; and two adds of
        // the same type would both allocate the same free index, where the
        // (landing_page_id, key) unique index turns a silent double-insert
        // into a 500 instead of the friendly refusal below.
        //
        // The refusals are thrown from INSIDE the transaction, which rolls
        // it back -- nothing has been written at that point, so there is
        // nothing to undo and no Postgres 25P02 lookup afterwards to worry
        // about (see update()'s catch placement in LandingPageController for
        // the case where that does matter).
        $key = DB::transaction(function () use ($page, $data) {
            /** @var LandingPage $fresh */
            $fresh = LandingPage::where('id', $page->id)
                ->where('organization_id', $page->organization_id)
                ->lockForUpdate()
                ->firstOrFail();

            $existing = $fresh->sections()->pluck('key')->all();

            if (count($existing) >= SectionType::MAX_SECTIONS_PER_PAGE) {
                throw ValidationException::withMessages([
                    'type' => 'This page already has as many sections as it can hold. Remove one before adding another.',
                ]);
            }

            $key = SectionType::nextInstanceKey($data['type'], $existing);

            // The instance cap, and its ONE expression: nextInstanceKey()
            // scans 1..SectionType::MAX_INSTANCES_PER_TYPE and returns null
            // when every index is taken. The message names no type and no
            // field -- "sections like this one" is what a tenant looking at
            // the band already knows it is.
            if ($key === null) {
                throw ValidationException::withMessages([
                    'type' => 'You can add up to six sections like this one. Remove one before adding another.',
                ]);
            }

            // Appended, not inserted: a new band goes to the bottom of the
            // page and the tenant drags it where they want it, which is the
            // one placement that never silently reorders anything they had
            // already arranged. Clamped to the same 0..999 window update()
            // validates, so a page whose sorts were pushed to the ceiling by
            // a reorder cannot produce a row this endpoint's own reorder
            // rule would then refuse.
            $sort = min(999, (int) $fresh->sections()->max('sort') + 1);

            $fresh->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $sort]);

            return $key;
        });

        return response()->json(['key' => $key, 'page' => $page->fresh('sections')], 201);
    }

    /**
     * Remove one added section: its row, its copy, and its photo.
     *
     * Three things, because a section is three things. Dropping only the row
     * leaves `content.<key>` behind (harmless to the renderer, which never
     * looks at content without a row, but it is the tenant's data sitting in
     * a column nothing will ever show them again) and leaves the uploaded
     * file on the disk with nothing pointing at it -- the exact orphan
     * uploadImage()'s own replace-and-delete pairing exists to prevent.
     *
     * The key travels in the BODY rather than the path, matching
     * `DELETE /v1/admin/landing-pages/image`'s `slot` -- the sibling verb on
     * this same resource, which made the same choice for the same reason:
     * the page is resolved from the caller's tenant and brand, so the only
     * thing left to name is which part of it, and doing that two different
     * ways on one resource is a difference with no meaning behind it.
     */
    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate([
            'key' => 'required|string|max:64',
        ], [
            'key.required' => 'Please choose which section to remove.',
            'key.string'   => 'Please choose which section to remove.',
            'key.max'      => 'Please choose which section to remove.',
        ]);

        $page = LandingPageGuard::pageOnBrand(LandingPageGuard::currentBrandId());

        abort_if($page === null, 404);

        $key = $data['key'];

        // Answered BEFORE the transaction because it is a fact about the
        // catalogue, not about the page: a fixed section can be switched off
        // through update() above but never removed, whether or not this page
        // happens to carry one. Doing it here keeps the refusal out of a
        // transaction it has no reason to open.
        if (!SectionType::isInstanceKey($key)) {
            throw ValidationException::withMessages([
                'key' => 'Sections that come with the page can be switched off, but not removed.',
            ]);
        }

        // Same lock-and-reread shape as LandingPageController's three
        // content writers (ruling 3b-6): the row this deletes, the content
        // leaf it clears and the file URL it captures all come from the
        // freshly locked copy, so a save or an upload racing this cannot
        // leave the page pointing at a file this request has already
        // deleted, nor this request deleting a file a concurrent upload has
        // just replaced.
        //
        // MediaService::delete() is deliberately NOT called in here -- see
        // below.
        $old = DB::transaction(function () use ($page, $key) {
            /** @var LandingPage $fresh */
            $fresh = LandingPage::where('id', $page->id)
                ->where('organization_id', $page->organization_id)
                ->lockForUpdate()
                ->firstOrFail();

            $row = $fresh->sections()->where('key', $key)->first();

            if ($row === null) {
                // The same words update() uses for the same situation, so a
                // stale client gets one answer to "this page has no such
                // section" rather than two that happen to mean the same
                // thing.
                throw ValidationException::withMessages([
                    'key' => "This page has no section called '{$key}'.",
                ]);
            }

            $content = is_array($fresh->content) ? $fresh->content : [];
            $leaf    = $content[$key] ?? null;
            $old     = is_array($leaf) ? ($leaf['image_url'] ?? null) : null;

            // Unset, not nulled: the section is gone, so an empty husk under
            // its key would be a shape nothing here ever writes deliberately
            // and the next add of the same index would silently adopt.
            unset($content[$key]);

            $fresh->content = $content;
            $fresh->save();

            $row->delete();

            return $old;
        });

        // Post-commit and best-effort, the pattern uploadImage()/
        // removeImage() already use (and ChatWidgetConfigController's
        // avatar-replace path before them): the row and the leaf are gone
        // for good by the time this runs, so a disk that refuses the delete
        // must leave a warning in the log rather than turn a successful
        // removal into an error the tenant cannot act on -- and it must
        // never run inside the transaction, which would hold a row lock
        // across a network call to the media disk.
        //
        // A string check, not a truthiness one: an image_url of '0' is a
        // legal (if odd) past upload and must still be cleaned up.
        if (is_string($old) && $old !== '') {
            try {
                MediaService::delete($old);
            } catch (\Throwable $e) {
                Log::warning('landing.section.image_delete_failed', [
                    'slot'  => $key,
                    'url'   => $old,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return response()->json(['key' => $key, 'page' => $page->fresh('sections')]);
    }
}

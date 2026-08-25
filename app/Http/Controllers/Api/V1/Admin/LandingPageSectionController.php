<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Support\LandingPageGuard;
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

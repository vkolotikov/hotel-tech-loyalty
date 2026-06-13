<?php

namespace App\Http\Concerns;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Validation\ValidationException;

/**
 * Shared pagination + sort + filter parsing for admin index endpoints.
 *
 * Before this trait, ~24 admin controllers each rewrote the same
 * boilerplate with subtly different defaults (per_page fell back to 20
 * vs 25 vs 50), inconsistent search parsing (some used
 * `$request->when()`, some `if ($x = $request->get('x'))`), and most
 * importantly — most did NOT allowlist `sort_by`, accepting any
 * column name into orderBy() with SQL-injection risk.
 *
 * See AUDIT-2026-06-13-ADDENDUM.md maintainability finding (24 admin
 * index controllers duplicate the same boilerplate).
 *
 * Usage:
 *
 *   class GuestController extends Controller {
 *       use IndexesResource;
 *
 *       public function index(Request $request): JsonResponse {
 *           $query = Guest::query();
 *           $this->applyFilters($query, $request);
 *           return response()->json($this->applyIndex(
 *               $query,
 *               $request,
 *               sortable: ['created_at','last_name','email','stays_count'],
 *               defaultSort: 'created_at',
 *               searchable: ['first_name','last_name','email','phone'],
 *           ));
 *       }
 *   }
 *
 * Behaviour:
 *   - `per_page` clamped to [1, 100], default 25.
 *   - `sort_by` (or legacy `sort`) must be in the `$sortable` allowlist;
 *     unknown values fall back to `$defaultSort`. Direction (`dir` or
 *     `direction`) accepts only `asc` / `desc`.
 *   - When `$searchable` is provided, the `search` query param is
 *     OR-matched ILIKE across those columns.
 *
 * Safe to opt-into one controller at a time — does not break any
 * existing pagination behaviour. Existing controllers stay on their
 * hand-rolled pagination until they're touched for a feature.
 */
trait IndexesResource
{
    /**
     * Run the standard index pipeline against a pre-filtered query.
     *
     * @param  array<int,string>  $sortable    Allowlist of sortable columns.
     * @param  array<int,string>  $searchable  Optional ILIKE-searchable columns.
     */
    protected function applyIndex(
        Builder $query,
        Request $request,
        array $sortable,
        string $defaultSort = 'created_at',
        array $searchable = [],
        int $defaultPerPage = 25,
        int $maxPerPage = 100,
    ): LengthAwarePaginator {
        if (!in_array($defaultSort, $sortable, true)) {
            // Configuration error — the caller's defaultSort isn't in
            // their own allowlist. Surface immediately rather than
            // silently falling through to the first sortable column.
            throw ValidationException::withMessages([
                'sort_by' => "Default sort column '{$defaultSort}' is not in the sortable allowlist.",
            ]);
        }

        // Optional search across $searchable columns.
        $search = trim((string) $request->get('search', ''));
        if ($search !== '' && !empty($searchable)) {
            $query->where(function (Builder $q) use ($search, $searchable) {
                foreach ($searchable as $col) {
                    $q->orWhere($col, 'ilike', "%{$search}%");
                }
            });
        }

        // Sort — accept either `sort` or `sort_by` to ease migration
        // from existing controllers that used either name.
        $requested = $request->get('sort_by', $request->get('sort'));
        $sort = (is_string($requested) && in_array($requested, $sortable, true))
            ? $requested
            : $defaultSort;

        // Direction — accept `dir` or `direction`. Default desc since
        // every existing index endpoint in this project defaulted to
        // desc except those that explicitly override.
        $rawDir = strtolower((string) $request->get('dir', $request->get('direction', 'desc')));
        $dir = $rawDir === 'asc' ? 'asc' : 'desc';

        $query->orderBy($sort, $dir);

        // Per-page — clamp into a sane range. Reject explicit silliness
        // (per_page=10000 was a common reason indexed responses timed out
        // on the older controllers).
        $perPage = (int) $request->get('per_page', $defaultPerPage);
        if ($perPage < 1)         $perPage = $defaultPerPage;
        if ($perPage > $maxPerPage) $perPage = $maxPerPage;

        return $query->paginate($perPage);
    }
}

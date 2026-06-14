<?php

namespace Tests\Feature\Concerns;

use App\Http\Concerns\IndexesResource;
use App\Models\Guest;
use Database\Factories\GuestFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Validation\ValidationException;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Test-only wrapper class that exposes the protected
 * IndexesResource::applyIndex() method for direct testing.
 */
class IndexesResourceTestSubject
{
    use IndexesResource;

    public function call(
        Builder $query,
        Request $request,
        array $sortable,
        string $defaultSort = 'created_at',
        array $searchable = [],
        int $defaultPerPage = 25,
        int $maxPerPage = 100,
    ): LengthAwarePaginator {
        return $this->applyIndex($query, $request, $sortable, $defaultSort, $searchable, $defaultPerPage, $maxPerPage);
    }
}

/**
 * Locks the IndexesResource trait — the shared admin index helper
 * for ~24 controllers. Drift here would re-introduce the audit's
 * #1 maintainability finding: each controller silently inventing
 * its own defaults + missing sort_by allowlist (SQL injection
 * surface).
 *
 * Coverage:
 *
 *   per_page clamping:
 *     - default (25) when omitted
 *     - custom value in range honored
 *     - < 1 falls back to default (matches the pre-trait behavior
 *       so existing consumers don't regress on this edge)
 *     - > maxPerPage clamped (closes the per_page=10000 footgun
 *       that timed out indexed responses)
 *
 *   sort allowlist:
 *     - in-allowlist column applies
 *     - off-allowlist column falls back to defaultSort (SQL
 *       injection guard — caller can never feed user-controlled
 *       column names directly into orderBy)
 *     - accepts both `sort_by` and legacy `sort` keys
 *     - default sort not in allowlist → ValidationException
 *
 *   direction:
 *     - default 'desc' when omitted (matches existing controller
 *       defaults)
 *     - 'asc' honored
 *     - garbage falls back to 'desc'
 *     - case-insensitive
 *     - accepts both `dir` and `direction` keys
 *
 *   search:
 *     - applied across $searchable columns via ILIKE OR-match
 *     - empty search → no WHERE clause added
 *     - empty searchable list → no WHERE clause added
 *
 * Note on ILIKE: trait uses Postgres ILIKE. SQLite (the test DB)
 * doesn't have ILIKE, so search tests inspect the generated SQL
 * via toSql() before paginate() rather than executing the query.
 */
class IndexesResourceTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private IndexesResourceTestSubject $subject;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $this->subject = new IndexesResourceTestSubject();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    public function test_default_per_page_is_25_when_param_omitted(): void
    {
        GuestFactory::new()->count(30)->create();

        $paginator = $this->subject->call(
            Guest::query(),
            Request::create('/'),
            sortable: ['created_at'],
        );

        $this->assertSame(25, $paginator->perPage());
        $this->assertCount(25, $paginator->items());
    }

    public function test_custom_per_page_within_range_is_honored(): void
    {
        GuestFactory::new()->count(40)->create();

        $paginator = $this->subject->call(
            Guest::query(),
            Request::create('/?per_page=10'),
            sortable: ['created_at'],
        );

        $this->assertSame(10, $paginator->perPage());
        $this->assertCount(10, $paginator->items());
    }

    public function test_per_page_less_than_1_falls_back_to_default(): void
    {
        // Garbage input (negative / zero) must NOT zero-out the
        // result. Falls back to the default rather than crashing
        // the indexer.
        GuestFactory::new()->count(30)->create();

        $paginator = $this->subject->call(
            Guest::query(),
            Request::create('/?per_page=0'),
            sortable: ['created_at'],
        );
        $this->assertSame(25, $paginator->perPage());

        $paginator = $this->subject->call(
            Guest::query(),
            Request::create('/?per_page=-50'),
            sortable: ['created_at'],
        );
        $this->assertSame(25, $paginator->perPage());
    }

    public function test_per_page_above_max_clamps_to_max(): void
    {
        // The per_page=10000 footgun — without clamping, indexed
        // responses time out on large tables.
        GuestFactory::new()->count(30)->create();

        $paginator = $this->subject->call(
            Guest::query(),
            Request::create('/?per_page=999'),
            sortable: ['created_at'],
            maxPerPage: 100,
        );

        $this->assertSame(100, $paginator->perPage());
    }

    public function test_custom_max_per_page_is_honored(): void
    {
        GuestFactory::new()->count(60)->create();

        $paginator = $this->subject->call(
            Guest::query(),
            Request::create('/?per_page=999'),
            sortable: ['created_at'],
            maxPerPage: 50,
        );

        $this->assertSame(50, $paginator->perPage());
    }

    public function test_sort_by_in_allowlist_applies(): void
    {
        GuestFactory::new()->create(['first_name' => 'Alpha']);
        GuestFactory::new()->create(['first_name' => 'Bravo']);
        GuestFactory::new()->create(['first_name' => 'Charlie']);

        $paginator = $this->subject->call(
            Guest::query(),
            Request::create('/?sort_by=first_name&dir=asc'),
            sortable: ['created_at', 'first_name'],
        );

        $names = collect($paginator->items())->pluck('first_name')->all();
        $this->assertSame(['Alpha', 'Bravo', 'Charlie'], $names);
    }

    public function test_sort_by_off_allowlist_falls_back_to_default(): void
    {
        // SQL injection guard: a value not in the allowlist must
        // fall through to defaultSort. Pre-trait, ~24 controllers
        // fed user input directly into orderBy().
        GuestFactory::new()->count(3)->create();

        $paginator = $this->subject->call(
            Guest::query(),
            Request::create('/?sort_by=secret_admin_column; DROP TABLE users--'),
            sortable: ['created_at', 'first_name'],
            defaultSort: 'created_at',
        );

        // Should NOT throw, NOT inject SQL — just sort by created_at.
        $this->assertSame(3, $paginator->total());
    }

    public function test_sort_param_accepts_both_sort_and_sort_by_keys(): void
    {
        // Legacy controllers used `sort`; new ones use `sort_by`.
        // Trait accepts both so migration is back-compat.
        GuestFactory::new()->create(['first_name' => 'Aardvark']);
        GuestFactory::new()->create(['first_name' => 'Zebra']);

        $viaSortBy = $this->subject->call(
            Guest::query(),
            Request::create('/?sort_by=first_name&dir=asc'),
            sortable: ['created_at', 'first_name'],
        );
        $viaSort = $this->subject->call(
            Guest::query(),
            Request::create('/?sort=first_name&dir=asc'),
            sortable: ['created_at', 'first_name'],
        );

        $first = $viaSortBy->items()[0]->first_name;
        $second = $viaSort->items()[0]->first_name;
        $this->assertSame($first, $second);
        $this->assertSame('Aardvark', $first);
    }

    public function test_default_sort_not_in_allowlist_throws_validation_exception(): void
    {
        // Configuration-error guard for the CALLER. The trait must
        // surface this immediately so the controller author catches
        // it in dev, not silently falling through to the first
        // allowlist entry.
        $this->expectException(ValidationException::class);

        $this->subject->call(
            Guest::query(),
            Request::create('/'),
            sortable: ['first_name'],     // 'created_at' is NOT in the list
            defaultSort: 'created_at',
        );
    }

    public function test_direction_defaults_to_desc(): void
    {
        // The pre-trait controllers defaulted to desc almost
        // universally. Maintaining that default keeps existing
        // SPA consumers unchanged when their controller adopts
        // the trait.
        GuestFactory::new()->create(['first_name' => 'A']);
        GuestFactory::new()->create(['first_name' => 'B']);

        $paginator = $this->subject->call(
            Guest::query(),
            Request::create('/?sort_by=first_name'),
            sortable: ['created_at', 'first_name'],
        );

        $names = collect($paginator->items())->pluck('first_name')->all();
        $this->assertSame(['B', 'A'], $names);
    }

    public function test_direction_asc_honored(): void
    {
        GuestFactory::new()->create(['first_name' => 'A']);
        GuestFactory::new()->create(['first_name' => 'B']);

        $paginator = $this->subject->call(
            Guest::query(),
            Request::create('/?sort_by=first_name&dir=asc'),
            sortable: ['created_at', 'first_name'],
        );

        $names = collect($paginator->items())->pluck('first_name')->all();
        $this->assertSame(['A', 'B'], $names);
    }

    public function test_direction_garbage_falls_back_to_desc(): void
    {
        // Defensive: junk values must not break orderBy.
        GuestFactory::new()->create(['first_name' => 'A']);
        GuestFactory::new()->create(['first_name' => 'B']);

        $paginator = $this->subject->call(
            Guest::query(),
            Request::create('/?sort_by=first_name&dir=DROP_TABLE'),
            sortable: ['created_at', 'first_name'],
        );

        $names = collect($paginator->items())->pluck('first_name')->all();
        $this->assertSame(['B', 'A'], $names);
    }

    public function test_direction_is_case_insensitive(): void
    {
        GuestFactory::new()->create(['first_name' => 'A']);
        GuestFactory::new()->create(['first_name' => 'B']);

        // Uppercase ASC must be recognised.
        $paginator = $this->subject->call(
            Guest::query(),
            Request::create('/?sort_by=first_name&dir=ASC'),
            sortable: ['created_at', 'first_name'],
        );
        $names = collect($paginator->items())->pluck('first_name')->all();
        $this->assertSame(['A', 'B'], $names);
    }

    public function test_direction_param_accepts_both_dir_and_direction_keys(): void
    {
        GuestFactory::new()->create(['first_name' => 'A']);
        GuestFactory::new()->create(['first_name' => 'B']);

        $viaDir = $this->subject->call(
            Guest::query(),
            Request::create('/?sort_by=first_name&dir=asc'),
            sortable: ['created_at', 'first_name'],
        );
        $viaDirection = $this->subject->call(
            Guest::query(),
            Request::create('/?sort_by=first_name&direction=asc'),
            sortable: ['created_at', 'first_name'],
        );

        $this->assertSame(
            collect($viaDir->items())->pluck('first_name')->all(),
            collect($viaDirection->items())->pluck('first_name')->all(),
        );
    }

    public function test_empty_search_does_not_add_where_clause(): void
    {
        // No search input → SQL must NOT contain any extra WHERE
        // beyond the TenantScope. Pre-trait, some controllers added
        // an empty WHERE clause that broke index usage on big
        // tables.
        $query = Guest::query();
        $this->subject->call(
            $query,
            Request::create('/?search='),
            sortable: ['created_at'],
            searchable: ['first_name', 'last_name', 'email'],
        );

        // After applyIndex, the underlying query SQL should not
        // contain ilike. Inspect via the pre-paginate state by
        // building a fresh query (paginate creates a clone).
        $inspect = Guest::query();
        $sqlBefore = $inspect->toSql();
        $this->subject->call(
            $inspect,
            Request::create('/?search='),
            sortable: ['created_at'],
            searchable: ['first_name', 'last_name', 'email'],
        );
        // After applyIndex, the original query was mutated. It must
        // still NOT contain ilike (search was empty).
        $sqlAfter = $inspect->toSql();
        $this->assertStringNotContainsStringIgnoringCase('ilike', $sqlAfter);
        $this->assertStringNotContainsStringIgnoringCase('ilike', $sqlBefore);
    }

    public function test_search_with_empty_searchable_list_does_not_add_where(): void
    {
        // Defensive: a controller that forgot to pass $searchable
        // should not have its query polluted.
        $query = Guest::query();
        $this->subject->call(
            $query,
            Request::create('/?search=anything'),
            sortable: ['created_at'],
            searchable: [],
        );

        $sql = $query->toSql();
        $this->assertStringNotContainsStringIgnoringCase('ilike', $sql);
    }

    public function test_search_applies_ilike_or_match_across_searchable_columns(): void
    {
        // The trait must apply ILIKE OR-match for non-empty search.
        // SQLite doesn't execute ILIKE — paginate() throws a
        // PDOException — but the SQL string was already generated
        // by the time it's submitted, so we catch the exception
        // and assert on the query's toSql() output. The trait's
        // contract is to GENERATE the right SQL; executing it is
        // Postgres's job in production.
        $query = Guest::query();
        try {
            $this->subject->call(
                $query,
                Request::create('/?search=alice'),
                sortable: ['created_at'],
                searchable: ['first_name', 'last_name', 'email'],
            );
            $this->fail('SQLite must reject ILIKE syntax — paginate should have thrown.');
        } catch (\Throwable $e) {
            // Expected — sqlite chokes on `ilike`. Assert on the
            // generated SQL on the pre-paginate query state.
            $sql = $query->toSql();
            $this->assertStringContainsStringIgnoringCase('ilike', $sql,
                'Search must apply an ILIKE clause.');
            $this->assertStringContainsString('first_name', $sql);
            $this->assertStringContainsString('last_name', $sql);
            $this->assertStringContainsString('email', $sql);
        }
    }

    public function test_search_value_is_trimmed(): void
    {
        // Whitespace-only `search` should be treated as empty, not
        // as " " which would add a WHERE clause that matches
        // everything via ILIKE %  %. URL-encoded so Request::create
        // accepts the query string.
        $query = Guest::query();
        $request = Request::create('/?search=%20%20%20');
        $this->subject->call(
            $query,
            $request,
            sortable: ['created_at'],
            searchable: ['first_name'],
        );

        $sql = $query->toSql();
        $this->assertStringNotContainsStringIgnoringCase('ilike', $sql);
    }
}

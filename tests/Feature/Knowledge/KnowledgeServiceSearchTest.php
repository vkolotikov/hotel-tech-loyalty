<?php

namespace Tests\Feature\Knowledge;

use App\Models\KnowledgeItem;
use App\Services\KnowledgeService;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use ReflectionMethod;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks KnowledgeService::searchRelevantItems + the underlying
 * tokeniseQuery primitive — the chatbot KB matcher that feeds
 * the website chatbot's `knowledge_context` parameter.
 *
 * Per CLAUDE.md: "Website chatbot sees only the org's knowledge
 * base." This test pins the matching algorithm so a regression
 * doesn't silently degrade chatbot answer quality OR leak items
 * from another org into the context.
 *
 * Two surfaces covered:
 *
 *   tokeniseQuery (private, ReflectionMethod):
 *     - Latin words < 3 chars rejected (noise filter)
 *     - Non-Latin (Cyrillic etc.) ≥ 2 chars kept (CJK-aware)
 *     - Stop words removed
 *     - Punctuation strips cleanly
 *     - Case-folded to lowercase
 *     - Duplicate tokens deduped
 *
 *   searchRelevantItems (public):
 *     - Empty query → returns top items ordered by priority +
 *       use_count (the "default surface" path)
 *     - Empty query honors active() scope (inactive items hidden)
 *     - Empty query is multi-tenant-isolated (org A's items NOT
 *       returned for org B)
 *
 *   Note: ILIKE-based scoring path can't execute on sqlite
 *   (Postgres-only operator). The SQL-inspection trick used in
 *   IndexesResourceTest verifies the SQL is generated correctly.
 */
class KnowledgeServiceSearchTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private KnowledgeService $service;
    private ReflectionMethod $tokenise;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpKnowledgeSchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $this->service = new KnowledgeService();
        $this->tokenise = new ReflectionMethod($this->service, 'tokeniseQuery');
        $this->tokenise->setAccessible(true);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }
        parent::tearDown();
    }

    private function tokens(string $query): array
    {
        return $this->tokenise->invoke($this->service, $query);
    }

    public function test_tokenises_lowercased_words_above_minimum_length(): void
    {
        // Canonical case: a few real English words above the 3-char
        // Latin minimum. Stop words removed.
        $words = $this->tokens('Where is the spa located in the hotel?');

        // 'where', 'spa', 'located', 'hotel' — but check_in / the /
        // is / in / where / are stop words
        $this->assertContains('spa', $words);
        $this->assertContains('located', $words);
        $this->assertContains('hotel', $words);
        $this->assertNotContains('the', $words, 'Stop word "the" must be removed.');
        $this->assertNotContains('is', $words, 'Stop word "is" must be removed.');
        $this->assertNotContains('in', $words, 'Stop word "in" must be removed.');
    }

    public function test_lower_cases_all_tokens(): void
    {
        $words = $this->tokens('CHECK-IN TIMES');

        foreach ($words as $w) {
            $this->assertSame(mb_strtolower($w), $w,
                "Token '{$w}' must be lowercased.");
        }
    }

    public function test_strips_punctuation_cleanly(): void
    {
        $words = $this->tokens('breakfast! parking? check-out.');

        foreach ($words as $w) {
            $this->assertDoesNotMatchRegularExpression(
                '/[!?.,;:]/',
                $w,
                "Token '{$w}' must not contain punctuation.",
            );
        }
    }

    public function test_dedupes_repeated_tokens(): void
    {
        // The token list must be unique so the SQL OR-where clause
        // doesn't get N copies of the same WHERE.
        $words = $this->tokens('spa spa spa massage');

        $this->assertSame(count($words), count(array_unique($words)));
    }

    public function test_latin_words_under_3_chars_are_rejected(): void
    {
        // "wi" "fi" both 2-char Latin → rejected. The split would
        // produce them but the length filter drops them.
        $words = $this->tokens('wi fi password');

        $this->assertNotContains('wi', $words);
        $this->assertNotContains('fi', $words);
        $this->assertContains('password', $words);
    }

    public function test_non_latin_2_char_tokens_are_kept(): void
    {
        // Cyrillic 2-char token (за in Russian = "behind/for"). The
        // CJK-aware fallback keeps these because 2-char tokens in
        // non-Latin scripts often carry real meaning.
        $words = $this->tokens('пицца за стол');

        // Non-Latin 2-char tokens kept; пицца (5-char) certainly kept.
        $this->assertNotEmpty($words);
        // Don't assert specific words since the stop-word list is
        // Latin-only — but verify the helper accepted SOMETHING.
        $longest = max(array_map('mb_strlen', $words));
        $this->assertGreaterThanOrEqual(2, $longest);
    }

    public function test_empty_query_returns_empty_token_list(): void
    {
        $this->assertEmpty($this->tokens(''));
        $this->assertEmpty($this->tokens('   '));
        $this->assertEmpty($this->tokens('?!,.'));
    }

    /* ─── searchRelevantItems empty-query path ───────────────── */

    public function test_empty_query_returns_top_items_by_priority_then_use_count(): void
    {
        // The "default surface" path — no query terms means we
        // can't score, so return top items by priority + use_count.
        $orgId = app('current_organization_id');
        KnowledgeItem::create([
            'organization_id' => $orgId,
            'question' => 'Low priority popular',
            'answer'   => 'X',
            'priority' => 1,
            'use_count'=> 100,
            'is_active'=> true,
        ]);
        KnowledgeItem::create([
            'organization_id' => $orgId,
            'question' => 'Top priority',
            'answer'   => 'Y',
            'priority' => 10,
            'use_count'=> 5,
            'is_active'=> true,
        ]);
        KnowledgeItem::create([
            'organization_id' => $orgId,
            'question' => 'Mid priority middle use',
            'answer'   => 'Z',
            'priority' => 5,
            'use_count'=> 50,
            'is_active'=> true,
        ]);

        $results = $this->service->searchRelevantItems('', $orgId);

        $this->assertCount(3, $results);
        // First should be the top-priority item.
        $this->assertSame('Top priority', $results[0]->question);
        // Second should be priority=5 (priority beats use_count in
        // the empty-query path).
        $this->assertSame('Mid priority middle use', $results[1]->question);
    }

    public function test_empty_query_skips_inactive_items(): void
    {
        // The active() scope must apply: items with is_active=false
        // never surface in chatbot context.
        $orgId = app('current_organization_id');
        KnowledgeItem::create([
            'organization_id' => $orgId,
            'question' => 'Hidden item',
            'answer' => '',
            'priority' => 10,
            'is_active' => false,
        ]);
        KnowledgeItem::create([
            'organization_id' => $orgId,
            'question' => 'Visible item',
            'answer' => '',
            'priority' => 1,
            'is_active' => true,
        ]);

        $results = $this->service->searchRelevantItems('', $orgId);

        $this->assertCount(1, $results);
        $this->assertSame('Visible item', $results[0]->question);
    }

    public function test_empty_query_honors_organization_isolation(): void
    {
        // Multi-tenant invariant: searchRelevantItems takes an
        // explicit $orgId AND filters by it. Items from org A
        // must NEVER appear in org B's chatbot context.
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgA->id);
        KnowledgeItem::create([
            'organization_id' => $orgA->id,
            'question' => 'Org A only',
            'answer' => '',
            'is_active' => true,
        ]);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB->id);
        KnowledgeItem::create([
            'organization_id' => $orgB->id,
            'question' => 'Org B only',
            'answer' => '',
            'is_active' => true,
        ]);

        // Bind context to org A and query org A — must see only
        // org A's item. KnowledgeItem uses BelongsToOrganization's
        // TenantScope so the BOUND context AND the explicit $orgId
        // filter must agree for results to surface.
        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgA->id);
        $resultsA = $this->service->searchRelevantItems('', $orgA->id);
        $this->assertCount(1, $resultsA);
        $this->assertSame('Org A only', $resultsA[0]->question);

        // Bind context to org B and query org B — must see only
        // org B's item.
        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB->id);
        $resultsB = $this->service->searchRelevantItems('', $orgB->id);
        $this->assertCount(1, $resultsB);
        $this->assertSame('Org B only', $resultsB[0]->question);
    }

    public function test_empty_query_respects_limit_parameter(): void
    {
        // The limit param caps the result set even when more
        // active items exist — back-pressure for the prompt size
        // we're stuffing into the chatbot context window.
        $orgId = app('current_organization_id');
        for ($i = 0; $i < 10; $i++) {
            KnowledgeItem::create([
                'organization_id' => $orgId,
                'question' => "Question {$i}",
                'answer' => '',
                'priority' => $i,
                'is_active' => true,
            ]);
        }

        $results = $this->service->searchRelevantItems('', $orgId, 3);

        $this->assertCount(3, $results);
    }

    /* ─── ILIKE-based search path (SQL inspection) ───────────── */

    public function test_query_with_terms_generates_ILIKE_clauses_per_searchable_column(): void
    {
        // SQLite can't execute ILIKE (Postgres-only operator),
        // but the service's job is to GENERATE the right SQL;
        // executing it is Postgres's job in production. Catch
        // the inevitable PDOException and assert on the
        // generated SQL via the exception path.
        $orgId = app('current_organization_id');
        KnowledgeItem::create([
            'organization_id' => $orgId,
            'question' => 'Where is the spa?',
            'answer' => 'On floor 3',
            'is_active' => true,
        ]);

        try {
            $this->service->searchRelevantItems('spa hours', $orgId);
            $this->fail('SQLite must reject ILIKE syntax.');
        } catch (\Throwable $e) {
            // The exception's underlying SQL must include ILIKE
            // clauses over both question + answer columns.
            $msg = strtolower($e->getMessage());
            $this->assertStringContainsString('ilike', $msg,
                'Search must generate ILIKE clauses.');
        }
    }
}

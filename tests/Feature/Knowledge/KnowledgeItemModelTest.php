<?php

namespace Tests\Feature\Knowledge;

use App\Models\KnowledgeItem;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the KnowledgeItem model contract — knowledge-base
 * Q&A row that the website chatbot reads via KnowledgeService.
 *
 * Sister to KnowledgeService tests (Tier I — searchRelevantItems +
 * tokeniseQuery). THIS test locks the MODEL surface: keywords
 * array cast, priority/use_count int casts, is_active scope +
 * incrementUseCount() helper, category FK lock, BelongsToBrand.
 *
 * Why this matters:
 *
 *   KnowledgeService::searchRelevantItems filters on
 *   is_active=true (via scopeActive) + matches against keywords
 *   array + sorts by priority desc + use_count desc. A regression
 *   in any cast surfaces wrong-type values that silently break
 *   the chatbot's KB lookup.
 *
 *   incrementUseCount() is called every time KnowledgeService
 *   surfaces this item in an answer — drives the "popular Q&As"
 *   analytics + the priority-tiebreak in search ordering.
 *
 * Contract:
 *
 *   - keywords array cast (multiword search terms — search
 *     tokeniser matches against this list)
 *   - priority + use_count int casts
 *   - is_active bool + scopeActive query helper
 *   - incrementUseCount() bumps use_count by 1
 *   - category BelongsTo KnowledgeCategory FK='category_id'
 *   - BelongsToOrganization + BelongsToBrand + tenant isolation
 */
class KnowledgeItemModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        // setUpKnowledgeSchema includes knowledge_items + brands.
        $this->setUpKnowledgeSchema();

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function item(array $attrs = []): KnowledgeItem
    {
        return KnowledgeItem::create(array_merge([
            'organization_id' => $this->orgId,
            'question'        => 'What time is check-in?',
            'answer'          => 'Check-in is at 3pm.',
            'is_active'       => true,
            'priority'        => 0,
            'use_count'       => 0,
        ], $attrs));
    }

    /* ─── keywords array cast ─── */

    public function test_keywords_round_trips_through_array_cast(): void
    {
        // CRITICAL: KnowledgeService::searchRelevantItems matches
        // search tokens against this array. A regression in the
        // array cast surfaces it as a JSON string — every search
        // misses.
        $keywords = ['check-in', 'arrival', 'check in time', '3pm'];

        $item = $this->item(['keywords' => $keywords]);

        $this->assertSame($keywords, $item->fresh()->keywords);
    }

    public function test_null_keywords_persists_as_null(): void
    {
        // Defensive: a not-yet-tagged item has null keywords.
        // The searcher treats null as empty match list (no false
        // matches from string-coerced "null").
        $item = $this->item(['keywords' => null]);

        $this->assertNull($item->fresh()->keywords);
    }

    /* ─── priority + use_count integer casts ─── */

    public function test_priority_casts_to_integer(): void
    {
        // priority is the admin-set sort weight (higher wins in
        // search ordering). KnowledgeService::sortBy depends on
        // proper int arithmetic.
        $item = $this->item(['priority' => '5']); // string input

        $this->assertSame(5, $item->priority);
        $this->assertIsInt($item->priority);
    }

    public function test_use_count_casts_to_integer(): void
    {
        // use_count is the popularity counter (incremented per
        // surfaced search result). Drives the "popular Q&As"
        // analytics + secondary sort key in search.
        $item = $this->item(['use_count' => '42']);

        $this->assertSame(42, $item->use_count);
        $this->assertIsInt($item->use_count);
    }

    /* ─── is_active boolean + scopeActive ─── */

    public function test_is_active_casts_to_boolean(): void
    {
        $active = $this->item(['is_active' => true]);
        $disabled = $this->item(['is_active' => false]);

        $this->assertTrue($active->is_active);
        $this->assertFalse($disabled->is_active);
        $this->assertIsBool($active->is_active);
    }

    public function test_scopeActive_filters_only_active_items(): void
    {
        // CRITICAL: chatbot search filters via this scope.
        // Inactive items MUST be excluded — otherwise admin's
        // "deactivate this stale answer" workflow silently
        // doesn't take effect.
        $this->item(['question' => 'Q1', 'is_active' => true]);
        $this->item(['question' => 'Q2', 'is_active' => false]);
        $this->item(['question' => 'Q3', 'is_active' => true]);

        $active = KnowledgeItem::active()->get();
        $titles = $active->pluck('question')->sort()->values()->toArray();

        $this->assertSame(['Q1', 'Q3'], $titles,
            'scopeActive MUST exclude inactive items.');
    }

    /* ─── incrementUseCount() helper ─── */

    public function test_incrementUseCount_bumps_use_count_by_one(): void
    {
        $item = $this->item(['use_count' => 5]);

        $item->incrementUseCount();

        $this->assertSame(6, (int) $item->fresh()->use_count,
            'incrementUseCount MUST bump use_count by 1.');
    }

    public function test_incrementUseCount_from_zero_initialises_correctly(): void
    {
        // Defensive: a brand-new item with use_count=0 bumps to 1.
        $item = $this->item(['use_count' => 0]);

        $item->incrementUseCount();

        $this->assertSame(1, (int) $item->fresh()->use_count);
    }

    public function test_incrementUseCount_is_idempotent_per_call(): void
    {
        // 3 calls = +3.
        $item = $this->item(['use_count' => 0]);

        $item->incrementUseCount();
        $item->incrementUseCount();
        $item->incrementUseCount();

        $this->assertSame(3, (int) $item->fresh()->use_count);
    }

    /* ─── Relationships ─── */

    public function test_category_relationship_uses_category_id_foreign_key(): void
    {
        // FK is 'category_id' (NOT 'knowledge_category_id').
        // Lock the explicit name.
        $item = $this->item();
        $rel = $item->category();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
        $this->assertSame('category_id', $rel->getForeignKeyName(),
            'category FK MUST be category_id (NOT knowledge_category_id).');
    }

    /* ─── BelongsToOrganization + BelongsToBrand ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $item = $this->item();

        $this->assertSame($this->orgId, (int) $item->organization_id);
    }

    public function test_tenant_scope_isolates_knowledge_items_cross_org(): void
    {
        // CRITICAL: KB content is tenant-private. Cross-leak
        // would expose competitor knowledge base + Q&A copy.
        $orgB = OrganizationFactory::new()->create()->id;

        $this->item(['question' => 'Org A Q']);
        \DB::table('knowledge_items')->insert([
            'organization_id' => $orgB,
            'question'        => 'Org B Q',
            'answer'          => 'B',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aRows = KnowledgeItem::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('Org A Q', $aRows->first()->question);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = KnowledgeItem::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('Org B Q', $bRows->first()->question);
    }
}

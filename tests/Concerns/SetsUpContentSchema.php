<?php

namespace Tests\Concerns;

use App\Models\Brand;
use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerPillar;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\Organization;
use App\Models\User;
use App\Services\ContentKnowledgeService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;

/**
 * Everything a HexaTech Content test needs (spec 2026-10-14): the planner's
 * own tables (its migrations run on sqlite, as CalendarGenerationTest does;
 * the "widen" migration is left out because sqlite does not enforce varchar
 * lengths), a beauty organisation with its default brand, a manager and a
 * staff member, a finished brand profile with two channels (Instagram on
 * Mon/Wed/Fri, LinkedIn on Tue/Thu), a stub knowledge service (no FAQ,
 * chatbot or service tables needed) and a fixed clock: Monday 5 October
 * 2026, 06:00 UTC.
 *
 * A test class uses `DatabaseTransactions` and this trait and calls
 * setUpContent() from setUp().
 */
trait SetsUpContentSchema
{
    use SetsUpMinimalSchema, MakesAdminCaller;

    protected Organization $org;
    protected int $brandId;
    protected User $manager;
    protected User $staffMember;
    protected ?ContentPlannerProfile $profile = null;

    protected function setUpContent(bool $withProfile = true): void
    {
        $this->setUpKnowledgeSchema();
        $this->setUpServiceCatalogSchema();
        $this->setUpAiUsageSchema();
        $columns = [
            'settings'          => fn (Blueprint $t) => $t->text('settings')->nullable(),
            'timezone'          => fn (Blueprint $t) => $t->string('timezone', 64)->nullable(),
            'currency'          => fn (Blueprint $t) => $t->string('currency', 10)->nullable(),
            'entitled_products' => fn (Blueprint $t) => $t->text('entitled_products')->nullable(),
            'plan_slug'         => fn (Blueprint $t) => $t->string('plan_slug', 64)->nullable(),
            'country'           => fn (Blueprint $t) => $t->string('country', 2)->nullable(),
        ];
        foreach ($columns as $column => $add) {
            if (!Schema::hasColumn('organizations', $column)) {
                Schema::table('organizations', $add);
            }
        }
        // The venue's zone (VenueClock reads `hotel_timezone`) and the brand accent (`primary_color`) live here.
        if (!Schema::hasTable('hotel_settings')) {
            Schema::create('hotel_settings', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('key', 100);
                $t->text('value')->nullable();
                $t->string('type', 32)->nullable();
                $t->string('group', 32)->nullable();
                $t->string('label')->nullable();
                $t->text('description')->nullable();
                $t->string('scope', 16)->default('company');
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('content_planner_profiles')) {
            (require database_path('migrations/2026_07_08_000000_create_content_planner_tables.php'))->up();
            (require database_path('migrations/2026_07_08_200000_upgrade_content_planner_tables.php'))->up();
        }
        if (!Schema::hasColumn('content_planner_visual_briefs', 'image_url')) {
            (require database_path('migrations/2026_07_09_000000_add_image_to_content_planner_visual_briefs.php'))->up();
        }
        if (!Schema::hasColumn('content_planner_channels', 'post_time')) {
            (require database_path('migrations/2026_10_15_100000_add_post_time_to_content_planner_channels.php'))->up();
        }
        if (!Schema::hasTable('content_planner_snippets')) {
            (require database_path('migrations/2026_10_15_100100_create_content_planner_snippets_table.php'))->up();
        }
        if (!Schema::hasColumn('content_planner_posts', 'series_id')) {
            (require database_path('migrations/2026_10_15_100200_add_series_id_to_content_planner_posts.php'))->up();
        }
        if (!Schema::hasColumn('content_planner_profiles', 'holiday_country')) {
            (require database_path('migrations/2026_10_16_100000_add_holiday_settings_to_content_planner_profiles.php'))->up();
        }
        if (!Schema::hasTable('content_planner_key_dates')) {
            (require database_path('migrations/2026_10_16_100100_create_content_planner_key_dates_table.php'))->up();
        }
        if (!Schema::hasTable('content_planner_templates')) {
            (require database_path('migrations/2026_10_16_100200_create_content_planner_templates_table.php'))->up();
        }
        if (!Schema::hasColumn('content_planner_profiles', 'requires_approval')) {
            (require database_path('migrations/2026_10_18_100000_add_requires_approval_to_content_planner_profiles.php'))->up();
        }
        if (!Schema::hasTable('content_planner_post_events')) {
            (require database_path('migrations/2026_10_18_100100_create_content_planner_post_events_table.php'))->up();
        }
        if (!Schema::hasTable('content_planner_post_comments')) {
            (require database_path('migrations/2026_10_18_100200_create_content_planner_post_comments_table.php'))->up();
        }
        if (!Schema::hasTable('content_planner_reads')) {
            (require database_path('migrations/2026_10_18_100300_create_content_planner_reads_table.php'))->up();
        }

        $this->travelTo(CarbonImmutable::parse('2026-10-05 06:00:00'));

        $this->org = Organization::create(['name' => 'Lumière Salon', 'slug' => 'org-' . uniqid('', true), 'industry' => 'beauty']);
        app()->instance('current_organization_id', $this->org->id);
        $this->brandId = (int) Brand::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('is_default', true)->value('id');
        app()->instance('current_brand_id', $this->brandId);

        $this->manager = $this->staffUser($this->org);
        $this->staffMember = $this->staffUser($this->org, ['role' => 'staff']);

        $this->app->instance(ContentKnowledgeService::class, new class extends ContentKnowledgeService {
            public function buildForBrand(int $orgId, int $brandId): array
            {
                return [
                    'exists' => true,
                    'sources' => ['has_faq' => false, 'faq_count' => 0, 'has_chatbot' => false, 'has_services' => false, 'has_org_info' => true],
                    'faq' => [],
                    'chatbot' => null,
                    'services' => [],
                    'organization' => ['name' => 'Lumière Salon', 'industry' => 'beauty', 'website' => null],
                    'missing_fields' => [],
                ];
            }

            public function summarizeForAi(int $orgId, int $brandId): string
            {
                return 'Test business context.';
            }
        });

        if ($withProfile) {
            $this->profile = $this->makeProfile($this->brandId);
        }

        // VenueClock memoises the venue's zone per request; a test is many.
        app()->forgetScopedInstances();
    }

    protected function api(string $path): string
    {
        return '/api/v1/admin/content/' . ltrim($path, '/');
    }

    protected function asManager(): static
    {
        return $this->actingAs($this->manager, 'sanctum');
    }

    protected function asStaffMember(): static
    {
        return $this->actingAs($this->staffMember, 'sanctum');
    }

    /** A finished profile for a brand, with Instagram (Mon/Wed/Fri) and LinkedIn (Tue/Thu). */
    protected function makeProfile(int $brandId): ContentPlannerProfile
    {
        $profile = ContentPlannerProfile::create([
            'name' => 'Lumière content',
            'brand_id' => $brandId,
            'default_language' => 'en',
            'setup_completed_at' => now(),
        ]);
        $days = fn (array $on) => array_merge(array_fill_keys(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], false), array_fill_keys($on, true));
        ContentPlannerChannel::create(['planner_profile_id' => $profile->id, 'brand_id' => $brandId, 'platform' => 'instagram', 'label' => 'Instagram', 'active' => true, 'frequency' => $days(['mon', 'wed', 'fri'])]);
        ContentPlannerChannel::create(['planner_profile_id' => $profile->id, 'brand_id' => $brandId, 'platform' => 'linkedin', 'label' => 'LinkedIn', 'active' => true, 'frequency' => $days(['tue', 'thu'])]);

        return $profile;
    }

    protected function makePost(array $attributes = []): ContentPlannerPost
    {
        return ContentPlannerPost::create($attributes + [
            'planner_profile_id' => $this->profile->id,
            'brand_id' => $this->brandId,
            'platform' => 'instagram',
            'status' => 'draft',
            'topic' => 'Autumn colours',
            'scheduled_date' => '2026-10-07',
        ]);
    }

    /** A second brand of this organisation, with its own profile unless told not to. @return array{0: int, 1: ?ContentPlannerProfile} */
    protected function secondBrand(bool $withProfile = true): array
    {
        $brand = Brand::create(['name' => 'Second Studio', 'slug' => 'second-' . uniqid(), 'is_default' => false, 'sort_order' => 5]);

        return [(int) $brand->id, $withProfile ? $this->makeProfile((int) $brand->id) : null];
    }

    /**
     * Another organisation with its own default brand, profile, one post and one pillar, built under its own tenant
     * and handed back with ours restored.
     *
     * @return array{org: Organization, brandId: int, post: ContentPlannerPost, pillarId: int}
     */
    protected function otherOrganization(): array
    {
        $priorOrg = app('current_organization_id');
        $priorBrand = app('current_brand_id');
        // Brand forces the bound tenant's id on create: with ours bound, the new organisation's
        // default brand would land in OUR organisation. Nothing is bound while it is made.
        app()->instance('current_organization_id', null);
        $other = Organization::create(['name' => 'Other Studio', 'slug' => 'other-' . uniqid('', true), 'industry' => 'beauty']);
        app()->instance('current_organization_id', $other->id);
        $brandId = (int) Brand::withoutGlobalScopes()->where('organization_id', $other->id)->where('is_default', true)->value('id');
        app()->instance('current_brand_id', $brandId);
        try {
            $profile = $this->makeProfile($brandId);
            $post = ContentPlannerPost::create(['planner_profile_id' => $profile->id, 'brand_id' => $brandId, 'platform' => 'instagram', 'status' => 'draft', 'topic' => 'Theirs', 'scheduled_date' => '2026-10-07']);
            $pillar = ContentPlannerPillar::create(['planner_profile_id' => $profile->id, 'brand_id' => $brandId, 'name' => 'Their pillar', 'active' => true]);

            return ['org' => $other, 'brandId' => $brandId, 'post' => $post, 'pillarId' => (int) $pillar->id];
        } finally {
            app()->instance('current_organization_id', $priorOrg);
            app()->instance('current_brand_id', $priorBrand);
        }
    }

    /** An Anthropic message whose text is a calendar, as CalendarGenerationTest builds it. */
    protected function calendarReply(array $items): array
    {
        return [
            'id' => 'msg_content_test', 'type' => 'message', 'role' => 'assistant', 'model' => 'claude-sonnet-5',
            'content' => [['type' => 'text', 'text' => json_encode(['items' => $items])]],
            'stop_reason' => 'end_turn', 'stop_sequence' => null,
            'usage' => ['input_tokens' => 20, 'output_tokens' => 30],
        ];
    }

    protected function calendarItem(string $date, string $platform): array
    {
        return [
            'date' => $date, 'time' => '09:00', 'platform' => $platform, 'topic' => 'Autumn colours',
            'hook' => 'Three colours for October', 'draft_copy' => 'A useful draft.', 'cta' => 'Book now',
            'hashtags' => ['#autumn'], 'visual_idea' => 'A warm still life.',
        ];
    }

    /** Calendar-path AI answers every request with these items (or this error status); nothing reaches the network. */
    protected function fakeAi(array $items, int $status = 200): void
    {
        $this->fakeAiTurns([[$items, $status]]);
    }

    /**
     * Calendar-path AI answers each request with the next turn, [items, status],
     * and keeps repeating the last one. Http::fake() stubs add up and the first
     * one registered wins, so a test that needs a failure and then a success
     * says so here, in one call.
     *
     * @param list<array{0: array, 1: int}> $turns
     */
    protected function fakeAiTurns(array $turns): void
    {
        Http::preventStrayRequests();
        config(['services.anthropic.api_key' => 'content-test-key', 'services.anthropic.content_planner_model' => 'claude-sonnet-5']);
        $responses = array_map(fn (array $turn) => $turn[1] === 200
            ? Http::response($this->calendarReply($turn[0]))
            : Http::response(['type' => 'error', 'error' => ['type' => 'api_error', 'message' => 'Overloaded']], $turn[1]), $turns);
        Http::fake(['*' => Http::sequence($responses)->whenEmpty(end($responses))]);
    }

    /** A monthly AI cap of $cents with $usedCents already spent this month. */
    protected function setAiCap(int $cents, int $usedCents): void
    {
        $this->org->forceFill(['plan_features' => ['ai_monthly_cost_cents' => $cents]])->save();
        DB::table('ai_usage_logs')->insert([
            'organization_id' => $this->org->id, 'model' => 'claude-sonnet-5', 'kind' => 'chat',
            'feature' => 'crm_chat', 'cost_cents' => $usedCents, 'created_at' => now(),
        ]);
        // AiUsageService caches the month's total for 60 seconds; a gate read earlier in the test must not hide this.
        Cache::forget("ai_usage:month:{$this->org->id}:" . now()->format('Y-m'));
    }
}

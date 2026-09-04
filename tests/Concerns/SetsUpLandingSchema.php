<?php
namespace Tests\Concerns;

use Illuminate\Support\Facades\Schema;

/**
 * Landing-page tables on top of the minimal set.
 *
 * The repo builds tables per test rather than running the production
 * migrations, which use Postgres-only features and do not survive sqlite.
 */
trait SetsUpLandingSchema
{
    use SetsUpMinimalSchema;

    protected function setUpLandingSchema(): void
    {
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('landing_pages')) {
            Schema::create('landing_pages', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('brand_id')->nullable();
                $table->string('slug', 63)->unique();
                $table->string('template_key', 40);
                $table->string('industry', 32);
                $table->string('status', 16)->default('draft');
                $table->timestamp('published_at')->nullable();
                $table->timestamp('first_published_at')->nullable();
                // TEXT, not json: sqlite has no jsonb, and the model's array
                // cast reads either identically.
                $table->text('theme')->nullable();
                $table->text('content')->nullable();
                $table->text('seo')->nullable();
                $table->timestamps();
                // Mirrors landing_pages_org_brand_unique in production: one
                // page per brand.
                $table->unique(['organization_id', 'brand_id']);
            });
        }

        if (!Schema::hasTable('landing_page_sections')) {
            Schema::create('landing_page_sections', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('landing_page_id');
                $table->string('key', 32);
                $table->boolean('enabled')->default(true);
                // Mirrors 2026_08_31_090000_add_tone_to_landing_page_sections:
                // nullable with no default, because null is a real value here
                // ("render this band the way it was authored") and not merely
                // an absent one.
                $table->string('tone', 16)->nullable();
                $table->integer('sort')->default(0);
                $table->text('content')->nullable();
                $table->timestamps();
                $table->unique(['landing_page_id', 'key']);
            });
        }

        if (!Schema::hasTable('landing_page_redirects')) {
            Schema::create('landing_page_redirects', function ($table) {
                $table->bigIncrements('id');
                $table->string('slug', 63)->unique();
                $table->unsignedBigInteger('landing_page_id');
                // NOT NULL, matching the migration. A redirect with no expiry
                // is not a state production can be in, so nothing here may
                // exercise one.
                $table->timestamp('expires_at')->index();
                $table->timestamps();
            });
        }
    }

    /**
     * An organizations row for the page's tenant, carrying a widget token.
     *
     * Opt-in, not automatic: most landing tests render with a bare
     * `organization_id => 1` and never needed the row to exist. The booking
     * frame does -- the widget binds its tenant by `widget_token` and by
     * nothing else, so a page whose org has no token can offer no booking URL
     * at all. Tests that assert the booking flow have to seed the fact the
     * real world always has; tests that do not care keep their empty table.
     */
    /**
     * Make an organisation's page BOOKABLE — the exact precondition
     * PageContent::bookingMode() asks for and ServiceSchedulingService
     * enforces (template fidelity phase 6): an active service, linked to an
     * active master, who has an active schedule row with a real window.
     *
     * Links the tenant's FIRST active service to its FIRST active master (in
     * the page's own ordering, sort_order then name) unless told otherwise,
     * and gives that master Monday 09:00–17:00. Returns the pair so a test
     * can assert the deep links the chips carry name exactly these rows.
     * Written through the query builder rather than the models so the
     * tenant traits' creating hooks never re-file a row under a bound org.
     *
     * @return array{service: int, master: int}
     */
    protected function seedBookableSchedule(int $orgId = 1, ?int $serviceId = null, ?int $masterId = null): array
    {
        $db = \Illuminate\Support\Facades\DB::class;

        $serviceId ??= $db::table('services')->where('organization_id', $orgId)->where('is_active', true)
            ->orderBy('sort_order')->orderBy('name')->value('id');
        $masterId ??= $db::table('service_masters')->where('organization_id', $orgId)->where('is_active', true)
            ->orderBy('sort_order')->orderBy('name')->value('id');

        if ($serviceId === null || $masterId === null) {
            throw new \RuntimeException('seedBookableSchedule() needs an active service and an active master to link.');
        }

        $db::table('service_master_service')->insert([
            'organization_id' => $orgId, 'service_master_id' => $masterId, 'service_id' => $serviceId,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $db::table('service_master_schedules')->insert([
            'organization_id' => $orgId, 'service_master_id' => $masterId,
            'day_of_week' => 1, 'start_time' => '09:00:00', 'end_time' => '17:00:00', 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return ['service' => (int) $serviceId, 'master' => (int) $masterId];
    }

    protected function seedWidgetOrganization(int $id = 1, string $token = 'wt-landing-test-token'): void
    {
        if (\Illuminate\Support\Facades\DB::table('organizations')->where('id', $id)->exists()) {
            return;
        }

        \Illuminate\Support\Facades\DB::table('organizations')->insert([
            'id'           => $id,
            'name'         => 'Test Organization',
            'slug'         => 'test-organization-' . $id,
            'widget_token' => $token,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);
    }

    /** The tables a landing page reads live. Columns follow each model's $fillable. */
    protected function setUpLandingContentSchema(): void
    {
        // BelongsToBrand's creating hook falls back to looking up the org's
        // default brand whenever a row is created without an explicit
        // brand_id (e.g. the Service/ServiceMaster rows these tests create).
        // Without this table that lookup hits "no such table: brands".
        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('name');
                $table->string('slug')->nullable();
                $table->string('logo_url')->nullable();
                // The brand's own colour, which the wizard offers as the
                // starting point for the page's accent before the tenant
                // picks anything.
                $table->string('primary_color', 32)->nullable();
                $table->string('widget_token', 64)->nullable();
                $table->boolean('is_default')->default(false);
                $table->integer('sort_order')->default(0);
                $table->softDeletes();
                $table->timestamps();
                $table->index('organization_id');
            });
        }

        if (!Schema::hasTable('services')) {
            Schema::create('services', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('brand_id')->nullable();
                $table->unsignedBigInteger('category_id')->nullable();
                $table->string('name');
                $table->string('slug')->nullable();
                $table->text('description')->nullable();
                $table->text('short_description')->nullable();
                $table->integer('duration_minutes')->nullable();
                $table->decimal('price', 10, 2)->nullable();
                $table->string('currency', 8)->nullable();
                $table->string('image')->nullable();
                $table->text('gallery')->nullable();
                $table->integer('sort_order')->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('service_masters')) {
            Schema::create('service_masters', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('brand_id')->nullable();
                $table->string('name');
                $table->string('title')->nullable();
                $table->text('bio')->nullable();
                $table->string('avatar')->nullable();
                $table->text('specialties')->nullable();
                $table->integer('sort_order')->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        // The two tables that make a tenant BOOKABLE, as opposed to merely
        // listed (template fidelity phase 6). PageContent::bookingMode()
        // asks the exact question ServiceSchedulingService enforces -- an
        // active service, linked to an active master, who has an active
        // schedule row -- so every landing test needs the link table and
        // the schedule table to exist even when it seeds neither; a page
        // with services and no schedules is the common "not yet bookable"
        // case, and sqlite has no table to answer that question against
        // without these. Columns mirror
        // 2026_04_18_100001_create_service_reservation_tables.
        if (!Schema::hasTable('service_master_service')) {
            Schema::create('service_master_service', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('service_master_id');
                $table->unsignedBigInteger('service_id');
                $table->decimal('price_override', 10, 2)->nullable();
                $table->integer('duration_override_minutes')->nullable();
                $table->timestamps();
                $table->unique(['service_master_id', 'service_id']);
            });
        }

        if (!Schema::hasTable('service_master_schedules')) {
            Schema::create('service_master_schedules', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('service_master_id');
                $table->unsignedTinyInteger('day_of_week');
                $table->time('start_time');
                $table->time('end_time');
                $table->boolean('is_active')->default(true);
                $table->timestamps();
                $table->index(['service_master_id', 'day_of_week']);
            });
        }

        if (!Schema::hasTable('review_submissions')) {
            Schema::create('review_submissions', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('form_id')->nullable();
                $table->integer('overall_rating')->nullable();
                $table->text('comment')->nullable();
                $table->string('anonymous_name')->nullable();
                $table->boolean('is_featured')->default(false);
                $table->timestamp('submitted_at')->nullable();
                $table->timestamps();
            });
        }

        // review_forms is what makes a "Leave a review" link on a landing
        // page a real destination rather than a dead one: PageContent reads
        // the org's active form and its embed key, and the templates render
        // the link only when both exist. Columns follow the model's
        // $fillable, as everything else here does.
        if (!Schema::hasTable('review_forms')) {
            Schema::create('review_forms', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('name');
                $table->string('type', 20)->nullable();
                $table->boolean('is_active')->default(true);
                $table->boolean('is_default')->default(false);
                $table->text('config')->nullable();
                $table->string('embed_key', 64)->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('properties')) {
            Schema::create('properties', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('brand_id')->nullable();
                $table->string('name');
                $table->string('email')->nullable();
                $table->string('phone')->nullable();
                $table->string('address')->nullable();
                $table->string('city')->nullable();
                $table->string('country')->nullable();
                $table->string('timezone')->nullable();
                $table->string('currency', 8)->nullable();
                $table->text('settings')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        // chat_widget_configs holds business_hours, the only customer-facing
        // opening hours the platform has. See the corrections at the top.
        if (!Schema::hasTable('chat_widget_configs')) {
            Schema::create('chat_widget_configs', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('brand_id')->nullable();
                // widget_key is what a landing page needs to build a
                // same-origin chat embed; is_active is what tells it whether
                // it may embed one at all.
                $table->string('widget_key', 64)->nullable();
                $table->boolean('is_active')->default(true);
                $table->text('business_hours')->nullable();
                $table->string('timezone')->nullable();
                $table->timestamps();
            });
        }
    }
}

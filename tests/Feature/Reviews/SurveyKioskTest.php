<?php

namespace Tests\Feature\Reviews;

use App\Http\Controllers\Api\V1\Admin\ReviewController;
use App\Models\Organization;
use App\Models\ReviewDevice;
use App\Models\ReviewForm;
use App\Models\ReviewFormQuestion;
use App\Models\ReviewFormStat;
use App\Models\ReviewSubmission;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the 2026-07 survey-platform upgrade to the Reviews module:
 * kiosk devices (assignment resolution + heartbeat + attribution),
 * view/submission counters, per-survey analytics math, and form
 * duplication.
 *
 * Public endpoints are exercised over real HTTP (they're unauthenticated
 * by design); admin endpoints are invoked directly on the controller
 * with a bound org, per the house pattern (full admin-HTTP tests stay
 * blocked on the Postgres test DB).
 */
class SurveyKioskTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpReviewSchema();

        $org = Organization::create(['name' => 'Survey Org', 'slug' => 'survey-' . uniqid()]);
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);
    }

    private function setUpReviewSchema(): void
    {
        if (!Schema::hasTable('review_forms')) {
            Schema::create('review_forms', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name');
                $t->string('type', 20);
                $t->boolean('is_active')->default(true);
                $t->boolean('is_default')->default(false);
                $t->text('config')->nullable();
                $t->string('embed_key', 64)->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('review_form_questions')) {
            Schema::create('review_form_questions', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('form_id');
                $t->unsignedInteger('order')->default(0);
                $t->string('kind', 20);
                $t->string('label');
                $t->text('help_text')->nullable();
                $t->text('options')->nullable();
                $t->boolean('required')->default(false);
                $t->unsignedTinyInteger('weight')->default(1);
                $t->integer('condition_index')->nullable();
                $t->string('condition_operator', 20)->nullable();
                $t->text('condition_value')->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('review_submissions')) {
            Schema::create('review_submissions', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('form_id');
                $t->unsignedBigInteger('invitation_id')->nullable();
                $t->unsignedBigInteger('device_id')->nullable();
                $t->string('channel', 20)->nullable();
                $t->unsignedBigInteger('guest_id')->nullable();
                $t->unsignedBigInteger('loyalty_member_id')->nullable();
                $t->unsignedTinyInteger('overall_rating')->nullable();
                $t->unsignedTinyInteger('nps_score')->nullable();
                $t->text('answers')->nullable();
                $t->text('comment')->nullable();
                $t->boolean('redirected_externally')->default(false);
                $t->string('external_platform', 30)->nullable();
                $t->string('ip', 45)->nullable();
                $t->string('user_agent', 512)->nullable();
                $t->string('anonymous_name')->nullable();
                $t->string('anonymous_email')->nullable();
                $t->timestamp('submitted_at')->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('review_integrations')) {
            Schema::create('review_integrations', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('platform', 30);
                $t->string('display_name')->nullable();
                $t->string('write_review_url', 1024);
                $t->string('place_id')->nullable();
                $t->boolean('is_enabled')->default(true);
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('review_devices')) {
            Schema::create('review_devices', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('form_id')->nullable();
                $t->string('name');
                $t->string('location')->nullable();
                $t->string('device_key', 64);
                $t->boolean('is_active')->default(true);
                $t->timestamp('last_seen_at')->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('review_form_stats')) {
            Schema::create('review_form_stats', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('form_id');
                $t->date('date');
                $t->unsignedInteger('views')->default(0);
                $t->unsignedInteger('submissions')->default(0);
                $t->timestamps();
                $t->unique(['form_id', 'date']);
            });
        }
    }

    private function makeForm(array $overrides = []): ReviewForm
    {
        return ReviewForm::create(array_merge([
            'organization_id' => $this->orgId,
            'name'            => 'Guest experience',
            'type'            => 'custom',
            'is_active'       => true,
            'embed_key'       => Str::random(32),
            'config'          => ['allow_anonymous' => true, 'theme' => ['layout' => 'stepper', 'style' => 'ocean']],
        ], $overrides));
    }

    private function makeDevice(ReviewForm $form, array $overrides = []): ReviewDevice
    {
        return ReviewDevice::create(array_merge([
            'organization_id' => $this->orgId,
            'form_id'         => $form->id,
            'name'            => 'Reception iPad',
            'device_key'      => Str::random(40),
            'is_active'       => true,
        ], $overrides));
    }

    /* ─── kiosk device resolution ──────────────────────────────────── */

    public function test_device_resolve_returns_assignment_and_stamps_heartbeat(): void
    {
        $form = $this->makeForm();
        $device = $this->makeDevice($form);

        $res = $this->getJson("/api/v1/public/reviews/device/{$device->device_key}");

        $res->assertOk()
            ->assertJsonPath('form_id', $form->id)
            ->assertJsonPath('key', $form->embed_key)
            ->assertJsonPath('device.name', 'Reception iPad');
        $this->assertNotNull($device->fresh()->last_seen_at, 'poll must stamp last_seen_at');
        $this->assertStringContainsString((string) $form->id, $res->json('version'));
    }

    public function test_device_without_assignment_reports_unassigned(): void
    {
        $form = $this->makeForm();
        $device = $this->makeDevice($form, ['form_id' => null]);

        $this->getJson("/api/v1/public/reviews/device/{$device->device_key}")
            ->assertOk()
            ->assertJsonPath('form_id', null)
            ->assertJsonPath('version', 'unassigned');
    }

    public function test_inactive_device_404s(): void
    {
        $device = $this->makeDevice($this->makeForm(), ['is_active' => false]);
        $this->getJson("/api/v1/public/reviews/device/{$device->device_key}")->assertNotFound();
    }

    /* ─── attribution + counters ───────────────────────────────────── */

    public function test_kiosk_submission_stamps_device_and_channel(): void
    {
        $form = $this->makeForm();
        $q = ReviewFormQuestion::create([
            'organization_id' => $this->orgId, 'form_id' => $form->id,
            'order' => 0, 'kind' => 'stars', 'label' => 'Rate us',
        ]);
        $device = $this->makeDevice($form);

        $this->postJson("/api/v1/public/reviews/form/{$form->id}?key={$form->embed_key}", [
            'answers'    => [(string) $q->id => 5],
            'device_key' => $device->device_key,
        ])->assertOk();

        $sub = ReviewSubmission::withoutGlobalScopes()->where('form_id', $form->id)->first();
        $this->assertSame($device->id, $sub->device_id);
        $this->assertSame('kiosk', $sub->channel);
    }

    public function test_foreign_org_device_key_is_ignored(): void
    {
        $form = $this->makeForm();
        $otherOrg = Organization::create(['name' => 'Other', 'slug' => 'other-' . uniqid()]);
        // BelongsToOrganization force-stamps the BOUND org on create —
        // bind the other org while creating its device, then switch back.
        app()->instance('current_organization_id', $otherOrg->id);
        $foreign = ReviewDevice::create([
            'form_id' => null,
            'name' => 'Foreign', 'device_key' => Str::random(40), 'is_active' => true,
        ]);
        app()->instance('current_organization_id', $this->orgId);
        $this->assertSame($otherOrg->id, $foreign->organization_id);

        $this->postJson("/api/v1/public/reviews/form/{$form->id}?key={$form->embed_key}", [
            'answers'    => [],
            'device_key' => $foreign->device_key,
        ])->assertOk();

        $sub = ReviewSubmission::withoutGlobalScopes()->where('form_id', $form->id)->first();
        $this->assertNull($sub->device_id, 'cross-org device keys must not attach');
        $this->assertSame('link', $sub->channel);
    }

    public function test_views_and_submissions_bump_daily_counters_and_preview_is_excluded(): void
    {
        $form = $this->makeForm();

        $this->getJson("/api/v1/public/reviews/form/{$form->id}?key={$form->embed_key}")->assertOk();
        $this->getJson("/api/v1/public/reviews/form/{$form->id}?key={$form->embed_key}")->assertOk();
        $this->getJson("/api/v1/public/reviews/form/{$form->id}?key={$form->embed_key}&preview=1")->assertOk();
        $this->postJson("/api/v1/public/reviews/form/{$form->id}?key={$form->embed_key}", ['answers' => []])->assertOk();

        $stat = ReviewFormStat::withoutGlobalScopes()->where('form_id', $form->id)->first();
        $this->assertSame(2, (int) $stat->views, 'preview loads must not count as views');
        $this->assertSame(1, (int) $stat->submissions);
    }

    /* ─── analytics ────────────────────────────────────────────────── */

    public function test_analytics_totals_distribution_and_nps_math(): void
    {
        $form = $this->makeForm();
        $stars = ReviewFormQuestion::create([
            'organization_id' => $this->orgId, 'form_id' => $form->id,
            'order' => 0, 'kind' => 'stars', 'label' => 'Overall',
        ]);
        $nps = ReviewFormQuestion::create([
            'organization_id' => $this->orgId, 'form_id' => $form->id,
            'order' => 1, 'kind' => 'nps', 'label' => 'Recommend us?',
        ]);

        // 1 promoter (10), 1 passive (8), 1 detractor (2) → NPS = 0
        foreach ([[5, 10], [4, 8], [1, 2]] as [$starVal, $npsVal]) {
            ReviewSubmission::create([
                'organization_id' => $this->orgId,
                'form_id'         => $form->id,
                'nps_score'       => $npsVal,
                'overall_rating'  => $starVal,
                'answers'         => [(string) $stars->id => $starVal, (string) $nps->id => $npsVal],
                'channel'         => 'kiosk',
                'submitted_at'    => now(),
            ]);
        }

        $res = app(ReviewController::class)->formAnalytics(new Request(['days' => 30]), $form->id);
        $data = $res->getData(true);

        $this->assertSame(0, $data['totals']['nps']);
        $this->assertEqualsWithDelta(3.33, $data['totals']['avg_rating'], 0.01);

        $starRow = collect($data['per_question'])->firstWhere('id', $stars->id);
        $this->assertSame(3, $starRow['answered']);
        $this->assertSame(1, $starRow['distribution']['5']);
        $this->assertSame(1, $starRow['distribution']['1']);
        $this->assertEqualsWithDelta(3.33, $starRow['average'], 0.01);

        $this->assertSame(3, $data['channels']['kiosk']);
    }

    /* ─── duplication ──────────────────────────────────────────────── */

    public function test_duplicate_clones_questions_with_fresh_key_and_inactive(): void
    {
        $form = $this->makeForm();
        ReviewFormQuestion::create([
            'organization_id' => $this->orgId, 'form_id' => $form->id,
            'order' => 0, 'kind' => 'emoji', 'label' => 'Mood?',
            'options' => ['emojis' => ['😞', '😐', '😍']],
        ]);
        ReviewFormQuestion::create([
            'organization_id' => $this->orgId, 'form_id' => $form->id,
            'order' => 1, 'kind' => 'textarea', 'label' => 'Why?',
            'condition_index' => 0, 'condition_operator' => 'eq', 'condition_value' => '😞',
        ]);

        $res = app(ReviewController::class)->duplicateForm($form->id);
        $copy = $res->getData(true)['form'];

        $this->assertSame($form->name . ' (copy)', $copy['name']);
        $this->assertFalse((bool) $copy['is_active']);
        $this->assertNotSame($form->embed_key, $copy['embed_key']);
        $this->assertCount(2, $copy['questions']);
        $this->assertSame('eq', $copy['questions'][1]['condition_operator']);
    }

    /* ─── kiosk QR ─────────────────────────────────────────────────── */

    public function test_device_qr_returns_kiosk_url_and_image_data_uri(): void
    {
        $device = $this->makeDevice($this->makeForm());

        $res = app(ReviewController::class)->deviceQr($device->id, app(\App\Services\QrCodeService::class));
        $data = $res->getData(true);

        $this->assertStringContainsString('/k/' . $device->device_key, $data['url']);
        $this->assertStringStartsWith('data:image/', $data['qr']);
    }

    /* ─── stat bump primitive ──────────────────────────────────────── */

    public function test_stat_bump_upserts_and_increments(): void
    {
        $form = $this->makeForm();
        ReviewFormStat::bump($this->orgId, $form->id, 'views');
        ReviewFormStat::bump($this->orgId, $form->id, 'views');
        ReviewFormStat::bump($this->orgId, $form->id, 'submissions');

        $row = ReviewFormStat::withoutGlobalScopes()->where('form_id', $form->id)->first();
        $this->assertSame(2, (int) $row->views);
        $this->assertSame(1, (int) $row->submissions);
    }
}

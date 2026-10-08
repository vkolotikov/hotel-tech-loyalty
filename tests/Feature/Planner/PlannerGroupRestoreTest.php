<?php

namespace Tests\Feature\Planner;

use App\Models\CrmSetting;
use App\Models\PlannerTask;
use App\Models\Staff;
use App\Services\PlannerPresetService;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * An industry switch used to REPLACE the planner's task types (crm_settings
 * planner_groups) with the new industry's five. FDS Cards lost its own types,
 * icons and colours on 2026-10-07, and every task tied to them vanished from
 * the drawer — the tasks themselves were intact, still naming their types.
 *
 * Two contracts:
 *   1. apply() keeps the organisation's own types and only adds the preset's
 *      missing ones.
 *   2. Types still named by tasks, the task list, employee preferences or
 *      staff skills, but absent from the list, are found and restored.
 */
class PlannerGroupRestoreTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private PlannerPresetService $service;
    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPlannerPresetSchema();

        if (!Schema::hasTable('planner_tasks')) {
            Schema::create('planner_tasks', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('title')->nullable();
                $table->string('task_group')->nullable();
                $table->string('task_category')->nullable();
                $table->boolean('completed')->default(false);
                $table->string('status')->nullable();
                $table->date('task_date')->nullable();
                $table->timestamp('completed_at')->nullable();
                $table->string('pool_horizon')->nullable();
                $table->date('pool_due_date')->nullable();
                $table->timestamps();
            });
        }
        if (!Schema::hasTable('staff')) {
            Schema::create('staff', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('user_id')->nullable();
                $table->string('role')->nullable();
                $table->text('planner_skills')->nullable();
                $table->timestamps();
            });
        }

        $this->orgId = OrganizationFactory::new()->create()->id;
        app()->instance('current_organization_id', $this->orgId);
        $this->service = app(PlannerPresetService::class);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    /** Stored the way Settings → Planner saves it: JSON text inside the JSON column. */
    private function storeGroups(array $groups): void
    {
        CrmSetting::updateOrCreate(['key' => 'planner_groups'], ['value' => json_encode($groups)]);
    }

    private function storedGroups(): array
    {
        $value = CrmSetting::where('key', 'planner_groups')->first()->value;

        return is_string($value) ? json_decode($value, true) : $value;
    }

    private function names(): array
    {
        return array_map(fn ($g) => is_array($g) ? $g['name'] : $g, $this->storedGroups());
    }

    public function test_an_industry_switch_keeps_the_organisations_own_types(): void
    {
        $this->storeGroups([
            ['name' => 'Card Production', 'icon' => 'package', 'color' => '#f59e0b'],
            ['name' => 'Sales', 'icon' => 'phone', 'color' => '#06b6d4'],
        ]);

        $this->service->apply('services');

        $this->assertSame(
            ['Card Production', 'Sales', 'Projects', 'Design & Development', 'Production', 'Admin'],
            $this->names(),
            'Own types first, untouched; the preset adds only the ones missing (Sales is not doubled).',
        );
        $this->assertSame(['name' => 'Card Production', 'icon' => 'package', 'color' => '#f59e0b'], $this->storedGroups()[0]);
    }

    public function test_types_still_named_elsewhere_are_reported_missing(): void
    {
        $this->storeGroups(['Sales', 'Projects']);
        CrmSetting::create(['key' => 'planner_channels', 'value' => json_encode([
            ['key' => 'engraving', 'label' => 'Engraving', 'groups' => ['Card Production']],
            ['key' => 'call', 'label' => 'Call', 'groups' => []],
        ])]);
        CrmSetting::create(['key' => 'planner_employee_prefs', 'value' => json_encode([
            'Anna' => ['groups' => ['Design Studio'], 'tasks' => []],
        ])]);
        Staff::create(['organization_id' => $this->orgId, 'planner_skills' => ['Card Production', 'Packaging']]);
        foreach (['Packaging', 'sales', 'Card Production', '', null] as $group) {
            PlannerTask::create(['organization_id' => $this->orgId, 'title' => 'T', 'task_group' => $group]);
        }

        $this->assertSame(['Card Production', 'Design Studio', 'Packaging'], $this->service->missingGroups());
    }

    public function test_restore_puts_missing_types_first_and_ignores_anything_not_missing(): void
    {
        $this->storeGroups([['name' => 'Projects', 'icon' => 'briefcase', 'color' => '#a855f7'], 'Admin']);
        PlannerTask::create(['organization_id' => $this->orgId, 'title' => 'T', 'task_group' => 'Card Production']);
        PlannerTask::create(['organization_id' => $this->orgId, 'title' => 'T', 'task_group' => 'Packaging']);

        $restored = $this->service->restoreGroups(['Packaging', 'Admin', 'Made up']);

        $this->assertSame(['Packaging'], $restored);
        $this->assertSame(['Packaging', 'Projects', 'Admin'], $this->names());
        $this->assertSame(['name' => 'Projects', 'icon' => 'briefcase', 'color' => '#a855f7'], $this->storedGroups()[1]);
        $this->assertSame(['Card Production'], $this->service->missingGroups());
    }

    public function test_restore_without_a_choice_brings_back_every_missing_type(): void
    {
        $this->storeGroups(['Admin']);
        PlannerTask::create(['organization_id' => $this->orgId, 'title' => 'T', 'task_group' => 'Card Production']);
        PlannerTask::create(['organization_id' => $this->orgId, 'title' => 'T', 'task_group' => 'Packaging']);

        $this->service->restoreGroups(null);

        $this->assertSame(['Card Production', 'Packaging', 'Admin'], $this->names());
        $this->assertSame([], $this->service->missingGroups());
    }

    public function test_nothing_is_missing_on_a_fresh_organisation(): void
    {
        $this->assertSame([], $this->service->missingGroups());
        $this->assertSame([], $this->service->restoreGroups(null));
    }
}

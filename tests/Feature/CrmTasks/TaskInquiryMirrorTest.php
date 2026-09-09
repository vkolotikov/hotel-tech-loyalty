<?php

namespace Tests\Feature\CrmTasks;

use App\Http\Controllers\Api\V1\Admin\TaskController;
use App\Models\Activity;
use App\Models\CustomField;
use App\Models\Inquiry;
use App\Models\Task;
use App\Models\User;
use Database\Factories\OrganizationFactory;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class TaskInquiryMirrorTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private User $user;

    private Inquiry $inquiry;

    private TaskController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmPresetSchema();

        Schema::table('inquiries', function ($table) {
            $table->unsignedBigInteger('guest_id')->nullable();
            $table->string('next_task_type', 50)->nullable();
            $table->date('next_task_due')->nullable();
            $table->text('next_task_notes')->nullable();
            $table->boolean('next_task_completed')->default(false);
        });

        // SQLite ignores VARCHAR limits. Enforce the production varchar(50)
        // boundary so the original long-title mirror fails in this fixture.
        DB::unprepared("CREATE TRIGGER inquiry_task_title_length BEFORE UPDATE ON inquiries
            WHEN length(NEW.next_task_type) > 50
            BEGIN SELECT RAISE(ABORT, 'next_task_type exceeds 50 characters'); END");

        Schema::create('tasks', function ($table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('brand_id')->nullable();
            $table->unsignedBigInteger('inquiry_id')->nullable();
            $table->unsignedBigInteger('guest_id')->nullable();
            $table->unsignedBigInteger('corporate_account_id')->nullable();
            $table->string('type', 32)->default('follow_up');
            $table->string('title', 200);
            $table->text('description')->nullable();
            $table->timestamp('due_at')->nullable();
            $table->unsignedBigInteger('assigned_to')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->string('outcome', 60)->nullable();
            $table->json('custom_data')->nullable();
            $table->timestamps();
        });

        Schema::create('activities', function ($table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('brand_id')->nullable();
            $table->unsignedBigInteger('inquiry_id')->nullable();
            $table->string('type', 32);
            $table->string('subject', 200)->nullable();
            $table->text('body')->nullable();
            $table->json('metadata')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamp('occurred_at')->nullable();
            $table->timestamps();
        });

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);
        $this->user = User::create([
            'organization_id' => $org->id,
            'name' => 'Task owner',
            'email' => 'task-owner@example.test',
            'password' => 'test-only-password',
        ]);
        $this->inquiry = Inquiry::create(['status' => 'New', 'brand_id' => 11]);
        $this->controller = app(TaskController::class);
    }

    protected function tearDown(): void
    {
        app()->forgetInstance('current_organization_id');
        app()->forgetInstance('current_brand_id');
        parent::tearDown();
    }

    private function request(array $data): Request
    {
        $request = Request::create('/api/v1/admin/tasks', 'POST', $data);
        $request->setUserResolver(fn () => $this->user);

        return $request;
    }

    private function createTask(array $data = []): Task
    {
        $response = $this->controller->store($this->request(array_merge([
            'inquiry_id' => $this->inquiry->id,
            'type' => 'email',
            'title' => 'Send follow-up email',
        ], $data)));
        $this->assertSame(201, $response->getStatusCode());

        return Task::findOrFail($response->getData()->id);
    }

    public static function titles(): array
    {
        return [
            'short title' => ['Send follow-up email'],
            '50 characters' => [str_repeat('a', 50)],
            '51 characters' => [str_repeat('b', 51)],
            '200 characters' => [str_repeat('c', 200)],
            '200 Unicode characters' => [str_repeat('📨', 200)],
        ];
    }

    #[DataProvider('titles')]
    public function test_creation_preserves_full_task_data_and_bounds_only_the_legacy_display_title(string $title): void
    {
        CustomField::create(['entity' => 'task', 'key' => 'reference', 'label' => 'Reference', 'type' => 'text', 'is_active' => true]);
        $description = str_repeat('Detailed customer instructions. ', 100);
        $task = $this->createTask([
            'title' => $title,
            'description' => $description,
            'due_at' => '2026-09-15T10:30:00+00:00',
            'custom_data' => ['reference' => 'Full reference preserved'],
        ]);

        $this->assertSame($title, $task->title);
        $this->assertSame($description, $task->description);
        $this->assertSame('email', $task->type);
        $this->assertSame($this->user->id, $task->assigned_to);
        $this->assertSame($this->user->id, $task->created_by);
        $this->assertSame($this->user->organization_id, $task->organization_id);
        $this->assertSame('2026-09-15 10:30:00', $task->due_at->format('Y-m-d H:i:s'));
        $this->assertSame(['reference' => 'Full reference preserved'], $task->custom_data);

        $mirror = $this->inquiry->fresh();
        $this->assertLessThanOrEqual(50, mb_strlen($mirror->next_task_type));
        $this->assertSame('2026-09-15', $mirror->next_task_due->toDateString());
        $this->assertFalse($mirror->next_task_completed);
        if (mb_strlen($title) <= 50) {
            $this->assertSame($title, $mirror->next_task_type);
            $this->assertSame($description, $mirror->next_task_notes);
        } else {
            $this->assertStringEndsWith('…', $mirror->next_task_type);
            $this->assertSame($title."\n\n".$description, $mirror->next_task_notes);
        }
    }

    public function test_long_title_without_description_is_preserved_in_the_legacy_notes(): void
    {
        $title = str_repeat('Follow up with the customer. ', 3);
        $task = $this->createTask(['title' => $title]);

        $this->assertSame($title, $task->title);
        $this->assertNull($task->description);
        $this->assertSame($title, $this->inquiry->fresh()->next_task_notes);
    }

    public function test_a_standalone_long_task_does_not_change_any_inquiry(): void
    {
        $before = DB::table('inquiries')->get()->toArray();
        $title = str_repeat('s', 200);
        $task = $this->createTask(['inquiry_id' => null, 'title' => $title, 'description' => 'Standalone reminder']);

        $this->assertSame($title, $task->title);
        $this->assertSame('Standalone reminder', $task->description);
        $this->assertNull($task->inquiry_id);
        $this->assertEquals($before, DB::table('inquiries')->get()->toArray());
    }

    public static function outcomeCharacters(): array
    {
        return [['a'], ['📨']];
    }

    #[DataProvider('outcomeCharacters')]
    public function test_completion_accepts_and_preserves_a_60_character_outcome(string $character): void
    {
        $task = $this->createTask();
        $outcome = str_repeat($character, 60);

        $response = $this->controller->complete($this->request(['outcome' => $outcome]), $task);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame($outcome, $task->fresh()->outcome);
        $this->assertNotNull($task->fresh()->completed_at);
        $this->assertSame($outcome, Activity::sole()->body);
        $this->assertNull($this->inquiry->fresh()->next_task_type);
    }

    #[DataProvider('outcomeCharacters')]
    public function test_completion_rejects_a_61_character_outcome_before_any_mutation(string $character): void
    {
        $task = $this->createTask();
        $beforeTasks = DB::table('tasks')->get()->toArray();
        $beforeInquiries = DB::table('inquiries')->get()->toArray();
        $beforeActivities = DB::table('activities')->get()->toArray();
        DB::enableQueryLog();
        DB::flushQueryLog();

        try {
            $this->controller->complete($this->request(['outcome' => str_repeat($character, 61)]), $task);
            $this->fail('Expected outcome validation to reject more than 60 characters.');
        } catch (ValidationException $exception) {
            $this->assertSame(422, $exception->status);
            $this->assertArrayHasKey('outcome', $exception->errors());
            $this->assertSame(['60'], $exception->validator->failed()['outcome']['Max']);
        } finally {
            $queries = DB::getQueryLog();
            DB::disableQueryLog();
        }

        $writes = array_filter($queries, fn ($query) => preg_match('/^\s*(insert|update|delete)\b/i', $query['query']));
        $this->assertSame([], $writes, 'Invalid input must be rejected before a database write is attempted.');
        $this->assertEquals($beforeTasks, DB::table('tasks')->get()->toArray());
        $this->assertEquals($beforeInquiries, DB::table('inquiries')->get()->toArray());
        $this->assertEquals($beforeActivities, DB::table('activities')->get()->toArray());
    }

    public function test_shared_sync_preserves_due_order_and_tracks_update_complete_reopen_and_delete(): void
    {
        $undated = $this->createTask(['title' => 'Undated reminder']);
        $later = $this->createTask(['title' => 'Later task', 'due_at' => '2026-09-20']);
        $longTitle = str_repeat('Send a detailed follow-up email. ', 4);
        $earlier = $this->createTask(['title' => $longTitle, 'due_at' => '2026-09-10']);
        $this->assertSame($longTitle, $this->inquiry->fresh()->next_task_notes);

        $this->controller->complete($this->request(['outcome' => 'Done']), $earlier);
        $this->controller->complete($this->request(['outcome' => 'Done']), $earlier);
        $this->assertSame('Later task', $this->inquiry->fresh()->next_task_type);
        $this->assertSame($longTitle, Activity::sole()->subject);

        $this->controller->reopen($earlier);
        $this->assertSame($longTitle, $this->inquiry->fresh()->next_task_notes);

        $newTitle = str_repeat('Rescheduled follow-up. ', 4);
        $this->controller->update($this->request(['title' => $newTitle, 'due_at' => '2026-09-25']), $earlier);
        $this->assertSame($newTitle, $earlier->fresh()->title);
        $this->assertSame('Later task', $this->inquiry->fresh()->next_task_type);

        $this->controller->destroy($later);
        $this->assertSame($newTitle, $this->inquiry->fresh()->next_task_notes);
        $this->controller->destroy($earlier);
        $this->assertSame('Undated reminder', $this->inquiry->fresh()->next_task_type);
        $this->controller->destroy($undated);
        $mirror = $this->inquiry->fresh();
        $this->assertNull($mirror->next_task_type);
        $this->assertNull($mirror->next_task_due);
        $this->assertNull($mirror->next_task_notes);
        $this->assertFalse($mirror->next_task_completed);
    }

    public function test_sync_retains_organization_isolation_and_existing_cross_brand_inquiry_behavior(): void
    {
        $otherOrg = OrganizationFactory::new()->create();
        $foreignInquiry = Inquiry::withoutEvents(fn () => Inquiry::create([
            'organization_id' => $otherOrg->id, 'status' => 'New', 'next_task_type' => 'Other tenant task',
        ]));
        $foreignTask = Task::withoutEvents(fn () => Task::create([
            'organization_id' => $otherOrg->id, 'inquiry_id' => $this->inquiry->id,
            'title' => 'Foreign task must not be mirrored', 'type' => 'custom', 'due_at' => '2020-01-01',
        ]));
        $unrelated = Inquiry::create(['status' => 'New', 'next_task_type' => 'Unrelated task']);
        app()->instance('current_brand_id', 22);

        $this->createTask(['title' => 'Own organization task', 'due_at' => '2026-09-10']);
        $this->assertSame('Own organization task', $this->inquiry->fresh()->next_task_type);
        $this->assertSame('Other tenant task', $foreignInquiry->fresh()->next_task_type);
        $this->assertSame('Foreign task must not be mirrored', $foreignTask->fresh()->title);
        $this->assertSame('Unrelated task', $unrelated->fresh()->next_task_type);
    }

    public static function mutations(): array
    {
        return [['create'], ['update'], ['complete'], ['reopen'], ['delete']];
    }

    #[DataProvider('mutations')]
    public function test_task_and_mirror_mutations_roll_back_together_if_sync_fails(string $action): void
    {
        $task = $this->createTask();
        if ($action === 'reopen') {
            $this->controller->complete($this->request([]), $task);
        }
        $beforeTasks = DB::table('tasks')->orderBy('id')->get()->toArray();
        $beforeInquiries = DB::table('inquiries')->orderBy('id')->get()->toArray();
        $beforeActivities = DB::table('activities')->orderBy('id')->get()->toArray();
        DB::unprepared("CREATE TRIGGER reject_inquiry_mirror BEFORE UPDATE ON inquiries
            BEGIN SELECT RAISE(ABORT, 'Simulated mirror write failure'); END");

        try {
            match ($action) {
                'create' => $this->controller->store($this->request(['title' => 'Another task', 'inquiry_id' => $this->inquiry->id, 'due_at' => '2020-01-01'])),
                'update' => $this->controller->update($this->request(['title' => 'Updated task']), $task),
                'complete' => $this->controller->complete($this->request(['outcome' => 'Done']), $task),
                'reopen' => $this->controller->reopen($task),
                'delete' => $this->controller->destroy($task),
            };
            $this->fail('Expected a failed mirror write.');
        } catch (QueryException $exception) {
            $this->assertStringContainsString('Simulated mirror write failure', $exception->getMessage());
        }

        $this->assertEquals($beforeTasks, DB::table('tasks')->orderBy('id')->get()->toArray());
        $this->assertEquals($beforeInquiries, DB::table('inquiries')->orderBy('id')->get()->toArray());
        $this->assertEquals($beforeActivities, DB::table('activities')->orderBy('id')->get()->toArray());
    }
}

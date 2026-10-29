<?php

namespace Tests\Feature\Admin;

use App\Http\Controllers\Api\V1\Admin\BookingExtraController;
use App\Http\Controllers\Api\V1\Admin\ServiceExtraController;
use App\Http\Controllers\Api\V1\Admin\VoiceAgentController;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Found by running the suites on PostgreSQL (release 6, part T): the full admin's forms send an emptied field as null
 * (ConvertEmptyStringsToNull), the validation allowed it, and the controller wrote null into a NOT NULL column — a 500
 * on production's PostgreSQL. Now an emptied field keeps the stored value (a new row: the column's default). The
 * tables here are built as production has them (NOT NULL with defaults) when the run has none, so the test means the
 * same on SQLite and PostgreSQL.
 */
class EmptyRequiredFieldsTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    private Organization $org;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpKnowledgeSchema(); // brands: the extras belong to a brand (BelongsToBrand)
        $this->setUpBookingRefundSchema(); // hotel_settings: new extras default to the venue currency
        foreach (['booking_extras' => 'per_stay', 'service_extras' => 'per_booking'] as $table => $priceType) {
            if (!Schema::hasTable($table)) {
                Schema::create($table, function (Blueprint $t) use ($table, $priceType) {
                    $t->id();
                    $t->unsignedBigInteger('organization_id');
                    $t->unsignedBigInteger('brand_id')->nullable();
                    $t->string('name');
                    $t->text('description')->nullable();
                    $t->decimal('price', 10, 2)->default(0);
                    $t->string('price_type')->default($priceType);
                    $t->unsignedSmallInteger('lead_time_hours')->default(0);
                    if ($table === 'service_extras') {
                        $t->integer('duration_minutes')->default(0);
                    }
                    $t->string('currency', 10)->default('EUR');
                    $t->string('image')->nullable();
                    $t->string('icon')->nullable();
                    $t->string('category')->nullable();
                    $t->integer('sort_order')->default(0);
                    $t->boolean('is_active')->default(true);
                    $t->timestamps();
                });
            }
        }
        if (!Schema::hasTable('voice_agent_configs')) {
            Schema::create('voice_agent_configs', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('organization_id')->unique();
                $t->boolean('is_active')->default(false);
                $t->string('voice', 30)->default('alloy');
                $t->string('tts_model', 60)->default('gpt-4o-mini-tts');
                $t->boolean('realtime_enabled')->default(false);
                $t->string('realtime_model', 60)->default('gpt-4o-realtime-preview');
                $t->text('voice_instructions')->nullable();
                $t->string('language', 10)->default('en');
                $t->decimal('temperature', 3, 2)->default(0.80);
                $t->timestamps();
            });
        }
        $this->org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid()]);
        app()->instance('current_organization_id', $this->org->id);
        $this->user = User::create(['name' => 'Staff', 'email' => 'staff_' . uniqid() . '@example.test', 'password' => bcrypt('secret-pass-1'), 'user_type' => 'staff', 'organization_id' => $this->org->id]);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function request(array $body): Request
    {
        $request = Request::create('/', 'POST', $body);
        $request->setUserResolver(fn () => $this->user);

        return $request;
    }

    public function test_an_emptied_extra_field_keeps_its_value(): void
    {
        foreach ([[BookingExtraController::class, 'booking_extras'], [ServiceExtraController::class, 'service_extras']] as [$controller, $table]) {
            $created = app($controller)->store($this->request(['name' => 'Breakfast', 'price' => 12.5, 'lead_time_hours' => 24]));
            $this->assertSame(201, $created->getStatusCode(), $table);
            $id = (int) $created->getData(true)['id'];

            $res = app($controller)->update($this->request(['lead_time_hours' => null, 'price' => null, 'sort_order' => null, 'description' => null]), $id);

            $this->assertSame(200, $res->getStatusCode(), $table);
            $row = DB::table($table)->where('id', $id)->first();
            $this->assertSame(24, (int) $row->lead_time_hours, "{$table}: an emptied lead time keeps the stored one");
            $this->assertEquals(12.5, (float) $row->price, "{$table}: an emptied price keeps the stored one");
        }
    }

    public function test_a_new_extra_without_a_lead_time_gets_none(): void
    {
        $created = app(BookingExtraController::class)->store($this->request(['name' => 'Late check-out', 'lead_time_hours' => null, 'price' => null]));

        $this->assertSame(201, $created->getStatusCode());
        $row = DB::table('booking_extras')->where('id', $created->getData(true)['id'])->first();
        $this->assertSame(0, (int) $row->lead_time_hours, 'the column default: no notice needed');
        $this->assertEquals(0.0, (float) $row->price);
    }

    public function test_an_emptied_voice_setting_keeps_the_stored_one(): void
    {
        $controller = app(VoiceAgentController::class);
        $this->assertSame(200, $controller->update($this->request(['realtime_model' => 'gpt-realtime', 'voice_instructions' => 'Be brief.']))->getStatusCode());

        $res = $controller->update($this->request(['realtime_model' => null, 'voice' => null, 'voice_instructions' => null]));

        $this->assertSame(200, $res->getStatusCode());
        $row = DB::table('voice_agent_configs')->where('organization_id', $this->org->id)->first();
        $this->assertSame('gpt-realtime', $row->realtime_model);
        $this->assertNull($row->voice_instructions, 'the instructions, which may be empty, are emptied');
    }
}

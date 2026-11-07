<?php

namespace Tests\Feature\CrmWorkspace;

use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * The full admin's contact endpoints the CRM works on (2026-11-08): tag names unique per organisation and tags only
 * this organisation's; a field sent as null is cleared (an empty string still ignored); the sorts the contact list
 * offers; delete-impact says what the delete really does; guest-merge refusals carry codes.
 */
class ContactsTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        $this->setUpCustomFieldsSchema();
        $this->contactTables();
    }

    private function contactTables(): void
    {
        foreach ([
            'mobile' => fn ($t) => $t->string('mobile')->nullable(),
            'position_title' => fn ($t) => $t->string('position_title')->nullable(),
            'city' => fn ($t) => $t->string('city')->nullable(),
            'email_key' => fn ($t) => $t->string('email_key')->nullable(),
            'phone_key' => fn ($t) => $t->string('phone_key')->nullable(),
            'vip_level' => fn ($t) => $t->string('vip_level')->default('Standard'),
            'total_revenue' => fn ($t) => $t->decimal('total_revenue', 12, 2)->default(0),
            'total_stays' => fn ($t) => $t->integer('total_stays')->default(0),
            'last_stay_date' => fn ($t) => $t->date('last_stay_date')->nullable(),
            'last_activity_at' => fn ($t) => $t->timestamp('last_activity_at')->nullable(),
        ] as $column => $add) {
            if (!Schema::hasColumn('guests', $column)) {
                Schema::table('guests', $add);
            }
        }
        if (!Schema::hasTable('guest_tags')) {
            Schema::create('guest_tags', fn ($t) => [$t->bigIncrements('id'), $t->unsignedBigInteger('organization_id')->nullable(), $t->string('name', 80), $t->string('color', 7)->nullable(), $t->timestamps()]);
        }
        if (!Schema::hasTable('guest_tag_links')) {
            Schema::create('guest_tag_links', fn ($t) => [$t->unsignedBigInteger('guest_id'), $t->unsignedBigInteger('tag_id'), $t->timestamp('created_at')->nullable()]);
        }
        if (!Schema::hasTable('guest_activities')) {
            Schema::create('guest_activities', fn ($t) => [$t->bigIncrements('id'), $t->unsignedBigInteger('guest_id'), $t->string('type', 50), $t->text('description'), $t->timestamps()]);
        }
        if (!Schema::hasTable('properties')) {
            Schema::create('properties', fn ($t) => [$t->bigIncrements('id'), $t->unsignedBigInteger('organization_id')->nullable(), $t->string('name'), $t->string('code')->nullable(), $t->timestamps()]);
        }
        if (!Schema::hasTable('reservations')) {
            Schema::create('reservations', fn ($t) => [$t->bigIncrements('id'), $t->unsignedBigInteger('organization_id')->nullable(), $t->unsignedBigInteger('guest_id'), $t->unsignedBigInteger('inquiry_id')->nullable(), $t->unsignedBigInteger('property_id'), $t->date('check_in'), $t->date('check_out'), $t->string('status', 32)->nullable(), $t->timestamps()]);
        }
        if (!Schema::hasTable('venues')) {
            Schema::create('venues', fn ($t) => [$t->bigIncrements('id'), $t->unsignedBigInteger('organization_id')->nullable(), $t->unsignedBigInteger('property_id'), $t->string('name'), $t->string('venue_type'), $t->timestamps()]);
        }
        if (!Schema::hasTable('venue_bookings')) {
            Schema::create('venue_bookings', fn ($t) => [$t->bigIncrements('id'), $t->unsignedBigInteger('organization_id')->nullable(), $t->unsignedBigInteger('venue_id'), $t->unsignedBigInteger('guest_id')->nullable(), $t->date('booking_date'), $t->time('start_time'), $t->time('end_time'), $t->timestamps()]);
        }
    }

    private function guest(array $attributes = []): int
    {
        return DB::table('guests')->insertGetId($attributes + ['organization_id' => $this->org->id, 'full_name' => 'Ada Lovelace', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function otherOrganisation(): Organization
    {
        $prior = app('current_organization_id');
        app()->forgetInstance('current_organization_id');
        $other = Organization::create(['name' => 'Elsewhere', 'slug' => 'else-' . uniqid('', true)]);
        app()->instance('current_organization_id', $prior);

        return $other;
    }

    public function test_a_tag_name_is_unique_within_the_organisation_and_tags_are_its_own(): void
    {
        $other = $this->otherOrganisation();
        $theirs = DB::table('guest_tags')->insertGetId(['organization_id' => $other->id, 'name' => 'VIP-' . $this->org->id, 'created_at' => now(), 'updated_at' => now()]);

        // Another organisation's "VIP" is no clash; the organisation's own is.
        $mine = $this->asStaffMember()->postJson($this->adminApi('guests/tags'), ['name' => 'VIP-' . $this->org->id])->assertCreated()->json('id');
        $this->asStaffMember()->postJson($this->adminApi('guests/tags'), ['name' => 'VIP-' . $this->org->id])->assertStatus(422)->assertJsonValidationErrors('name');

        $guest = $this->guest();
        $this->asStaffMember()->postJson($this->adminApi("guests/{$guest}/tags"), ['tag_ids' => [$theirs]])->assertStatus(422)->assertJsonValidationErrors('tag_ids.0');
        $this->asStaffMember()->postJson($this->adminApi("guests/{$guest}/tags"), ['tag_ids' => [$mine]])->assertOk();
        $this->assertSame([$mine], DB::table('guest_tag_links')->where('guest_id', $guest)->pluck('tag_id')->map(fn ($id) => (int) $id)->all());
    }

    public function test_a_field_sent_as_null_is_cleared_and_an_empty_string_is_ignored(): void
    {
        $guest = $this->guest(['phone' => '+371 2612 3456', 'phone_key' => '37126123456', 'company' => 'Analytical Engines', 'notes' => 'Prefers mornings', 'vip_level' => 'Gold']);

        $this->asStaffMember()->putJson($this->adminApi("guests/{$guest}"), ['phone' => null, 'company' => '', 'vip_level' => null])->assertOk();

        $row = DB::table('guests')->where('id', $guest)->first();
        $this->assertSame([null, null], [$row->phone, $row->phone_key], 'null clears the field and its key');
        $this->assertSame('Analytical Engines', $row->company, 'an empty string is ignored, as the full admin expects');
        $this->assertSame('Gold', $row->vip_level, 'a column that may not be empty is kept');
        $this->assertSame('Prefers mornings', $row->notes, 'a field not sent is kept');
    }

    public function test_the_contact_list_sorts_by_name_activity_and_revenue(): void
    {
        $zed = $this->guest(['full_name' => 'Zed', 'total_revenue' => 50, 'total_stays' => 1, 'last_activity_at' => now()->subDays(5)]);
        $amy = $this->guest(['full_name' => 'Amy', 'total_revenue' => 900, 'total_stays' => 4, 'last_activity_at' => now()->subDay()]);

        $ids = fn (string $query) => collect($this->asStaffMember()->getJson($this->adminApi("guests?{$query}"))->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$amy, $zed], $ids('sort=full_name&dir=asc'));
        $this->assertSame([$amy, $zed], $ids('sort=total_revenue&dir=desc'));
        $this->assertSame([$amy, $zed], $ids('sort=last_activity_at&dir=desc'));
        $this->assertSame([$amy, $zed], $ids('sort=stays_count&dir=desc'), 'the old name reads the column that holds it');
    }

    public function test_delete_impact_says_what_the_delete_really_does(): void
    {
        $guest = $this->guest(['member_id' => null]);
        $lead = $this->leadOf($guest);
        DB::table('tasks')->insert(['organization_id' => $this->org->id, 'inquiry_id' => $lead, 'title' => 'Call back', 'created_at' => now(), 'updated_at' => now()]);
        $this->chat(['inquiry_id' => $lead], [['visitor', 'Hello', 5]]);
        $property = DB::table('properties')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Main', 'code' => 'MAIN', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('reservations')->insert(['organization_id' => $this->org->id, 'guest_id' => $guest, 'property_id' => $property, 'check_in' => '2026-12-01', 'check_out' => '2026-12-03', 'status' => 'Confirmed', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('guest_activities')->insert(['guest_id' => $guest, 'type' => 'note', 'description' => 'Met at the fair', 'created_at' => now(), 'updated_at' => now()]);

        $impact = $this->asStaffMember()->getJson($this->adminApi("guests/{$guest}/delete-impact"))->assertOk()->json();
        $this->assertSame([1, 1, 1, 1, 1, false], [$impact['inquiries'], $impact['reservations'], $impact['activities'], $impact['lead_tasks'], $impact['chats'], $impact['blocked']]);
        $this->assertSame(['inquiries', 'reservations', 'activities', 'lead_tasks'], $impact['removes']);
        $warnings = implode(' ', $impact['warnings']);
        $this->assertStringContainsString('deletes', $warnings);
        $this->assertStringNotContainsString('detach', $warnings, 'reservations are deleted, never detached');

        $venue = DB::table('venues')->insertGetId(['organization_id' => $this->org->id, 'property_id' => $property, 'name' => 'Hall', 'venue_type' => 'hall', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('venue_bookings')->insert(['organization_id' => $this->org->id, 'venue_id' => $venue, 'guest_id' => $guest, 'booking_date' => '2026-12-01', 'start_time' => '10:00', 'end_time' => '12:00', 'created_at' => now(), 'updated_at' => now()]);
        $this->asStaffMember()->getJson($this->adminApi("guests/{$guest}/delete-impact"))->assertOk()->assertJsonPath('blocked', true)->assertJsonPath('venue_bookings', 1);
    }

    public function test_merge_refusals_carry_codes(): void
    {
        // The service's refusal names its rule (no database needed to reach it: two different members).
        try {
            app(\App\Services\GuestMergeService::class)->merge(
                (new \App\Models\Guest())->forceFill(['id' => 1, 'organization_id' => $this->org->id, 'member_id' => 9001]),
                (new \App\Models\Guest())->forceFill(['id' => 2, 'organization_id' => $this->org->id, 'member_id' => 9002]),
            );
            $this->fail('two members refuse');
        } catch (\App\Exceptions\GuestMergeRefused $e) {
            $this->assertSame('different_members', $e->errorCode);
        }

        // The endpoint answers the refusal's code beside its sentence.
        $a = $this->guest();
        $b = $this->guest(['full_name' => 'Ada L.']);
        $this->mock(\App\Services\GuestMergeService::class)->shouldReceive('merge')->once()
            ->andThrow(new \App\Exceptions\GuestMergeRefused('different_members', 'Both guests are linked to different loyalty members.'));
        $this->asManager()->postJson($this->adminApi('guests/merge'), ['winner_id' => $a, 'loser_id' => $b])
            ->assertStatus(422)->assertJsonPath('error', 'different_members')->assertJsonPath('message', 'Both guests are linked to different loyalty members.');

        $other = $this->otherOrganisation();
        $theirs = DB::table('guests')->insertGetId(['organization_id' => $other->id, 'full_name' => 'Elsewhere', 'created_at' => now(), 'updated_at' => now()]);
        $this->asManager()->postJson($this->adminApi('guests/merge'), ['winner_id' => $a, 'loser_id' => $theirs])
            ->assertNotFound()->assertJsonPath('error', 'not_found');
    }

    private function leadOf(int $guest): int
    {
        return DB::table('inquiries')->insertGetId(['organization_id' => $this->org->id, 'brand_id' => $this->brandId, 'guest_id' => $guest, 'status' => 'New', 'created_at' => now(), 'updated_at' => now()]);
    }
}

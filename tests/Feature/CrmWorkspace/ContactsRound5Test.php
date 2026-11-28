<?php

namespace Tests\Feature\CrmWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * HexaTech CRM round 5 (2026-11-12), the contacts' and companies' records and the full admin's filters, on the full
 * admin's own endpoints (GuestController, CorporateAccountController, CustomFieldService):
 *  - the days a contact was added are the venue's (`date_from`/`date_to`), as the leads' are;
 *  - "has an email" and "has a phone" mean one that is there, a mobile counting as a phone;
 *  - the facets name the guest types the contacts hold;
 *  - saving a record's own fields keeps the values of fields the organisation switched off or deleted.
 * The clock: Wednesday 4 November 2026, 12:00 in Riga (10:00 UTC).
 */
class ContactsRound5Test extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        $this->setUpCustomFieldsSchema();
        foreach ([
            'mobile' => fn ($t) => $t->string('mobile')->nullable(),
            'guest_type' => fn ($t) => $t->string('guest_type', 30)->default('Individual'),
            'vip_level' => fn ($t) => $t->string('vip_level', 30)->default('Standard'),
            'nationality' => fn ($t) => $t->string('nationality', 100)->nullable(),
            'loyalty_tier' => fn ($t) => $t->string('loyalty_tier', 30)->nullable(),
            'email_key' => fn ($t) => $t->string('email_key')->nullable(),
            'phone_key' => fn ($t) => $t->string('phone_key')->nullable(),
        ] as $column => $add) {
            if (!Schema::hasColumn('guests', $column)) {
                Schema::table('guests', $add);
            }
        }
        if (!Schema::hasTable('corporate_accounts')) {
            Schema::create('corporate_accounts', fn ($t) => [
                $t->bigIncrements('id'), $t->unsignedBigInteger('organization_id'), $t->string('company_name'), $t->string('industry')->nullable(),
                $t->string('status', 30)->default('Active'), $t->text('custom_data')->nullable(), $t->timestamps(),
            ]);
        } elseif (!Schema::hasColumn('corporate_accounts', 'custom_data')) {
            Schema::table('corporate_accounts', fn ($t) => $t->text('custom_data')->nullable());
        }
    }

    private function guest(array $attributes = []): int
    {
        return DB::table('guests')->insertGetId($attributes + ['organization_id' => $this->org->id, 'full_name' => 'Ada Lovelace', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function field(string $entity, string $key, string $type = 'text', bool $active = true, array $extra = []): void
    {
        DB::table('custom_fields')->insert($extra + [
            'organization_id' => $this->org->id, 'entity' => $entity, 'key' => $key, 'label' => ucfirst($key), 'type' => $type,
            'required' => false, 'is_active' => $active, 'show_in_list' => false, 'sort_order' => 0, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    /** @return list<int> */
    private function ids(string $query): array
    {
        return collect($this->asStaffMember()->getJson($this->adminApi("guests?{$query}"))->assertOk()->json('data'))
            ->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all();
    }

    public function test_the_added_date_filters_are_the_venues_days(): void
    {
        // 00:30 on 5 November in Riga is 22:30 on the 4th in UTC; 23:30 on the 5th in Riga is 21:30 UTC.
        $early = $this->guest(['full_name' => 'Early on the fifth', 'created_at' => '2026-11-04 22:30:00']);
        $late = $this->guest(['full_name' => 'Late on the fifth', 'created_at' => '2026-11-05 21:30:00']);
        $sixth = $this->guest(['full_name' => 'Early on the sixth', 'created_at' => '2026-11-05 22:30:00']);

        $this->assertSame([$early, $late], $this->ids('date_from=2026-11-05&date_to=2026-11-05'));
        $this->assertSame([$sixth], $this->ids('date_from=2026-11-06'));
        $this->assertSame([$early, $late], $this->ids('date_to=2026-11-05'));
        $this->assertSame([$early, $late, $sixth], $this->ids('date_from=not-a-day'), 'a value that is not a day is ignored');

        // The export reads the same filters.
        $csv = $this->asStaffMember()->get($this->adminApi('guests/export?format=csv&date_from=2026-11-06'))->assertOk()->streamedContent();
        $this->assertStringContainsString('Early on the sixth', $csv);
        $this->assertStringNotContainsString('Late on the fifth', $csv);
    }

    public function test_has_an_email_or_a_phone_means_one_that_is_there_and_a_mobile_is_a_phone(): void
    {
        $both = $this->guest(['email' => 'ada@example.test', 'phone' => '+371 2000 0000']);
        $mobileOnly = $this->guest(['mobile' => '+371 2611 1111']);
        $emptyOnes = $this->guest(['email' => '', 'phone' => '']);
        $nothing = $this->guest();

        $this->assertSame([$both], $this->ids('has_email=1'));
        $this->assertSame([$both, $mobileOnly], $this->ids('has_phone=1'));
        $this->assertSame([$both], $this->ids('has_email=1&has_phone=1'));
        $this->assertSame([$both, $mobileOnly, $emptyOnes, $nothing], $this->ids(''));
    }

    public function test_the_full_admins_filters_the_crm_offers_and_the_guest_types_it_lists(): void
    {
        $vip = $this->guest(['guest_type' => 'Corporate', 'vip_level' => 'VIP', 'nationality' => 'Latvian', 'owner_name' => 'Anna', 'company' => 'Nordlight Software SIA']);
        $other = $this->guest(['guest_type' => 'Travel Agent', 'vip_level' => 'Gold', 'nationality' => 'Polish']);

        $this->assertSame([$vip], $this->ids('vip_level=VIP'));
        $this->assertSame([$vip], $this->ids('guest_type=Corporate&nationality=Latvian&owner_name=Anna'));
        $this->assertSame([$vip], $this->ids('company=nordlight'));
        // The company is matched as written, its _ and % too, on PostgreSQL and SQLite alike.
        $underscore = $this->guest(['company' => 'A_B Studio']);
        $this->guest(['company' => 'AxB Studio']);
        $this->assertSame([$underscore], $this->ids('company=a_b'));
        $this->assertSame([$other], $this->ids('guest_type=Travel%20Agent'));

        // Another organisation's types are not offered.
        $theirs = DB::table('organizations')->insertGetId(['name' => 'Elsewhere', 'slug' => 'else-' . uniqid('', true), 'created_at' => now(), 'updated_at' => now()]);
        DB::table('guests')->insert(['organization_id' => $theirs, 'full_name' => 'Them', 'guest_type' => 'Group Leader', 'created_at' => now(), 'updated_at' => now()]);
        $facets = $this->asStaffMember()->getJson($this->adminApi('guests/facets'))->assertOk()->json();
        $this->assertSame(['Corporate', 'Individual', 'Travel Agent'], $facets['guest_type']);
        $this->assertContains('Latvian', $facets['nationality']);
    }

    public function test_saving_a_contacts_own_fields_keeps_the_values_of_fields_switched_off_or_deleted(): void
    {
        $this->field('guest', 'diet', 'multiselect', true, ['config' => json_encode(['options' => ['Vegan', 'Halal']])]);
        $this->field('guest', 'retired', 'text', false);
        $guest = $this->guest(['custom_data' => json_encode(['diet' => ['Vegan'], 'retired' => 'kept while off', 'deleted_field' => 'kept too'])]);

        $this->asStaffMember()->putJson($this->adminApi("guests/{$guest}"), ['custom_data' => ['diet' => ['Halal'], 'retired' => 'sent while off']])->assertOk()
            ->assertJsonPath('custom_data.diet', ['Halal']);

        $stored = json_decode((string) DB::table('guests')->where('id', $guest)->value('custom_data'), true);
        $this->assertSame(['Halal'], $stored['diet'], 'an active field takes what was sent');
        $this->assertSame('kept while off', $stored['retired'], 'a switched-off field keeps its value; what is sent for it is not saved');
        $this->assertSame('kept too', $stored['deleted_field'], 'a deleted field keeps its value, to come back with it');

        // Emptying the active field clears it alone.
        $this->asStaffMember()->putJson($this->adminApi("guests/{$guest}"), ['custom_data' => []])->assertOk();
        $stored = json_decode((string) DB::table('guests')->where('id', $guest)->value('custom_data'), true);
        $this->assertSame(['retired' => 'kept while off', 'deleted_field' => 'kept too'], $stored);

        // A field still refused is refused as before.
        $this->asStaffMember()->putJson($this->adminApi("guests/{$guest}"), ['custom_data' => ['diet' => ['Paleo']]])->assertStatus(422)->assertJsonValidationErrors('custom_data.diet');
    }

    public function test_saving_a_companys_own_fields_keeps_the_values_of_fields_switched_off_or_deleted(): void
    {
        $this->field('corporate_account', 'segment', 'select', true, ['config' => json_encode(['options' => ['SME', 'Enterprise']])]);
        $company = DB::table('corporate_accounts')->insertGetId([
            'organization_id' => $this->org->id, 'company_name' => 'Berg AB', 'custom_data' => json_encode(['segment' => 'SME', 'old' => 'from before']),
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->asStaffMember()->putJson($this->adminApi("corporate-accounts/{$company}"), ['custom_data' => ['segment' => 'Enterprise']])->assertOk()
            ->assertJsonPath('custom_data.segment', 'Enterprise');
        $stored = json_decode((string) DB::table('corporate_accounts')->where('id', $company)->value('custom_data'), true);
        $this->assertSame(['old' => 'from before', 'segment' => 'Enterprise'], $stored);

        // A save of another field leaves the organisation's own fields as they are.
        $this->asStaffMember()->putJson($this->adminApi("corporate-accounts/{$company}"), ['industry' => 'Retail'])->assertOk();
        $this->assertSame($stored, json_decode((string) DB::table('corporate_accounts')->where('id', $company)->value('custom_data'), true));
    }
}

<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\Service;
use App\Services\Booking\Setup\ServiceSetup;
use App\Services\Booking\Setup\TeamSetup;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class ServiceAndTeamSetupTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function pivot(int $masterId, int $serviceId): ?object
    {
        return DB::table('service_master_service')->where('service_master_id', $masterId)->where('service_id', $serviceId)->first();
    }

    public function test_a_new_service_takes_the_venue_currency_the_next_place_and_its_performers_with_overrides(): void
    {
        $service = (new ServiceSetup())->create([
            'name' => 'Scalp Ritual', 'duration_minutes' => 30, 'price' => 40,
            'performers' => [['id' => $this->master->id, 'duration_minutes' => 40, 'price' => 45.5]],
        ]);

        $this->assertSame(['scalp-ritual', 'EUR', true], [$service->slug, $service->currency, (bool) $service->is_active]);
        $this->assertGreaterThan((int) $this->service->sort_order, (int) $service->sort_order);
        $pivot = $this->pivot($this->master->id, $service->id);
        $this->assertSame([40, 45.5], [(int) $pivot->duration_override_minutes, (float) $pivot->price_override]);
    }

    public function test_an_update_changes_only_what_it_is_given_and_leaves_the_marketing_fields(): void
    {
        DB::table('services')->where('id', $this->service->id)->update(['image' => 'svc.jpg', 'tags' => '["Signature"]', 'description' => 'Long text']);

        (new ServiceSetup())->update(Service::find($this->service->id), ['price' => 65, 'is_active' => false]);

        $row = DB::table('services')->where('id', $this->service->id)->first();
        $this->assertSame(['svc.jpg', '["Signature"]', 'Long text', 'Deep Tissue Massage', 0], [$row->image, $row->tags, $row->description, $row->name, (int) $row->is_active]);
        $this->assertSame(65.0, (float) $row->price);
        $this->assertNotNull($this->pivot($this->master->id, $this->service->id)); // performers untouched when not sent
    }

    public function test_performers_can_be_replaced_and_their_overrides_cleared(): void
    {
        $setup = new ServiceSetup();
        ServiceSetup::syncPerformers($this->service, [['id' => $this->master->id, 'price' => 70]]);
        $this->assertSame(70.0, (float) $this->pivot($this->master->id, $this->service->id)->price_override);

        ServiceSetup::syncPerformers($this->service, [['id' => $this->master->id]]);
        $this->assertNull($this->pivot($this->master->id, $this->service->id)->price_override);

        $setup->update($this->service, ['performers' => []]);
        $this->assertNull($this->pivot($this->master->id, $this->service->id));
    }

    public function test_a_team_member_is_created_with_a_sign_in_and_services_and_updated_in_place(): void
    {
        $user = $this->staffUser($this->org, ['role' => 'staff']);
        $member = (new TeamSetup())->create([
            'name' => 'Ilze Ozola', 'title' => 'Senior therapist', 'email' => 'ilze@example.test', 'user_id' => $user->id,
            'services' => [['id' => $this->service->id, 'duration_minutes' => 50]],
        ]);

        $this->assertSame(['Ilze Ozola', $user->id, true], [$member->name, (int) $member->user_id, (bool) $member->is_active]);
        $this->assertSame(50, (int) $this->pivot($member->id, $this->service->id)->duration_override_minutes);

        (new TeamSetup())->update($member, ['phone' => '+371 2000 0000', 'is_active' => false]);
        $fresh = $member->fresh();
        $this->assertSame(['Senior therapist', '+371 2000 0000', false], [$fresh->title, $fresh->phone, (bool) $fresh->is_active]);
        $this->assertNotNull($this->pivot($member->id, $this->service->id));
    }
}

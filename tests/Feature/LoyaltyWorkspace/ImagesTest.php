<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\Reward;
use App\Models\SpecialOffer;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Pictures for rewards and offers (release 2 §7, R2-2): staff with `can_manage_offers`; the full admin's limits
 * (JPEG, PNG or WebP; rewards 5 MB, offers 2 MB) and the dimension rule; MediaService's `rewards` and `offers`
 * folders; the old file deleted on replace and remove only when it is this organisation's own and no other row shows
 * it; another organisation's row not found before anything is stored.
 */
class ImagesTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    private Reward $reward;
    private SpecialOffer $offer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        // Never the production bucket: MediaService resolves the public disk, which is faked.
        Config::set('filesystems.media_disk', 'public');
        Config::set('filesystems.disks.do.key', null);
        Storage::fake('public');

        $this->reward = Reward::create(['name' => 'Spa voucher', 'points_cost' => 500]);
        $this->offer = SpecialOffer::create(['title' => 'Autumn spa', 'description' => 'x', 'type' => 'discount', 'value' => 15, 'start_date' => '2026-10-01', 'end_date' => '2026-10-31']);
    }

    private function send(string $path, UploadedFile $file)
    {
        return $this->asManager()->post($this->api($path), ['image' => $file], ['Accept' => 'application/json']);
    }

    private function onDisk(?string $url): bool
    {
        return is_string($url) && str_starts_with($url, '/storage/') && Storage::disk('public')->exists(substr($url, strlen('/storage/')));
    }

    public function test_a_reward_takes_a_picture_and_a_replacement_deletes_the_old_one(): void
    {
        $first = (string) $this->send("rewards/{$this->reward->id}/image?brand_id=all", UploadedFile::fake()->image('spa.jpg', 1200, 800))
            ->assertOk()->json('image_url');
        $this->assertStringStartsWith("/storage/org-{$this->org->id}/rewards/", $first);
        $this->assertTrue($this->onDisk($first));
        $this->assertSame($first, $this->reward->fresh()->image_url);

        $second = (string) $this->send("rewards/{$this->reward->id}/image", UploadedFile::fake()->image('spa.webp', 600, 600))->assertOk()->json('image_url');
        $this->assertNotSame($first, $second);
        $this->assertTrue($this->onDisk($second));
        $this->assertFalse($this->onDisk($first));

        $this->asStaffMember()->getJson($this->api('rewards'))->assertJsonPath('rewards.0.image_url', $second);
        $this->assertSame(['added', 'replaced'], AuditLog::query()->where('action', 'reward_image_uploaded')->orderBy('id')->get()
            ->map(fn ($a) => $a->new_values['picture'])->all());
    }

    public function test_removing_clears_it_and_deletes_the_file_and_a_second_remove_is_done_already(): void
    {
        $url = (string) $this->send("rewards/{$this->reward->id}/image", UploadedFile::fake()->image('spa.png', 400, 400))->json('image_url');

        $this->asManager()->deleteJson($this->api("rewards/{$this->reward->id}/image"))->assertOk()->assertExactJson(['image_url' => null]);
        $this->assertNull($this->reward->fresh()->image_url);
        $this->assertFalse($this->onDisk($url));

        $this->asManager()->deleteJson($this->api("rewards/{$this->reward->id}/image"))->assertOk();
        $this->assertSame(1, AuditLog::query()->where('action', 'reward_image_removed')->count());
    }

    public function test_a_file_that_is_not_ours_or_still_shown_elsewhere_is_never_deleted(): void
    {
        // The full admin lets an offer name any picture address; replacing or removing it deletes nothing.
        $this->offer->update(['image_url' => 'https://images.example.test/autumn.jpg']);
        $this->send("offers/{$this->offer->id}/image", UploadedFile::fake()->image('a.jpg', 300, 300))->assertOk();

        // Another organisation's file, and our own file another reward still shows.
        Storage::disk('public')->put('org-999999/rewards/theirs.jpg', 'x');
        Storage::disk('public')->put("org-{$this->org->id}/rewards/shared.jpg", 'x');
        $this->reward->update(['image_url' => '/storage/org-999999/rewards/theirs.jpg']);
        $this->send("rewards/{$this->reward->id}/image", UploadedFile::fake()->image('b.jpg', 300, 300))->assertOk();
        $this->assertTrue(Storage::disk('public')->exists('org-999999/rewards/theirs.jpg'));

        $copy = Reward::create(['name' => 'Spa voucher (copy)', 'points_cost' => 500, 'image_url' => "/storage/org-{$this->org->id}/rewards/shared.jpg"]);
        $this->reward->update(['image_url' => "/storage/org-{$this->org->id}/rewards/shared.jpg"]);
        $this->asManager()->deleteJson($this->api("rewards/{$this->reward->id}/image"))->assertOk();
        $this->assertTrue(Storage::disk('public')->exists("org-{$this->org->id}/rewards/shared.jpg"));
        $this->assertSame("/storage/org-{$this->org->id}/rewards/shared.jpg", $copy->fresh()->image_url);
    }

    public function test_the_full_admins_limits_and_the_dimension_rule(): void
    {
        $this->send("rewards/{$this->reward->id}/image", UploadedFile::fake()->create('menu.pdf', 100, 'application/pdf'))
            ->assertStatus(422)->assertJsonValidationErrors(['image']);
        $this->send("rewards/{$this->reward->id}/image", UploadedFile::fake()->image('big.jpg', 1000, 800)->size(5121))
            ->assertStatus(422)->assertJsonValidationErrors(['image']);
        $this->send("rewards/{$this->reward->id}/image", UploadedFile::fake()->image('wide.png', 4097, 10))
            ->assertStatus(422)->assertJsonValidationErrors(['image']);
        $this->send("offers/{$this->offer->id}/image", UploadedFile::fake()->image('three.jpg', 1000, 800)->size(3072))
            ->assertStatus(422)->assertJsonValidationErrors(['image']);
        $this->asManager()->postJson($this->api("offers/{$this->offer->id}/image"))->assertStatus(422)->assertJsonValidationErrors(['image']);

        // An offer takes up to 2 MB, a reward up to 5 MB.
        $this->send("offers/{$this->offer->id}/image", UploadedFile::fake()->image('two.jpg', 1000, 800)->size(2048))->assertOk();
        $this->send("rewards/{$this->reward->id}/image", UploadedFile::fake()->image('five.jpg', 1000, 800)->size(5120))->assertOk();
        $this->assertCount(2, Storage::disk('public')->allFiles());
        $this->asStaffMember()->getJson($this->api('offers'))->assertJsonPath('offers.0.image_url', $this->offer->fresh()->image_url);
    }

    public function test_staff_without_manage_offers_are_refused_and_nothing_is_stored(): void
    {
        $this->asStaffMember()->post($this->api("rewards/{$this->reward->id}/image"), ['image' => UploadedFile::fake()->image('a.jpg')], ['Accept' => 'application/json'])
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed')->assertJsonPath('need', 'can_manage_offers');
        $this->asStaffMember()->deleteJson($this->api("rewards/{$this->reward->id}/image"))->assertStatus(403);
        $this->asStaffMember()->post($this->api("offers/{$this->offer->id}/image"), ['image' => UploadedFile::fake()->image('a.jpg')], ['Accept' => 'application/json'])->assertStatus(403);
        $this->asStaffMember()->deleteJson($this->api("offers/{$this->offer->id}/image"))->assertStatus(403);

        DB::table('staff')->where('user_id', $this->staffMember->id)->update(['can_manage_offers' => true]);
        $this->asStaffMember()->post($this->api("offers/{$this->offer->id}/image"), ['image' => UploadedFile::fake()->image('a.jpg')], ['Accept' => 'application/json'])->assertOk();
        $this->assertCount(1, Storage::disk('public')->allFiles());
    }

    public function test_another_organisations_reward_or_offer_is_not_found_before_anything_is_stored(): void
    {
        $other = $this->otherOrganization();
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $other['org']->id);
        $theirReward = Reward::create(['name' => 'Theirs', 'points_cost' => 10, 'image_url' => '/storage/org-' . $other['org']->id . '/rewards/x.jpg']);
        $theirOffer = SpecialOffer::create(['title' => 'Theirs', 'description' => 'x', 'type' => 'discount', 'value' => 1, 'start_date' => '2026-10-01', 'end_date' => '2026-10-31']);
        app()->instance('current_organization_id', $prior);

        $this->send("rewards/{$theirReward->id}/image", UploadedFile::fake()->image('a.jpg'))->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->send("offers/{$theirOffer->id}/image", UploadedFile::fake()->image('a.jpg'))->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->asManager()->deleteJson($this->api("rewards/{$theirReward->id}/image"))->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->asManager()->deleteJson($this->api("offers/{$theirOffer->id}/image"))->assertStatus(404);

        $this->assertSame([], Storage::disk('public')->allFiles());
        $this->assertNotNull(Reward::withoutGlobalScopes()->find($theirReward->id)->image_url);
    }
}

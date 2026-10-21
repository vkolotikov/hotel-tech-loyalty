<?php

namespace Tests\Feature\Admin;

use App\Models\SpecialOffer;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Owner decision R2-5 (HexaTech Loyalty release 2): the full admin's offer edit checks its image as its create does
 * (JPEG, PNG or WebP, up to 2 MB). Nothing else about the edit changes: an edit without a file leaves the picture as it
 * is, a good file is uploaded to the `offers` folder, and the answer keeps its shape. The full admin's form sends
 * multipart with `_method=PUT`, as here.
 */
class OfferImageValidationTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    private SpecialOffer $offer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        // Never the production bucket: MediaService resolves the public disk, which is faked.
        Config::set('filesystems.media_disk', 'public');
        Config::set('filesystems.disks.do.key', null);
        Storage::fake('public');

        $this->offer = SpecialOffer::create([
            'title' => 'Autumn spa', 'description' => '15% off treatments.', 'type' => 'discount', 'value' => 15,
            'start_date' => '2026-10-01', 'end_date' => '2026-10-31', 'image_url' => 'https://images.example.test/autumn.jpg',
        ]);
    }

    private function edit(array $body)
    {
        $url = rtrim((string) config('app.url'), '/') . "/api/v1/admin/offers/{$this->offer->id}";

        return $this->asManager()->post($url, $body + ['_method' => 'PUT'], ['Accept' => 'application/json']);
    }

    public function test_an_edit_without_a_file_keeps_the_picture_and_its_answer(): void
    {
        $this->edit(['title' => 'Autumn spa days'])
            ->assertOk()
            ->assertJsonPath('message', 'Offer updated')
            ->assertJsonPath('offer.id', $this->offer->id)
            ->assertJsonPath('offer.title', 'Autumn spa days')
            ->assertJsonPath('offer.image_url', 'https://images.example.test/autumn.jpg');
    }

    public function test_a_good_picture_is_uploaded_to_the_offers_folder(): void
    {
        $response = $this->edit(['image' => UploadedFile::fake()->image('spa.jpg', 800, 600)])->assertOk();

        $url = (string) $response->json('offer.image_url');
        $this->assertStringStartsWith("/storage/org-{$this->org->id}/offers/", $url);
        Storage::disk('public')->assertExists(substr($url, strlen('/storage/')));
        $this->assertSame($url, $this->offer->fresh()->image_url);
    }

    public function test_a_pdf_or_a_picture_over_2_mb_is_refused_and_nothing_changes(): void
    {
        $this->edit(['title' => 'Changed', 'image' => UploadedFile::fake()->create('menu.pdf', 100, 'application/pdf')])
            ->assertStatus(422)->assertJsonValidationErrors(['image']);
        $this->edit(['title' => 'Changed', 'image' => UploadedFile::fake()->image('huge.jpg', 1200, 900)->size(3072)])
            ->assertStatus(422)->assertJsonValidationErrors(['image']);

        $fresh = $this->offer->fresh();
        $this->assertSame('Autumn spa', $fresh->title);
        $this->assertSame('https://images.example.test/autumn.jpg', $fresh->image_url);
        $this->assertSame([], Storage::disk('public')->allFiles());
    }
}

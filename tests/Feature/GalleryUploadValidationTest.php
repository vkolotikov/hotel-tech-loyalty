<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\V1\Admin\BookingRoomController;
use App\Http\Controllers\Api\V1\Admin\ServiceController;
use App\Models\BookingRoom;
use App\Models\Organization;
use App\Models\Service;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Task 2 (landing phase 3b, media round): `gallery_files` was accepted
 * with NO validation at all at any of its three call sites — any file
 * type, any size, any count. ServiceController::store/update and
 * BookingRoomController::store/update (which both feed the shared
 * applyPhotos() upload path) now share one rule set; this suite locks it
 * down at each edited call site.
 *
 * Exercised by calling the controllers directly, not over HTTP — same
 * rationale LandingPageAdminApiTest documents: these admin routes sit
 * behind saas.auth + Sanctum + tenant + brand middleware this repo has no
 * test harness for. Tests are split one-per-controller (rather than a
 * single shared parameterized case) so that dropping the `gallery_files.*`
 * rule from just ONE controller turns only that controller's tests red —
 * proving per-call-site coverage rather than incidental pass-through.
 */
class GalleryUploadValidationTest extends TestCase
{
    use SetsUpMinimalSchema;

    private Organization $org;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->setUpAvailabilitySchema();   // organizations/users/brands/booking_rooms
        $this->setUpServiceCatalogSchema(); // + services/service_categories/service_masters/*

        // MediaService::disk() auto-detects DigitalOcean Spaces whenever its
        // credentials are configured — and this repo's own .env carries
        // real ones, so an un-forced test would try a real network call.
        // Force the local disk deterministically and fake it.
        Config::set('filesystems.media_disk', 'public');
        Config::set('filesystems.disks.do.key', null);
        Config::set('filesystems.disks.do.secret', null);
        Config::set('filesystems.disks.do.bucket', null);
        Storage::fake('public');

        $this->org = Organization::create([
            'name'     => 'Glamour',
            'slug'     => 'glamour-' . uniqid(),
            'industry' => 'beauty',
        ]);
        $this->user = User::create([
            'name'            => 'Staff',
            'email'           => 'staff_' . uniqid() . '@example.test',
            'organization_id' => $this->org->id,
            'user_type'       => 'staff',
        ]);

        app()->instance('current_organization_id', $this->org->id);
        app()->instance('current_brand_id', $this->defaultBrandId());
    }

    protected function tearDown(): void
    {
        foreach (['current_organization_id', 'current_brand_id'] as $bind) {
            if (app()->bound($bind)) {
                app()->forgetInstance($bind);
            }
        }
        parent::tearDown();
    }

    /**
     * The default brand Organization::create()'s own `created` hook makes
     * (app/Models/Organization.php:93) — reused, never hand-inserted, per
     * the partial-unique `brands_org_default_unique` constraint this repo's
     * other tenant fixtures are careful about (see
     * LandingPageAdminApiTest::defaultBrandId()).
     */
    private function defaultBrandId(): int
    {
        return (int) DB::table('brands')
            ->where('organization_id', $this->org->id)
            ->where('is_default', true)
            ->value('id');
    }

    // ─── Fixtures ────────────────────────────────────────────────────────

    /** A real, tiny, valid image — GD in-test when available, else the committed fixture. */
    private function realImage(string $name): UploadedFile
    {
        if (function_exists('imagecreatetruecolor')) {
            return UploadedFile::fake()->image($name, 10, 10);
        }

        return UploadedFile::fake()->createWithContent(
            $name,
            file_get_contents(base_path('tests/fixtures/images/small-10x10.png')),
        );
    }

    /**
     * A ".jpg" that is not actually a photo — a text file wearing an image
     * extension. Laravel's fake UploadedFile reports whatever MIME type is
     * either given explicitly or inferred from the filename's extension; it
     * does NOT sniff real bytes (confirmed: createWithContent() with actual
     * non-image bytes under a ".jpg" name still self-reports image/jpeg).
     * The explicit `text/plain` override is what actually exercises the
     * `image`/`mimes` rejection path.
     */
    private function junkFile(string $name): UploadedFile
    {
        return UploadedFile::fake()->create($name, 5, 'text/plain');
    }

    private function request(array $fields, array $files): Request
    {
        $request = Request::create('/api/v1/admin/gallery-test', 'POST', $fields, [], $files);
        $request->setUserResolver(fn () => $this->user);

        return $request;
    }

    // ─── ServiceController ──────────────────────────────────────────────

    public function test_service_store_rejects_a_non_image_file_disguised_as_a_jpg(): void
    {
        $request = $this->request(
            ['name' => 'Manicure', 'duration_minutes' => 30],
            ['gallery_files' => [$this->junkFile('sneaky.jpg')]],
        );

        try {
            (new ServiceController())->store($request);
            $this->fail('A non-image file was accepted as a gallery photo.');
        } catch (ValidationException $e) {
            $message = $e->errors()['gallery_files.0'][0] ?? '';
            $this->assertStringContainsString('not a photo we can use', $message);
        }
    }

    public function test_service_store_rejects_a_genuine_text_file(): void
    {
        $request = $this->request(
            ['name' => 'Manicure', 'duration_minutes' => 30],
            ['gallery_files' => [UploadedFile::fake()->create('notes.txt', 5, 'text/plain')]],
        );

        $this->expectException(ValidationException::class);
        (new ServiceController())->store($request);
    }

    public function test_service_store_rejects_more_than_24_gallery_files(): void
    {
        $files = [];
        for ($i = 0; $i < 25; $i++) {
            $files[] = $this->realImage("photo{$i}.jpg");
        }

        $request = $this->request(
            ['name' => 'Manicure', 'duration_minutes' => 30],
            ['gallery_files' => $files],
        );

        try {
            (new ServiceController())->store($request);
            $this->fail('25 gallery files were accepted.');
        } catch (ValidationException $e) {
            $this->assertSame(
                'Please upload up to 24 photos at a time.',
                $e->errors()['gallery_files'][0],
            );
        }
    }

    public function test_service_store_accepts_a_legitimate_small_image_array(): void
    {
        $request = $this->request(
            ['name' => 'Manicure', 'duration_minutes' => 30],
            ['gallery_files' => [$this->realImage('a.jpg'), $this->realImage('b.jpg')]],
        );

        $response = (new ServiceController())->store($request);
        $body = json_decode($response->getContent(), true);

        $this->assertCount(2, $body['gallery']);
    }

    public function test_service_update_rejects_a_non_image_gallery_file(): void
    {
        $service = Service::create([
            'name' => 'Manicure', 'slug' => 'manicure', 'duration_minutes' => 30,
        ]);

        $request = $this->request([], ['gallery_files' => [$this->junkFile('sneaky.jpg')]]);

        $this->expectException(ValidationException::class);
        (new ServiceController())->update($request, $service->id);
    }

    // ─── BookingRoomController ──────────────────────────────────────────

    public function test_booking_room_store_rejects_a_non_image_file_disguised_as_a_jpg(): void
    {
        $request = $this->request(
            ['name' => 'Deluxe Suite'],
            ['gallery_files' => [$this->junkFile('sneaky.jpg')]],
        );

        try {
            (new BookingRoomController())->store($request);
            $this->fail('A non-image file was accepted as a gallery photo.');
        } catch (ValidationException $e) {
            $message = $e->errors()['gallery_files.0'][0] ?? '';
            $this->assertStringContainsString('not a photo we can use', $message);
        }
    }

    public function test_booking_room_store_rejects_a_genuine_text_file(): void
    {
        $request = $this->request(
            ['name' => 'Deluxe Suite'],
            ['gallery_files' => [UploadedFile::fake()->create('notes.txt', 5, 'text/plain')]],
        );

        $this->expectException(ValidationException::class);
        (new BookingRoomController())->store($request);
    }

    public function test_booking_room_store_rejects_more_than_24_gallery_files(): void
    {
        $files = [];
        for ($i = 0; $i < 25; $i++) {
            $files[] = $this->realImage("photo{$i}.jpg");
        }

        $request = $this->request(
            ['name' => 'Deluxe Suite'],
            ['gallery_files' => $files],
        );

        try {
            (new BookingRoomController())->store($request);
            $this->fail('25 gallery files were accepted.');
        } catch (ValidationException $e) {
            $this->assertSame(
                'Please upload up to 24 photos at a time.',
                $e->errors()['gallery_files'][0],
            );
        }
    }

    public function test_booking_room_store_accepts_a_legitimate_small_image_array(): void
    {
        $request = $this->request(
            ['name' => 'Deluxe Suite'],
            ['gallery_files' => [$this->realImage('a.jpg'), $this->realImage('b.jpg')]],
        );

        $response = (new BookingRoomController())->store($request);
        $body = json_decode($response->getContent(), true);

        $this->assertCount(2, $body['gallery']);
    }

    public function test_booking_room_update_rejects_a_non_image_gallery_file(): void
    {
        $room = BookingRoom::create([
            'name' => 'Deluxe Suite', 'slug' => 'deluxe-suite',
            'base_price' => 100, 'inventory_count' => 1, 'currency' => 'EUR',
        ]);

        $request = $this->request([], ['gallery_files' => [$this->junkFile('sneaky.jpg')]]);

        $this->expectException(ValidationException::class);
        (new BookingRoomController())->update($request, $room->id);
    }
}

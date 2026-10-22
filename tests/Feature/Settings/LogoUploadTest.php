<?php

namespace Tests\Feature\Settings;

use App\Models\AuditLog;
use App\Models\HotelSetting;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The full admin's logo upload, `POST /v1/admin/settings/logo` (Settings → Appearance): its answer `{message, url}`,
 * its validation, the `company_logo` setting it writes and the file it lets go of. Pinned on the controller's own code
 * before release 3 (R3-6) moved the write to AppLook::setLogo, the one writer HexaTech Loyalty's logo upload uses too.
 */
class LogoUploadTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        // MediaService::disk(): an explicit media disk wins over the cloud auto-detect (MediaServiceDiskTest).
        Config::set('filesystems.media_disk', 'public');
        Config::set('filesystems.disks.do.key', null);
        Storage::fake('public');
    }

    private function endpoint(): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/v1/admin/settings/logo';
    }

    private function upload(?UploadedFile $file, bool $asManager = true): \Illuminate\Testing\TestResponse
    {
        $caller = $asManager ? $this->asManager() : $this->asStaffMember();

        return $caller->post($this->endpoint(), $file ? ['logo' => $file] : [], ['Accept' => 'application/json']);
    }

    private function stored(string $url): string
    {
        $this->assertStringStartsWith('/storage/', $url);

        return substr($url, strlen('/storage/'));
    }

    public function test_a_manager_uploads_a_logo_and_gets_the_message_and_its_address(): void
    {
        $response = $this->upload(UploadedFile::fake()->image('logo.png', 400, 400))->assertOk();

        $json = $response->json();
        $this->assertSame(['message', 'url'], array_keys($json));
        $this->assertSame('Logo uploaded', $json['message']);
        $url = (string) $json['url'];
        $this->assertStringStartsWith("/storage/org-{$this->org->id}/logos/", $url);
        Storage::disk('public')->assertExists($this->stored($url));

        $row = HotelSetting::query()->where('key', 'company_logo')->sole();
        $this->assertSame($url, $row->value);
        $this->assertSame('string', $row->type);
        $this->assertSame('appearance', $row->group);
        $this->assertSame('Company Logo', $row->label);
        $this->assertSame('Logo displayed in the app header and member cards', $row->description);
        $this->assertSame((int) $this->org->id, (int) $row->organization_id);

        $audit = AuditLog::query()->where('action', 'logo_uploaded')->sole();
        $this->assertSame(HotelSetting::class, $audit->subject_type);
        $this->assertSame((int) $row->id, (int) $audit->subject_id);
        $this->assertSame((int) $this->manager->id, (int) $audit->causer_id);
        $this->assertSame('Company logo updated', $audit->description);

        // The apps read the same setting.
        $theme = $this->getJson(rtrim((string) config('app.url'), '/') . '/api/v1/theme')->assertOk()->json();
        $this->assertSame($url, $theme['theme']['company_logo']);
    }

    public function test_a_replacement_names_the_new_file_and_deletes_our_old_one(): void
    {
        $first = (string) $this->upload(UploadedFile::fake()->image('logo.png', 400, 400))->assertOk()->json('url');
        $second = (string) $this->upload(UploadedFile::fake()->image('logo.webp', 300, 300))->assertOk()
            ->assertJsonPath('message', 'Logo uploaded')->json('url');

        $this->assertNotSame($first, $second);
        Storage::disk('public')->assertMissing($this->stored($first));
        Storage::disk('public')->assertExists($this->stored($second));
        $this->assertSame($second, HotelSetting::query()->where('key', 'company_logo')->sole()->value);
        $this->assertSame(2, AuditLog::query()->where('action', 'logo_uploaded')->count());
    }

    public function test_the_upload_is_refused_as_before_and_nothing_is_written(): void
    {
        $refusals = [
            'none'      => [null, ['The logo field is required.']],
            'a pdf'     => [UploadedFile::fake()->create('logo.pdf', 10, 'application/pdf'), ['The logo field must be an image.', 'The logo field must be a file of type: jpeg, png, jpg, webp.']],
            'a gif'     => [UploadedFile::fake()->image('logo.gif', 100, 100), ['The logo field must be a file of type: jpeg, png, jpg, webp.']],
            'too heavy' => [UploadedFile::fake()->image('logo.png', 400, 400)->size(4097), ['The logo field must not be greater than 4096 kilobytes.']],
        ];
        foreach ($refusals as $case => [$file, $messages]) {
            $response = $this->upload($file)->assertStatus(422);
            $this->assertSame($messages, $response->json('errors.logo'), $case);
            $this->assertSame(['logo'], array_keys((array) $response->json('errors')), $case);
            $this->assertIsString($response->json('message'), $case);
        }

        $this->assertNull(HotelSetting::query()->where('key', 'company_logo')->first());
        $this->assertSame(0, AuditLog::query()->where('action', 'logo_uploaded')->count());
        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    /** R3-6: through AppLook::setLogo, an old logo that is not this organisation's own file in `logos` is let go of, never deleted. */
    public function test_an_old_logo_that_is_not_our_own_file_is_replaced_but_kept(): void
    {
        $other = $this->otherOrganization()['org'];
        $notOurs = [
            'shared/logo.png',                        // a path someone typed, outside every organisation's folder
            "org-{$other->id}/logos/theirs.png",      // another organisation's logo
            "org-{$this->org->id}/offers/banner.png", // ours, but another folder's (an offer's picture)
        ];
        foreach ($notOurs as $path) {
            Storage::disk('public')->put($path, 'x');
            HotelSetting::query()->updateOrCreate(['key' => 'company_logo'], ['value' => '/storage/' . $path, 'type' => 'string', 'group' => 'appearance']);

            $url = (string) $this->upload(UploadedFile::fake()->image('logo.png', 300, 300))->assertOk()
                ->assertJsonPath('message', 'Logo uploaded')->json('url');

            Storage::disk('public')->assertExists($path);
            $this->assertSame($url, HotelSetting::query()->where('key', 'company_logo')->sole()->value, $path);
        }
    }

    /** R3-6: the audit row is AppLook::setLogo's — whether a logo was added or replaced, not the address (it was `{url}`). */
    public function test_the_audit_row_says_added_then_replaced(): void
    {
        $this->upload(UploadedFile::fake()->image('logo.png', 400, 400))->assertOk();
        $this->upload(UploadedFile::fake()->image('logo.png', 400, 400))->assertOk();

        $rows = AuditLog::query()->where('action', 'logo_uploaded')->orderBy('id')->get();
        $this->assertSame([['logo' => 'added'], ['logo' => 'replaced']], $rows->pluck('new_values')->all());
        $this->assertSame([[], []], $rows->pluck('old_values')->all());
    }

    public function test_the_full_admin_sets_no_limit_on_a_logos_edges(): void
    {
        // The workspace's own upload (AppLook::logoRules) refuses an edge over 4,096 px; the full admin never did.
        $this->upload(UploadedFile::fake()->image('wide.png', 5000, 10))->assertOk()->assertJsonPath('message', 'Logo uploaded');
    }

    public function test_a_staff_member_who_is_not_a_manager_is_refused_when_access_is_enforced(): void
    {
        // AccessMap `admin/settings`: changes are a manager's (AdminAccess refuses only in `enforce` mode).
        config(['admin_access.mode' => 'enforce']);
        $this->upload(UploadedFile::fake()->image('logo.png', 400, 400), asManager: false)->assertForbidden()
            ->assertJsonPath('error', 'not_allowed');

        $this->assertNull(HotelSetting::query()->where('key', 'company_logo')->first());
        $this->assertSame([], Storage::disk('public')->allFiles());
    }
}

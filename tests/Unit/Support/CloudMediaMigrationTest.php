<?php

namespace Tests\Unit\Support;

use App\Services\Media\{Archive, Migration, ObjectStore};
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CloudMediaMigrationTest extends TestCase
{
    private ObjectStore $objects;

    protected function setUp(): void
    {
        parent::setUp();
        config(['cache.shared' => 'array', 'filesystems.disks.media.url' => 'https://media.example.test']);
        Storage::fake('do'); Storage::fake('media', ['url' => 'https://media.example.test']); Storage::fake('media_private');
        $this->objects = new class extends ObjectStore {
            public function sourceVisibility(string $disk, string $key): string { return str_contains($key, '/private/') ? 'private' : 'public'; }
        };
    }

    private function migration(): Migration { return new Migration($this->objects, new Archive($this->objects)); }

    public function test_preview_never_writes_and_copy_is_complete_resumable_and_preserves_the_source(): void
    {
        $png = UploadedFile::fake()->image('a.png', 8, 8)->getContent();
        $files = ['org-19/logos/a.png' => $png, 'org-19/private/member.png' => $png,
            'org-19/credentials/secret.pem' => 'private bytes', 'org-19/documents/guide.txt' => 'Public guide',
            'org-19/images/ambiguous%20key.png' => $png];
        foreach ($files as $key => $bytes) Storage::disk('do')->put($key, $bytes);
        $plan = $this->migration()->run(false);
        $this->assertSame(5, $plan['objects']); $this->assertSame(2, $plan['public']); $this->assertSame(3, $plan['private_review']);
        $this->assertSame([], Storage::disk('media')->allFiles());
        $this->assertSame([], Storage::disk('media_private')->allFiles());
        $first = $this->migration()->run(true); $this->assertTrue($first['applied']);
        $before = Storage::disk('media_private')->allFiles();
        $again = $this->migration()->run(true); $this->assertSame($first['objects'], $again['objects']);
        $this->assertSame($before, Storage::disk('media_private')->allFiles());
        $this->assertSame(['org-19/documents/guide.txt', 'org-19/logos/a.png'], Storage::disk('media')->allFiles());
        foreach ($files as $key => $bytes) $this->assertSame($bytes, Storage::disk('do')->get($key));
        $this->assertSame($png, Storage::disk('media')->get('org-19/logos/a.png'));
        $records = array_filter($before, fn ($key) => str_starts_with($key, 'migration/') && str_ends_with($key, '.json'));
        $this->assertCount(5, $records);
    }

    public function test_destination_conflicts_stop_without_overwriting_either_live_file(): void
    {
        Storage::disk('do')->put('org-19/readme.txt', 'source');
        Storage::disk('media')->put('org-19/readme.txt', 'already here');
        try { $this->migration()->run(true); $this->fail('Destination conflict accepted'); }
        catch (\RuntimeException $e) { $this->assertSame('media_destination_conflict', $e->getMessage()); }
        $this->assertSame('source', Storage::disk('do')->get('org-19/readme.txt'));
        $this->assertSame('already here', Storage::disk('media')->get('org-19/readme.txt'));
    }

    public function test_supported_public_word_documents_keep_working_without_publishing_private_or_disguised_files(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'cloud_word_');
        try {
            $word = new \PhpOffice\PhpWord\PhpWord;
            $word->addSection()->addText('Public migration fixture');
            \PhpOffice\PhpWord\IOFactory::createWriter($word, 'Word2007')->save($path);
            $bytes = file_get_contents($path);
        } finally { unlink($path); }
        $files = ['org-19/knowledge-documents/guide.docx' => $bytes,
            'org-19/private/member.docx' => $bytes, 'org-19/knowledge-documents/renamed.docx' => 'not a Word package',
            'org-19/knowledge-documents/archive.zip' => $bytes, 'org-19/credentials/secret.docx' => $bytes];
        foreach ($files as $key => $body) Storage::disk('do')->put($key, $body);
        $preview = $this->migration()->run(false);
        $this->assertSame(1, $preview['public']);
        $this->assertSame(4, $preview['private_review']);
        $this->assertSame([], Storage::disk('media')->allFiles());
        $this->migration()->run(true);
        $this->assertSame(['org-19/knowledge-documents/guide.docx'], Storage::disk('media')->allFiles());
        $this->assertSame($bytes, Storage::disk('media')->get('org-19/knowledge-documents/guide.docx'));
        foreach ($files as $key => $body) $this->assertSame($body, Storage::disk('do')->get($key));
    }

    public function test_an_acl_failure_cannot_publish_anything(): void
    {
        Storage::disk('do')->put('org-19/readme.txt', 'source');
        $objects = new class extends ObjectStore {
            public function sourceVisibility(string $disk, string $key): string { throw new \RuntimeException('denied'); }
        };
        try { (new Migration($objects, new Archive($objects)))->run(true); $this->fail('Unverified visibility accepted'); }
        catch (\RuntimeException $e) { $this->assertSame('denied', $e->getMessage()); }
        $this->assertSame([], Storage::disk('media')->allFiles());
        $this->assertSame([], Storage::disk('media_private')->allFiles());
    }

    public function test_aliases_of_the_same_physical_store_have_the_same_fingerprint(): void
    {
        Storage::set('same_source', Storage::disk('do'));
        $this->assertSame($this->objects->fingerprint('do'), $this->objects->fingerprint('same_source'));
    }

    public function test_an_apply_command_requires_the_verified_targets_before_copying(): void
    {
        $service = \Mockery::mock(Migration::class);
        $service->shouldReceive('targets')->once()->andReturn(['source' => ['bucket' => 'source'],
            'public' => ['bucket' => 'public', 'endpoint_host' => 'storage.example.test'],
            'private' => ['bucket' => 'private', 'endpoint_host' => 'storage.example.test']]);
        $service->shouldNotReceive('run'); $this->app->instance(Migration::class, $service);
        $this->artisan('media:cloud-migrate', ['--apply' => true])->assertExitCode(1);
    }
}

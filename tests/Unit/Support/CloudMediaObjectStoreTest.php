<?php

namespace Tests\Unit\Support;

use App\Services\Media\ObjectStore;
use Aws\Result;
use Aws\S3\Exception\S3Exception;
use GuzzleHttp\Promise\Create;
use GuzzleHttp\Psr7\{Response, Utils};
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CloudMediaObjectStoreTest extends TestCase
{
    private function sdk(callable $handler): void
    {
        $disk = Storage::build(['driver' => 's3', 'bucket' => 'unit-test-bucket', 'region' => 'auto',
            'endpoint' => 'https://storage.example.test', 'key' => 'fake-key', 'secret' => 'fake-secret',
            'use_path_style_endpoint' => true]);
        $disk->getClient()->getHandlerList()->setHandler($handler);
        Storage::set('media', $disk);
    }

    public function test_real_sdk_put_payload_has_no_acl_and_uses_a_bounded_transport_without_retries(): void
    {
        $calls = 0;
        $this->sdk(function ($command, $request) use (&$calls) {
            $calls++;
            $this->assertSame('PutObject', $command->getName());
            $this->assertFalse($request->hasHeader('x-amz-acl'));
            $this->assertSame('image/png', $request->getHeaderLine('Content-Type'));
            $this->assertSame('bytes', (string) $request->getBody());
            $this->assertSame(60, $command['@http']['timeout']);
            $this->assertSame(0, $command['@retries']);
            return Create::promiseFor(new Result());
        });
        (new ObjectStore)->put('media', 'org-19/logos/a.png', 'bytes', 'image/png');
        $this->assertSame(1, $calls);
    }

    public function test_source_snapshot_reads_a_conditionally_matched_revision_and_checks_its_bytes(): void
    {
        $calls = [];
        $this->sdk(function ($command, $request) use (&$calls) {
            $calls[] = $command->getName();
            if ($command->getName() === 'HeadObject') return Create::promiseFor(new Result(['ContentLength' => 5, 'ETag' => 'revision']));
            $this->assertSame('revision', $request->getHeaderLine('If-Match'));
            return Create::promiseFor(new Result(['Body' => Utils::streamFor('bytes'), 'ContentType' => 'image/png']));
        });
        $copy = (new ObjectStore)->snapshot('media', 'org-19/logos/a.png');
        try {
            $this->assertSame(hash('sha256', 'bytes'), $copy['sha256']);
            $this->assertSame(5, $copy['bytes']);
            $this->assertSame(['HeadObject', 'GetObject'], $calls);
        } finally { fclose($copy['stream']); }
    }

    public function test_a_missing_or_inaccessible_bucket_is_never_reported_as_a_missing_object(): void
    {
        $calls = [];
        $this->sdk(function ($command) use (&$calls) {
            $calls[] = $command->getName();
            return Create::rejectionFor(new S3Exception('unavailable', $command,
                ['response' => new Response($command->getName() === 'HeadObject' ? 404 : 403), 'code' => $command->getName() === 'HeadObject' ? 'NotFound' : 'AccessDenied']));
        });
        try { (new ObjectStore)->exists('media', 'org-19/logos/a.png'); $this->fail('Bucket loss was interpreted as key deletion'); }
        catch (S3Exception $e) { $this->assertSame(403, $e->getStatusCode()); }
        $this->assertSame(['HeadObject', 'HeadBucket'], $calls);
    }

    public function test_sdk_listing_consumes_every_page_including_continuation_tokens(): void
    {
        $calls = 0;
        $this->sdk(function ($command) use (&$calls) {
            $calls++;
            $this->assertSame('ListObjectsV2', $command->getName());
            if ($calls === 1) return Create::promiseFor(new Result(['IsTruncated' => true, 'NextContinuationToken' => 'next', 'Contents' => [['Key' => 'org-19/a.png']]]));
            $this->assertSame('next', $command['ContinuationToken']);
            return Create::promiseFor(new Result(['IsTruncated' => false, 'Contents' => [['Key' => 'org-19/b.png']]]));
        });
        $this->assertSame(['org-19/a.png', 'org-19/b.png'], iterator_to_array((new ObjectStore)->files('media'), false));
        $this->assertSame(2, $calls);
    }
}

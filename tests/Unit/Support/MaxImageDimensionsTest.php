<?php

namespace Tests\Unit\Support;

use App\Rules\MaxImageDimensions;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Validator;
use Tests\TestCase;

/**
 * Task 3 (landing phase 3b, media round): MaxImageDimensions is the
 * core-PHP backstop that rejects an oversized image before it ever reaches
 * MediaService — no GD/imagick decode, just getimagesize()'s header read.
 *
 * Fixtures: generated in-test via GD when the pinned binary has it
 * (confirmed available here), with two pre-committed PNGs under
 * tests/fixtures/images/ so the same suite still runs on a machine without
 * GD (UploadedFile::fake()->image() itself requires GD to synthesize pixel
 * data, so the fallback wraps the committed bytes with createWithContent()
 * instead).
 */
class MaxImageDimensionsTest extends TestCase
{
    private function fixturePath(string $name): string
    {
        return base_path("tests/fixtures/images/{$name}");
    }

    /**
     * 4200x10 — a stripe, not a square. Its SHORTER edge (10) is comfortably
     * under the 4096 ceiling, so this is the one fixture that can actually
     * tell max() apart from min(): a square fixture would fail identically
     * under either, proving nothing about which one the rule uses.
     */
    private function stripeImage(): UploadedFile
    {
        if (function_exists('imagecreatetruecolor')) {
            return UploadedFile::fake()->image('stripe.png', 4200, 10);
        }

        return UploadedFile::fake()->createWithContent(
            'stripe.png',
            file_get_contents($this->fixturePath('oversized-stripe-4200x10.png')),
        );
    }

    private function smallImage(): UploadedFile
    {
        if (function_exists('imagecreatetruecolor')) {
            return UploadedFile::fake()->image('small.png', 10, 10);
        }

        return UploadedFile::fake()->createWithContent(
            'small.png',
            file_get_contents($this->fixturePath('small-10x10.png')),
        );
    }

    private function validate(UploadedFile $file): ValidatorContract
    {
        return Validator::make(
            ['image' => $file],
            ['image' => [new MaxImageDimensions(4096)]],
        );
    }

    /**
     * The mutation target: change max(...) to min(...) in the rule and this
     * is the test that goes red (a 4200x10 stripe's shorter edge is under
     * 4096, so min() would wrongly wave it through).
     */
    public function test_a_4200px_wide_image_fails_with_the_tenant_friendly_message(): void
    {
        $validator = $this->validate($this->stripeImage());

        $this->assertTrue($validator->fails());
        $this->assertSame(
            'That image is very large — please use one up to 4096 pixels on its longest side.',
            $validator->errors()->first('image'),
        );
    }

    public function test_a_10x10_image_passes(): void
    {
        $validator = $this->validate($this->smallImage());

        $this->assertFalse($validator->fails());
    }

    /**
     * getimagesize() on unreadable input returns false rather than
     * throwing/warning (confirmed on the pinned binary) — the rule must
     * turn that into its own friendly message, not let a PHP warning or a
     * null-array-offset error surface instead.
     */
    public function test_a_non_image_file_fails_with_the_unreadable_image_message_not_a_php_warning(): void
    {
        $junk = UploadedFile::fake()->create('not-a-photo.jpg', 5); // random bytes, not real image data

        $validator = $this->validate($junk);

        $this->assertTrue($validator->fails());
        $this->assertSame(
            'We could not read that image. Please upload a JPEG, PNG or WebP photo.',
            $validator->errors()->first('image'),
        );
    }
}

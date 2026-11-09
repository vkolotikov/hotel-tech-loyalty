<?php

namespace App\Services\Media;

use Illuminate\Support\Facades\Storage;

final class CloudUploads
{
    public function __construct(private ObjectStore $objects, private Archive $archive) {}

    /** Unique new key only. A private verified recovery copy must exist before a URL is handed to its caller. */
    public function write(string $disk, string $key, array $copy): void
    {
        Mutex::run($this->objects->fingerprint($disk).':'.$key, function () use ($disk, $key, $copy) {
            if ($this->objects->exists($disk, $key)) throw new \RuntimeException('media_key_already_exists');
            $this->archive->capture($disk, $key, $copy);
            rewind($copy['stream']);
            $this->objects->put($disk, $key, $copy['stream'], $copy['mime']);
            if (!$this->objects->matches($disk, $key, $copy['sha256'])) throw new \RuntimeException('media_upload_mismatch');
        });
    }

    public function delete(string $disk, string $key): void
    {
        Mutex::run($this->objects->fingerprint($disk).':'.$key, function () use ($disk, $key) {
            if (!$this->objects->exists($disk, $key)) return;
            $copy = $this->objects->snapshot($disk, $key);
            try {
                $this->archive->capture($disk, $key, $copy);
                // Retire before delete: an ambiguous provider timeout must not lose recovery eligibility.
                $this->archive->retire($disk, $key, $copy['sha256']);
                $this->objects->delete($disk, $key);
            } finally { fclose($copy['stream']); }
        });
    }
}

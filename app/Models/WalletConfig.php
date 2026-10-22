<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Per-org Apple + Google Wallet config. One row per organization.
 *
 * Sensitive fields:
 *  - apple_cert_password is auto-encrypted via Laravel's Crypt on
 *    write, auto-decrypted on read. The raw DB value is ciphertext.
 *  - The three files (HexaTech Loyalty release 3 §2, R3-1) live in the
 *    row, not on the disk, which Laravel Cloud loses on every deploy:
 *    `apple_cert_content` (the Pass Type ID .p12), `apple_wwdr_content`,
 *    `google_service_account_content`. Each holds the file's bytes in
 *    base64 under Laravel's `encrypted` cast — base64 so the binary .p12
 *    (and a DER certificate the full admin stores as sent) is plain text
 *    to the encrypter, one form for all three. Read and written only
 *    through fileBytes() / putFile(); hidden from every array or JSON form.
 *  - The old path columns (`*_path`, storage/app/wallet/{org_id}/* on the
 *    private local disk) are no longer written. A file still on that disk
 *    is taken into its column the first time the row is read
 *    (takeLocalFiles), then the path and the file are left alone.
 */
class WalletConfig extends Model
{
    use BelongsToOrganization;

    /** Each file's column, and the path column it replaces (still read for a file uploaded before release 3). */
    public const FILES = [
        'apple_cert'             => ['content' => 'apple_cert_content', 'path' => 'apple_cert_path'],
        'apple_wwdr'             => ['content' => 'apple_wwdr_content', 'path' => 'apple_wwdr_path'],
        'google_service_account' => ['content' => 'google_service_account_content', 'path' => 'google_service_account_path'],
    ];

    protected $fillable = [
        'organization_id',
        'apple_pass_type_id', 'apple_team_id', 'apple_organization_name',
        'apple_cert_path', 'apple_cert_password', 'apple_wwdr_path',
        'apple_pass_background_color', 'apple_pass_foreground_color', 'apple_pass_label_color',
        'google_issuer_id', 'google_class_suffix', 'google_service_account_path',
        'is_active',
    ];

    /** Secrets never leave the server, not even in a model dumped to a log. */
    protected $hidden = [
        'apple_cert_password', 'apple_cert_content', 'apple_wwdr_content', 'google_service_account_content',
    ];

    protected $casts = [
        'is_active'                      => 'boolean',
        'apple_cert_content'             => 'encrypted',
        'apple_wwdr_content'             => 'encrypted',
        'google_service_account_content' => 'encrypted',
    ];

    protected static function booted(): void
    {
        // Every read of a row, whoever reads it (the settings, the readiness, the member's pass), finds a file
        // uploaded before release 3 already in the database.
        static::retrieved(fn (WalletConfig $config) => $config->takeLocalFiles());
    }

    // Transparently encrypt the .p12 password at rest.
    protected function appleCertPassword(): Attribute
    {
        return Attribute::make(
            get: fn ($value) => $value === null ? null : (function () use ($value) {
                try { return Crypt::decryptString($value); }
                // Fail-open on legacy plain values rather than 500-ing
                // the endpoint — admins can re-save to encrypt.
                catch (\Throwable $e) { return $value; }
            })(),
            set: fn ($value) => $value === null ? null : Crypt::encryptString((string) $value),
        );
    }

    /** Whether the row holds the file (`apple_cert`, `apple_wwdr`, `google_service_account`), without decrypting it. */
    public function hasFile(string $file): bool
    {
        return !empty($this->getAttributes()[self::FILES[$file]['content']] ?? null);
    }

    /**
     * The file's bytes from the row; null when the row holds none, or holds one that no longer decrypts (an APP_KEY
     * changed without APP_PREVIOUS_KEYS) or decodes.
     */
    public function fileBytes(string $file): ?string
    {
        if (!$this->hasFile($file)) {
            return null;
        }
        try {
            $encoded = $this->getAttribute(self::FILES[$file]['content']);
        } catch (\Throwable) {
            return null;
        }
        $bytes = is_string($encoded) ? base64_decode($encoded, true) : false;

        return $bytes === false ? null : $bytes;
    }

    /** Set the file's bytes (encrypted when saved); the caller saves. */
    public function putFile(string $file, string $bytes): static
    {
        $this->setAttribute(self::FILES[$file]['content'], base64_encode($bytes));

        return $this;
    }

    /**
     * Take each file uploaded before release 3 — its path named, its column empty, the file still on the local disk —
     * into the database, once; the path and the file are then left alone, and the column is the source from then on.
     * A path whose file is gone (every deploy on Laravel Cloud) stays as it is: readiness names it `*_gone`.
     */
    public function takeLocalFiles(): void
    {
        $taken = false;
        foreach (self::FILES as $file => $columns) {
            $path = $this->getAttributes()[$columns['path']] ?? null;
            if ($this->hasFile($file) || !is_string($path) || $path === '') {
                continue;
            }
            try {
                $disk = Storage::disk('local');
                if (!$disk->exists($path)) {
                    continue;
                }
                $this->putFile($file, (string) $disk->get($path));
                $taken = true;
            } catch (\Throwable $e) {
                // Which file, never what it holds or where.
                Log::warning('Wallet file could not be taken into the database', ['organization_id' => $this->organization_id, 'file' => $file]);
            }
        }
        if ($taken && $this->exists) {
            try {
                $this->saveQuietly();
            } catch (\Throwable $e) {
                // This read still has the files; the next read tries the write again.
                Log::warning('Wallet files could not be saved into the database', ['organization_id' => $this->organization_id]);
            }
        }
    }

    public function appleReady(): bool
    {
        return $this->is_active
            && $this->apple_pass_type_id
            && $this->apple_team_id
            && $this->hasFile('apple_cert')
            && $this->hasFile('apple_wwdr');
    }

    public function googleReady(): bool
    {
        return $this->is_active
            && $this->google_issuer_id
            && $this->google_class_suffix
            && $this->hasFile('google_service_account');
    }
}

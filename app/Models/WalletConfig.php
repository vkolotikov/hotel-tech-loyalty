<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;

/**
 * Per-org Apple + Google Wallet config. One row per organization.
 *
 * Sensitive fields:
 *  - apple_cert_password is auto-encrypted via Laravel's Crypt on
 *    write, auto-decrypted on read. The raw DB value is ciphertext.
 *  - Cert file paths point at storage/app/wallet/{org_id}/* on the
 *    private disk — never served publicly.
 */
class WalletConfig extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id',
        'apple_pass_type_id', 'apple_team_id', 'apple_organization_name',
        'apple_cert_path', 'apple_cert_password', 'apple_wwdr_path',
        'apple_pass_background_color', 'apple_pass_foreground_color', 'apple_pass_label_color',
        'google_issuer_id', 'google_class_suffix', 'google_service_account_path',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

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

    public function appleReady(): bool
    {
        return $this->is_active
            && $this->apple_pass_type_id
            && $this->apple_team_id
            && $this->apple_cert_path
            && $this->apple_wwdr_path;
    }

    public function googleReady(): bool
    {
        return $this->is_active
            && $this->google_issuer_id
            && $this->google_class_suffix
            && $this->google_service_account_path;
    }
}

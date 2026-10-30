<?php

namespace App\Services\Wallet;

use App\Models\{LoyaltyMember, Organization, WalletConfig, WalletPass};
use App\Services\{AppleWalletService, GoogleWalletService};
use App\Services\Loyalty\Access\AccessDecision;
use Illuminate\Support\Facades\DB;

final class Passes
{
    public function eligible(LoyaltyMember $member): bool
    {
        $member->loadMissing('organization');
        $industry = $member->organization?->resolved_industry ?? Organization::DEFAULT_INDUSTRY;
        return app(\App\Services\IndustryPrompts\IndustryPromptService::class)->for($industry)->hasLoyalty
            && app(AccessDecision::class)->decide($member)->granted;
    }

    public function issue(LoyaltyMember $member, WalletConfig $config, string $provider): WalletPass
    {
        abort_unless((int) $config->organization_id === (int) $member->organization_id, 404);
        abort_unless($this->eligible($member), 403, 'This membership is not active.');
        $pass = WalletPass::query()->firstOrCreate([
            'organization_id' => $member->organization_id, 'member_id' => $member->id, 'provider' => $provider,
        ], [
            'type_id' => $this->type($config, $provider),
            'serial' => $provider === 'apple' ? 'm'.$member->id.'_'.($member->member_number ?: $member->id)
                : $config->google_issuer_id.'.member_'.$member->organization_id.'_'.$member->id,
            'authentication_token' => $provider === 'apple' ? bin2hex(random_bytes(32)) : null,
        ]);
        $this->assertIdentity($pass, $config);
        return $this->refresh($pass, $config);
    }

    public function type(WalletConfig $config, string $provider): string
    {
        return $provider === 'apple' ? (string) $config->apple_pass_type_id : $config->google_issuer_id.'.'.$config->google_class_suffix;
    }

    public function assertIdentity(WalletPass $pass, WalletConfig $config): void
    {
        if ((int) $pass->organization_id !== (int) $config->organization_id || $pass->type_id !== $this->type($config, $pass->provider)) {
            throw new \RuntimeException('wallet_identity_changed');
        }
    }

    /** A deleted/merged member produces a generic void pass; its device never gains the survivor's identity. */
    public function member(WalletPass $pass): LoyaltyMember
    {
        $member = $pass->member_id ? LoyaltyMember::withoutGlobalScopes()->where('organization_id', $pass->organization_id)
            ->with(['user', 'tier', 'organization'])->find($pass->member_id) : null;
        if ($member) return $member;
        $member = new LoyaltyMember(['organization_id' => $pass->organization_id, 'is_active' => false]);
        $member->setRelation('user', null)->setRelation('tier', null)
            ->setRelation('organization', Organization::withoutGlobalScopes()->find($pass->organization_id));
        return $member;
    }

    public function payload(WalletPass $pass, WalletConfig $config): array
    {
        $this->assertIdentity($pass, $config);
        $member = $this->member($pass);
        $valid = $config->is_active && $member->exists && $this->eligible($member);
        $payload = $pass->provider === 'apple'
            ? app(AppleWalletService::class)->payload($member, $config)
            : app(GoogleWalletService::class)->payload($member, $config);
        if ($pass->provider === 'apple') {
            $payload['serialNumber'] = $pass->serial;
            $payload['authenticationToken'] = $pass->authentication_token;
            $payload['webServiceURL'] = rtrim(config('app.url'), '/').'/api/wallet/apple';
            $payload['voided'] = !$valid;
            if (!$valid) {
                unset($payload['barcode'], $payload['barcodes']);
                $payload['storeCard'] = ['primaryFields' => [['key' => 'status', 'label' => 'MEMBERSHIP', 'value' => 'Inactive']]];
            }
        } else {
            $payload['id'] = $pass->serial;
            $payload['classId'] = $pass->type_id;
            $payload['state'] = $valid ? 'ACTIVE' : 'INACTIVE';
            if (!$valid) {
                $payload['accountName'] = 'Inactive membership';
                $payload['accountId'] = '';
                $payload['loyaltyPoints']['balance'] = ['int' => 0];
                $payload['secondaryLoyaltyPoints']['balance'] = ['string' => 'Inactive'];
                // Explicit replacement clears the old QR on PATCH, unlike omitting the field.
                $payload['barcode'] = ['type' => 'QR_CODE', 'value' => 'inactive:'.$pass->id, 'alternateText' => 'Inactive'];
            }
        }
        return $payload;
    }

    public function refresh(WalletPass $pass, WalletConfig $config): WalletPass
    {
        // Serialize revision calculation; no provider I/O under this row lock.
        return DB::transaction(function () use ($pass, $config) {
            $row = WalletPass::query()->lockForUpdate()->findOrFail($pass->id);
            $hash = hash('sha256', json_encode([$this->payload($row, $config), Artwork::logoUrl((int) $row->organization_id)], JSON_THROW_ON_ERROR));
            if ($row->content_hash !== $hash) {
                $row->forceFill(['content_hash' => $hash, 'revision' => $row->revision + 1,
                    'next_attempt_at' => null, 'attempts' => 0])->save();
            }
            return $row;
        });
    }
}

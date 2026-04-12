<?php

namespace App\Services;

use App\Models\LoyaltyMember;
use Endroid\QrCode\Builder\Builder;
use Endroid\QrCode\Encoding\Encoding;
use Endroid\QrCode\ErrorCorrectionLevel;
use Endroid\QrCode\RoundBlockSizeMode;
use Endroid\QrCode\Writer\PngWriter;
use Illuminate\Support\Str;

class QrCodeService
{
    /**
     * Generate a secure QR token for a member.
     */
    public function generateToken(LoyaltyMember $member): string
    {
        $token = hash_hmac(
            'sha256',
            $member->id . '|' . $member->member_number . '|' . now()->timestamp,
            config('app.key')
        );

        $member->update(['qr_code_token' => $token]);

        return $token;
    }

    /**
     * Generate a static QR code image for a member number (base64 PNG).
     * This QR is permanent and encodes the member number for staff scanning.
     */
    public function generateStaticQr(string $memberNumber): string
    {
        $payload = json_encode([
            'type'          => 'hotel_loyalty',
            'member_number' => $memberNumber,
            'version'       => 2,
        ]);

        return $this->buildQrPng($payload);
    }

    /**
     * Generate a QR code image as base64 PNG (legacy rotating tokens).
     */
    public function generateQrImage(string $token): string
    {
        $payload = json_encode([
            'type'      => 'hotel_loyalty',
            'token'     => $token,
            'version'   => 1,
            'timestamp' => now()->timestamp,
        ]);

        return $this->buildQrPng($payload);
    }

    private function buildQrPng(string $data): string
    {
        $result = Builder::create()
            ->writer(new PngWriter())
            ->writerOptions([])
            ->data($data)
            ->encoding(new Encoding('UTF-8'))
            ->errorCorrectionLevel(ErrorCorrectionLevel::High)
            ->size(300)
            ->margin(10)
            ->roundBlockSizeMode(RoundBlockSizeMode::Margin)
            ->build();

        return base64_encode($result->getString());
    }

    /**
     * Validate a QR token and return the member if valid.
     */
    public function validateToken(string $token): ?LoyaltyMember
    {
        return LoyaltyMember::where('qr_code_token', $token)
            ->where('is_active', true)
            ->with(['user', 'tier'])
            ->first();
    }

    /**
     * Generate a new random referral code.
     */
    public function generateReferralCode(): string
    {
        do {
            $code = strtoupper(Str::random(8));
        } while (LoyaltyMember::where('referral_code', $code)->exists());

        return $code;
    }

    /**
     * Generate a member number.
     */
    public function generateMemberNumber(): string
    {
        $year = now()->year;
        $count = LoyaltyMember::count() + 1;
        return sprintf('HL-%d-%06d', $year, $count);
    }
}

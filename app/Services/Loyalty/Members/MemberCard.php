<?php

namespace App\Services\Loyalty\Members;

use App\Models\LoyaltyMember;
use App\Services\QrCodeService;

/**
 * The member's card for the desk to show or print (spec 2026-10-21 release 2 §4.1): the static QR code the member
 * app shows — the v2 JSON naming the member number, which the workspace's own Scan reads (CardLookup) — drawn as SVG,
 * so it never needs the GD extension the full admin's PNG (`GET members/{id}/qr`) fails without.
 */
final class MemberCard
{
    public function __construct(private readonly QrCodeService $qr)
    {
    }

    /** @return array{member_number: string, name: string, qr_svg: string} */
    public function of(LoyaltyMember $member): array
    {
        $member->loadMissing('user');
        $number = (string) $member->member_number;

        return [
            'member_number' => $number,
            'name'          => (string) ($member->user?->name ?? ''),
            'qr_svg'        => 'data:image/svg+xml;base64,' . base64_encode($this->qr->generateStaticQrSvg($number)),
        ];
    }
}

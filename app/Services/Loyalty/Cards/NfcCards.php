<?php

namespace App\Services\Loyalty\Cards;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\NfcCard;
use App\Models\Organization;
use App\Models\User;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\Members\MemberErasure;
use App\Services\Loyalty\Members\MemberStatus;
use App\Services\Loyalty\Members\OwnAccount;
use App\Support\AdvisoryLock;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The shared writer for NFC tags and assignments, used by Loyalty and the full admin. A tag can belong to only one
 * physical card across organisations. Older rows can contain separators or uppercase, so comparisons use CodeReader.
 * Issuing, reissuing or pairing a physical card never changes a member's personal QR or wallet pass.
 */
final class NfcCards
{
    public const SCAN_PREFIX = 'HTCARD:';
    public const PRINT_PREFIX = self::SCAN_PREFIX.'PRINT:';

    /** @return Collection<int, NfcCard> */
    public function forMember(LoyaltyMember $member): Collection
    {
        return NfcCard::query()->where('member_id', $member->id)
            ->where(fn ($rows) => $rows->whereNotNull('uid')->orWhereNotNull('card_batch_id'))
            ->orderByDesc('is_active')->orderByDesc('issued_at')->orderByDesc('id')->get();
    }

    /**
     * A new row uses $cardType. A reused row keeps its type.
     * @return array{card: NfcCard, linked: bool} The flag is false for the member's already-linked card.
     */
    public function link(LoyaltyMember $member, string $entry, User $by, string $cardType = 'standard', string $via = 'loyalty', bool $audited = true): array
    {
        return $this->withUid($entry, function (array $forms) use ($member, $by, $cardType, $via, $audited) {
            $how = ['via' => $via, 'audited' => $audited];
            $answer = $this->linkKnown($member, $forms, $by, $how);
            if ($answer !== null) {
                return $answer;
            }

            try {
                // A savepoint lets us read the winner on PostgreSQL after a unique constraint violation.
                $card = DB::transaction(fn () => NfcCard::create([
                    'member_id' => $member->id,
                    'uid'       => $forms[0],
                    'card_type' => $cardType,
                    'issued_at' => now(),
                    'issued_by' => $by->id,
                    'is_active' => true,
                ]));
            } catch (UniqueConstraintViolationException $e) {
                return $this->linkKnown($member, $forms, $by, $how) ?? throw $e;
            }

            if ($audited) {
                AuditLog::record('nfc_card_linked', $card, ['member_id' => $member->id, 'uid' => $card->uid, 'via' => $via], [], $by);
            }

            return ['card' => $card, 'linked' => true];
        });
    }

    public function printed(int $id): NfcCard
    {
        return NfcCard::query()->printed()->find($id) ?? throw LoyaltyRefused::notFound();
    }

    /** Reserve this tag for the numbered card, even when the recipient is still unknown. */
    public function pairPrinted(int $id, string $entry, ?string $expectedUid, User $by, bool $replaceActive = false): NfcCard
    {
        return $this->withUid($entry, function (array $forms) use ($id, $expectedUid, $by, $replaceActive) {
            $card = $this->lockPrinted($id);
            $this->setPrintedUid($card, $forms, $expectedUid, $by, $replaceActive);

            return $card;
        }, $expectedUid);
    }

    /** Assignment by printed number works with or without a paired tag. */
    public function assignPrinted(int $id, int $memberId, User $by, ?string $entry = null, ?string $expectedUid = null): NfcCard
    {
        $assign = function (?array $forms) use ($id, $memberId, $by, $expectedUid) {
            $member = LoyaltyMember::query()->with('user')->lockForUpdate()->find($memberId) ?? throw LoyaltyRefused::notFound();
            if (MemberErasure::isErased($member) || MemberErasure::isSelfDeleted($member)) {
                throw new LoyaltyRefused('already_erased', 'This member was deleted.', 409);
            }
            MemberStatus::assertActive($member);

            // The member is always locked before the card, including when we pair a tag in the same write.
            $card = $this->lockPrinted($id);
            if ($forms !== null) {
                $this->setPrintedUid($card, $forms, $expectedUid, $by);
            }
            if ($card->is_active && (int) $card->member_id === (int) $member->id) {
                return $card;
            }

            return $this->activate($card, $member, $by, ['via' => 'physical_cards', 'audited' => true])
                ?? throw new LoyaltyRefused('card_in_use', 'This card is linked to another member.', 409);
        };

        return $entry === null
            ? DB::transaction(fn () => $assign(null))
            : $this->withUid($entry, $assign, $expectedUid);
    }

    /** @return Collection<int, NfcCard> Only matches the signed-in organisation is allowed to inspect. */
    public function findTags(string $entry): Collection
    {
        return NfcCard::query()->whereIn(DB::raw(CodeReader::UID_SQL), self::uidForms($entry))
            ->orderBy('id')->with('member.user')->get();
    }

    /** Free the tag for reuse while keeping any printed card and its assignment. */
    public function releaseTag(int $id, string $expectedUid, User $by): void
    {
        // The lookup includes the stored UID. Treat a numeric UID returned there as hex.
        $expected = CodeReader::hexUid($expectedUid) ?? throw new LoyaltyRefused('bad_uid', 'This is not a card ID.', 422);
        $entry = implode(':', str_split($expected, 2));

        $this->withUid($entry, function () use ($id, $expected, $by) {
            $card = NfcCard::query()->lockForUpdate()->find($id) ?? throw LoyaltyRefused::notFound();
            if ($card->uid === null) {
                return;
            }
            if (CodeReader::hexUid($card->uid) !== $expected) {
                throw new LoyaltyRefused('card_changed', 'The saved NFC ID has changed. Reopen this card.', 409);
            }

            $old = ['uid' => $card->uid, 'is_active' => $card->is_active];
            $card->update(['uid' => null, 'is_active' => $card->card_batch_id !== null && $card->is_active]);
            AuditLog::record('nfc_tag_released', $card, ['number' => $card->printed_number], $old, $by);
        });
    }

    /** A member erasure returns numbered stock and removes legacy cards. Called with the member locked. */
    public function forgetMember(LoyaltyMember $member): void
    {
        $cards = NfcCard::query()->where('member_id', $member->id);
        (clone $cards)->printed()->update([
            'member_id' => null,
            'is_active' => false,
            'issued_by' => null,
            'scan_count' => 0,
            'last_scanned_at' => null,
            'last_scanned_by' => null,
        ]);
        $cards->whereNull('card_batch_id')->delete();
    }

    public static function scanCode(NfcCard $card): string
    {
        return $card->printed_qr_token !== null
            ? self::PRINT_PREFIX.$card->printed_qr_token
            : self::SCAN_PREFIX.(CodeReader::hexUid((string) $card->uid) ?? (string) $card->uid);
    }

    public static function printedRow(NfcCard $card): array
    {
        $member = self::memberOn($card);

        return [
            'id'       => (int) $card->id,
            'batch_id' => (int) $card->card_batch_id,
            'number'   => $card->printed_number,
            'uid'      => $card->uid,
            'status'   => $member === null ? 'unassigned' : ($card->is_active ? 'assigned' : 'disabled'),
            'member'   => $member,
        ];
    }

    public static function tagRow(NfcCard $card): array
    {
        return [
            'id' => (int) $card->id,
            'number' => $card->printed_number,
            'uid' => $card->uid,
            'member' => self::memberOn($card),
        ];
    }

    private static function memberOn(NfcCard $card): ?array
    {
        $card->loadMissing('member.user');
        $member = $card->member;
        $user = $member?->user;

        return $member === null ? null : [
            'id'     => (int) $member->id,
            'name'   => $user instanceof User && OwnAccount::is($user, (int) $card->organization_id) ? $user->name : null,
            'number' => $member->member_number,
        ];
    }

    /** Switch one of the member's cards off (again: nothing changes). */
    public function switchOff(LoyaltyMember $member, int $cardId, User $by): NfcCard
    {
        $card = NfcCard::query()->where('member_id', $member->id)->find($cardId) ?? throw LoyaltyRefused::notFound();

        $changed = NfcCard::query()->whereKey($card->id)->where('member_id', $member->id)->where('is_active', true)->update(['is_active' => false]);
        if ($changed === 1) {
            AuditLog::record('nfc_deactivated', $member, ['uid' => $card->uid, 'card_id' => $card->id, 'via' => 'loyalty'], [], $by);
        }

        return $card->fresh();
    }

    public static function row(NfcCard $card): array
    {
        return [
            'id'           => (int) $card->id,
            'uid'          => CodeReader::hexUid((string) $card->uid) ?? (string) $card->uid,
            'is_active'    => (bool) $card->is_active,
            'linked_at'    => $card->issued_at?->toIso8601String() ?? $card->created_at?->toIso8601String(),
            'last_used_at' => $card->last_scanned_at?->toIso8601String(),
            'scans'        => (int) $card->scan_count,
        ] + ($card->printed_number !== null ? ['number' => $card->printed_number] : []);
    }

    /**
     * @param list<string> $forms
     * @param array{via: string, audited: bool} $how
     * @return array{card: NfcCard, linked: bool}|null
     */
    private function linkKnown(LoyaltyMember $member, array $forms, User $by, array $how, bool $again = true): ?array
    {
        $rows = $this->withMatchingUid($forms);
        if ($rows->isEmpty()) {
            return null;
        }
        $org = (int) $member->organization_id;
        if ($rows->contains(fn (NfcCard $c) => (int) $c->organization_id !== $org)) {
            throw new LoyaltyRefused('card_elsewhere', 'This card cannot be linked here.', 409);
        }
        if ($rows->contains(fn (NfcCard $c) => $c->is_active && (int) $c->member_id !== (int) $member->id)) {
            throw new LoyaltyRefused('card_in_use', 'This card is linked to another member.', 409);
        }
        $own = $rows->first(fn (NfcCard $c) => $c->is_active);
        if ($own) {
            return ['card' => NfcCard::query()->findOrFail($own->id), 'linked' => false];
        }

        // Reuse the switched-off row, preferring the first form read by CodeReader.
        $off = collect($forms)->map(fn (string $uid) => $rows->first(fn (NfcCard $c) => CodeReader::hexUid((string) $c->uid) === $uid))->filter()->first()
            ?? $rows->first();
        $card = $this->activate($off, $member, $by, $how);
        if (!$card) {
            return $again ? $this->linkKnown($member, $forms, $by, $how, false)
                : throw new LoyaltyRefused('card_in_use', 'This card is linked to another member.', 409);
        }

        return ['card' => $card, 'linked' => true];
    }

    /** @param array{via: string, audited: bool} $how */
    private function activate(NfcCard $off, LoyaltyMember $member, User $by, array $how): ?NfcCard
    {
        $sameMember = (int) $off->member_id === (int) $member->id;
        $changes = ['member_id' => $member->id, 'is_active' => true, 'issued_at' => now(), 'issued_by' => $by->id]
            + ($sameMember ? [] : ['scan_count' => 0, 'last_scanned_at' => null, 'last_scanned_by' => null]);
        // An unassigned card may have had its tag changed since an older UID-based linking request read it.
        $changed = NfcCard::query()->whereKey($off->id)->where('is_active', false)->where('uid', $off->uid)->update($changes);
        if ($changed !== 1) {
            return null;
        }

        $card = NfcCard::query()->findOrFail($off->id);
        if ($how['audited']) {
            AuditLog::record('nfc_card_linked', $card, [
                'member_id' => $member->id, 'uid' => $card->uid, 'via' => $how['via'], 'relinked' => $off->member_id !== null,
            ], ['member_id' => $off->member_id, 'is_active' => false], $by);
        }

        return $card;
    }

    /**
     * @param list<string> $forms
     * @return Collection<int, NfcCard>
     */
    private function withMatchingUid(array $forms): Collection
    {
        return NfcCard::withoutGlobalScopes()->whereIn(DB::raw(CodeReader::UID_SQL), $forms)->orderBy('id')->get();
    }

    private function lockPrinted(int $id): NfcCard
    {
        return NfcCard::query()->printed()->lockForUpdate()->find($id) ?? throw LoyaltyRefused::notFound();
    }

    /** @param list<string> $forms */
    private function setPrintedUid(NfcCard $card, array $forms, ?string $expectedUid, User $by, bool $replaceActive = false): void
    {
        if ($card->uid !== null) {
            if (in_array(CodeReader::hexUid($card->uid), $forms, true)) {
                return;
            }
            if ($card->is_active && !$replaceActive) {
                throw new LoyaltyRefused('card_in_use', 'An owner or manager can replace an assigned card’s tag.', 409);
            }
        }
        if ($card->uid !== $expectedUid) {
            throw new LoyaltyRefused('card_changed', 'The saved NFC ID has changed. Reopen this card.', 409);
        }

        $matches = $this->withMatchingUid($forms)->where('id', '!=', $card->id);
        $foreign = $matches->filter(fn (NfcCard $c) => (int) $c->organization_id !== (int) $card->organization_id);
        if ($foreign->isNotEmpty()) {
            // Only verified platform operators may identify the company. A release still runs in its own scope.
            $organisations = $foreign->pluck('organization_id')->unique()->values();
            $company = $by->isPlatformAdmin() && $organisations->count() === 1
                ? Organization::query()->whereKey($organisations->first())->value('name')
                : null;
            throw new LoyaltyRefused('card_elsewhere', 'This tag is already registered to another company.', 409,
                is_string($company) && $company !== '' ? ['source_company' => $company] : []);
        }
        if ($matches->isNotEmpty()) {
            throw new LoyaltyRefused('card_in_use', 'This NFC ID is already registered to another card.', 409, ['tag_in_use' => true]);
        }

        $previous = $card->uid;
        $card->update(['uid' => $forms[0]]);
        AuditLog::record('nfc_card_paired', $card, ['number' => $card->printed_number, 'uid' => $card->uid], ['uid' => $previous], $by);
    }

    /** @return list<string> */
    private static function uidForms(string $entry): array
    {
        $read = CodeReader::cardUid($entry) ?? throw new LoyaltyRefused('bad_uid', 'This is not a card ID.', 422);

        return [$read['uid'], ...$read['also']];
    }

    /**
     * Pairing and legacy linking share the same locks, including the other byte order of a tag ID.
     * @template T
     * @param callable(list<string>): T $write
     * @return T
     */
    private function withUid(string $entry, callable $write, ?string $expectedUid = null): mixed
    {
        $forms = self::uidForms($entry);
        $previous = $expectedUid === null ? null : CodeReader::hexUid($expectedUid);
        $keys = array_unique($previous === null ? $forms : [...$forms, $previous, CodeReader::reversed($previous) ?? $previous]);
        sort($keys, SORT_STRING);

        return DB::transaction(function () use ($keys, $forms, $write) {
            foreach ($keys as $uid) {
                AdvisoryLock::within("nfc:uid:{$uid}");
            }

            return $write($forms);
        });
    }
}

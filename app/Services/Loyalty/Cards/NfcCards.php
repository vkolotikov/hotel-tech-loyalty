<?php

namespace App\Services\Loyalty\Cards;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\NfcCard;
use App\Models\User;
use App\Services\Loyalty\LoyaltyRefused;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * A member's NFC cards in HexaTech Loyalty (release 5, spec 2026-10-23 §3, R5-2): link a card, list the member's
 * cards, switch a lost one off. One active card belongs to one member of the organisation.
 *
 * `nfc_cards.uid` is unique across every organisation (`nfc_cards_uid_unique`), and rows written before may hold
 * separators or upper case. So a card is always compared by its normalised ID (CodeReader::UID_SQL), in every form
 * it may be stored under (CodeReader::cardUid: the other byte order, the other reading of digits), against every
 * organisation's rows:
 *  - another organisation has it: refused (`card_elsewhere`), never saying whose;
 *  - active for another member here: refused (`card_in_use`), naming nobody;
 *  - active for this member: answered as it is, nothing written;
 *  - switched off here: linked again by updating that row (an insert would break the unique ID);
 *  - unknown: a new row with the ID normalised (lower-case hex, no separators; a decimal entry converted).
 * A unique violation on the insert (someone linked the same card a moment before) is answered by reading the card
 * again and applying the same rules, never by the violation alone.
 *
 * Linking does not change the member's QR code (`qr_code_token`) or wallet pass. Link and switch-off are audited
 * (`nfc_card_linked`, `nfc_deactivated`, the full admin's words).
 *
 * Since release 6 (spec 2026-10-23 §2 item 2) the full admin's `nfc-cards` (ScanController::linkNfcCard) and
 * `nfc/issue` (NfcController::issue) link through link() too, in their own answers: the same normalised ID, the same
 * rules, no second row for a card stored in another form.
 */
final class NfcCards
{
    /** @return Collection<int, NfcCard> the member's cards, the active ones first, then the newest */
    public function forMember(LoyaltyMember $member): Collection
    {
        return NfcCard::query()->where('member_id', $member->id)
            ->orderByDesc('is_active')->orderByDesc('issued_at')->orderByDesc('id')->get();
    }

    /**
     * Link a card to the member (the rules above). `$cardType` is a new row's type (a card linked again keeps its
     * own); `$via` names the screen in the audit; `$audited` false leaves the audit to a caller that keeps its own
     * (the full admin's `nfc/issue` audits `nfc_issued`, as it always has).
     *
     * @return array{card: NfcCard, linked: bool} `linked` is false when it already was this member's active card
     */
    public function link(LoyaltyMember $member, string $entry, User $by, string $cardType = 'standard', string $via = 'loyalty', bool $audited = true): array
    {
        $read = CodeReader::cardUid($entry)
            ?? throw new LoyaltyRefused('bad_uid', 'This is not a card ID.', 422);
        $forms = [$read['uid'], ...$read['also']];
        $how = ['via' => $via, 'audited' => $audited];

        $answer = $this->linkKnown($member, $forms, $by, $how);
        if ($answer !== null) {
            return $answer;
        }

        try {
            $card = DB::transaction(fn () => NfcCard::create([
                'member_id' => $member->id,
                'uid'       => $read['uid'],
                'card_type' => $cardType,
                'issued_at' => now(),
                'issued_by' => $by->id,
                'is_active' => true,
            ]));
        } catch (UniqueConstraintViolationException $e) {
            // Someone stored this ID a moment ago: answer by what is stored now.
            return $this->linkKnown($member, $forms, $by, $how) ?? throw $e;
        }

        if ($audited) {
            AuditLog::record('nfc_card_linked', $card, ['member_id' => $member->id, 'uid' => $card->uid, 'via' => $via], [], $by);
        }

        return ['card' => $card, 'linked' => true];
    }

    /** Switch one of the member's cards off (again: nothing changes); 404 for a card that is not theirs. */
    public function switchOff(LoyaltyMember $member, int $cardId, User $by): NfcCard
    {
        $card = NfcCard::query()->where('member_id', $member->id)->find($cardId) ?? throw LoyaltyRefused::notFound();

        $changed = NfcCard::query()->whereKey($card->id)->where('member_id', $member->id)->where('is_active', true)->update(['is_active' => false]);
        if ($changed === 1) {
            AuditLog::record('nfc_deactivated', $member, ['uid' => $card->uid, 'card_id' => $card->id, 'via' => 'loyalty'], [], $by);
        }

        return $card->fresh();
    }

    /** A card as the member's page shows it. */
    public static function row(NfcCard $card): array
    {
        return [
            'id'           => (int) $card->id,
            'uid'          => CodeReader::hexUid((string) $card->uid) ?? (string) $card->uid,
            'is_active'    => (bool) $card->is_active,
            'linked_at'    => $card->issued_at?->toIso8601String() ?? $card->created_at?->toIso8601String(),
            'last_used_at' => $card->last_scanned_at?->toIso8601String(),
            'scans'        => (int) $card->scan_count,
        ];
    }

    /**
     * The rules for an ID some row already holds, in any organisation; null when no row does.
     *
     * @param list<string> $forms
     * @param array{via: string, audited: bool} $how
     * @return array{card: NfcCard, linked: bool}|null
     */
    private function linkKnown(LoyaltyMember $member, array $forms, User $by, array $how, bool $again = true): ?array
    {
        $rows = NfcCard::withoutGlobalScopes()->whereIn(DB::raw(CodeReader::UID_SQL), $forms)->orderBy('id')->get();
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

        // Switched off here: the same row is linked again, the first form read preferred.
        $off = collect($forms)->map(fn (string $f) => $rows->first(fn (NfcCard $c) => CodeReader::hexUid((string) $c->uid) === $f))->filter()->first() ?? $rows->first();
        $sameMember = (int) $off->member_id === (int) $member->id;
        $changes = ['member_id' => $member->id, 'is_active' => true, 'issued_at' => now(), 'issued_by' => $by->id]
            // A card passed to someone else starts its own use: the last owner's scans are not this member's.
            + ($sameMember ? [] : ['scan_count' => 0, 'last_scanned_at' => null, 'last_scanned_by' => null]);
        $changed = NfcCard::query()->whereKey($off->id)->where('is_active', false)->update($changes);
        if ($changed !== 1) {
            // Linked by someone else between the read and the write: the rules again, once, on what is there now.
            return $again ? $this->linkKnown($member, $forms, $by, $how, false)
                : throw new LoyaltyRefused('card_in_use', 'This card is linked to another member.', 409);
        }
        $card = NfcCard::query()->findOrFail($off->id);
        if ($how['audited']) {
            AuditLog::record('nfc_card_linked', $card, ['member_id' => $member->id, 'uid' => $card->uid, 'via' => $how['via'], 'relinked' => true],
                ['member_id' => (int) $off->member_id, 'is_active' => false], $by);
        }

        return ['card' => $card, 'linked' => true];
    }
}

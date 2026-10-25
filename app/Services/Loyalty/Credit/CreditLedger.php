<?php

namespace App\Services\Loyalty\Credit;

use App\Models\AuditLog;
use App\Models\CreditTransaction;
use App\Models\LoyaltyMember;
use App\Models\Organization;
use App\Models\User;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\Members\MemberErasure;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\Loyalty\Visits\Visit;
use App\Services\Portal\PortalBootstrap;
use App\Services\StripeService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Cashback credit (release 7, spec 2026-10-25 §3, owner's R7-2): money a member earns back on what they spend and
 * spends at the desk only. The only writer of `credit_transactions` and `loyalty_members.credit_balance`.
 *
 * Every write is one DB::transaction of its own (a savepoint inside a caller's), takes the member row's lock first,
 * writes its line with `balance_after` = the new balance and stores that balance on the member — so the member's latest
 * line (by id) always states their `credit_balance`, and no line ever takes the balance below zero. Every line carries
 * an idempotency key (unique per organisation, `credit_transactions_org_key_unique`): a write whose key is already
 * there writes nothing and answers the line that is. Every line carries the venue's currency, upper case.
 *
 * The arithmetic is in whole cents (integers), never in floats: decimal(12,2) holds hundredths exactly, and a
 * zero-decimal currency (Stripe's list, through StripeService::smallestUnitOf(), not a copy of it) moves in whole
 * units — its cashback is rounded down to the unit and an amount with decimals is refused. Cents, not the currency's
 * own unit, so a balance kept from before a change of currency (which relabels, never converts) loses nothing.
 *
 * The ledger names the organisation on every read and write and binds it as the tenant while it works (as
 * BookingPointsService does), so a call from a nightly run, a webhook or another tenant's request writes the member's
 * own organisation and reads its own currency.
 */
final class CreditLedger
{
    /** Lines per page on the workspace's member page. */
    public const PER_PAGE = 25;

    /** Lines the member sees (the portal, the app). */
    public const MEMBER_LINES = 20;

    /** The most one spend or correction may move, in the currency's major unit. */
    public const MAX_AMOUNT = 10_000_000;

    /** What a merge's and an erasure's lines name as their reference. */
    public const REF_MERGE = 'member_merge';
    public const REF_ERASURE = 'member_erasure';

    /** decimal(12,2)'s ceiling, in cents. */
    private const MAX_BALANCE_CENTS = 999_999_999_999;

    /**
     * Cashback on a visit with a spend (VisitRecorder is the only caller): `cashback_percent` of the amount, rounded down
     * to the cent (a zero-decimal currency: to the unit). Nothing — null — when cashback is off or the visit's venue day
     * is before the day it was switched on (ProgrammeOptions::countsVisitOn), the visit names no reference or no positive
     * amount, the cashback rounds below the smallest unit, or the member was deleted (by staff or by themselves).
     *
     * Once per reference (key `cashback_{type}_{id}`): a repeat — the nightly stay run calls again — writes nothing and
     * answers the line already written, as the first call did; a reference already earned on by another member answers
     * null. `balance` is the balance right after the line.
     *
     * @return array{line_id: int, amount: float, balance: float, currency: string}|null
     */
    public function earnCashback(LoyaltyMember $member, Visit $visit): ?array
    {
        $orgId = (int) $member->organization_id;
        if ($visit->referenceType === null || $visit->referenceId === null || $visit->amount === null || !($visit->amount > 0)) {
            return null;
        }
        // On, and the visit on or after the venue day cashback was switched on: an old booking touched again (a status
        // change, the nightly stay sweep) earns nothing for the time before the venue gave cashback.
        if (!ProgrammeOptions::countsVisitOn($orgId, 'cashback_enabled', $visit->venueDay)) {
            return null;
        }
        $percent = (float) ProgrammeOptions::get($orgId, 'cashback_percent');
        [$min, $max] = ProgrammeOptions::BOUNDS['cashback_percent'];
        if ($percent < $min || $percent > $max) {
            // A stored rate outside the options' bounds was never saved through ProgrammeOptions: no money on it.
            Log::warning('credit.cashback_percent_out_of_bounds', ['org' => $orgId, 'percent' => $percent]);

            return null;
        }

        return $this->underOrg($orgId, function () use ($member, $visit, $orgId, $percent) {
            if (self::isDeleted($member)) {
                return null;
            }
            $currency = $this->currency($orgId);
            $unit = self::unitCents($currency);
            $spent = (int) round($visit->amount * 100);
            // Percent in hundredths of a percent (5.25 → 525): cents × that ÷ 10 000, rounded down, then down to the unit.
            $earned = intdiv($spent * (int) round($percent * 100), 10000);
            $earned -= $earned % $unit;
            if ($earned < $unit) {
                return null;
            }

            $written = $this->write($member, CreditTransaction::EARN, fn () => $earned, self::earnKey($visit->referenceType, $visit->referenceId), [
                'reference_type' => $visit->referenceType,
                'reference_id'   => $visit->referenceId,
                'note'           => self::percentText($percent) . '% cashback on ' . self::decimal($spent) . ' ' . $currency,
                'created_by'     => $visit->by?->id,
            ], $currency);
            [$line, $replayed] = $written;
            if ($replayed && ((int) $line->member_id !== (int) $member->id || $line->type !== CreditTransaction::EARN)) {
                Log::warning('credit.earn_reference_taken', ['org' => $orgId, 'member' => $member->id, 'line' => $line->id]);

                return null;
            }

            return [
                'line_id'  => (int) $line->id,
                'amount'   => self::major(self::cents($line->getRawOriginal('amount'))),
                'balance'  => self::major(self::cents($line->getRawOriginal('balance_after'))),
                'currency' => (string) $line->currency,
            ];
        });
    }

    /**
     * Credit taken off at the desk (R7-2: the only way credit is spent). Refused above the balance (422 `credit_short`
     * with the balance), for a deleted member (409 `already_erased`), and for an amount that is not positive, too large,
     * or has more decimals than the currency (422 `bad_amount`). Spending needs no cashback switch: a balance earned
     * before the venue switched cashback off can still be spent. A replay of the key answers the first line.
     *
     * @return array{line: array<string, mixed>, balance: float, currency: string, replayed: bool}
     */
    public function spend(LoyaltyMember $member, float $amount, User $by, ?string $note, string $key): array
    {
        $orgId = (int) $member->organization_id;

        return $this->underOrg($orgId, function () use ($member, $amount, $by, $note, $key, $orgId) {
            $this->refuseErased($member);
            $currency = $this->currency($orgId);
            $cents = self::amountCents($amount, $currency, false);

            [$line, $replayed] = $this->write($member, CreditTransaction::SPEND, fn () => -$cents, $key, [
                'note'       => $note,
                'created_by' => $by->id,
            ], $currency);

            return $this->answer($member, $line, $replayed, CreditTransaction::SPEND);
        });
    }

    /**
     * A manager's correction (the caller checks the manager): a signed amount and the reason, never below zero (422
     * `credit_short`), never on a deleted member (409 `already_erased`); audited `credit.adjusted`. In a zero-decimal
     * currency it moves whole units, but one that takes the balance to exactly zero may move cents: a residue kept from
     * before the venue changed its currency (which relabels, never converts) can always be cleared.
     *
     * @return array{line: array<string, mixed>, balance: float, currency: string, replayed: bool}
     */
    public function adjust(LoyaltyMember $member, float $signedAmount, string $reason, User $by, string $key): array
    {
        $orgId = (int) $member->organization_id;
        $reason = trim($reason);
        if ($reason === '') {
            throw new LoyaltyRefused('reason_required', 'Say why the credit is corrected.', 422);
        }

        return $this->underOrg($orgId, function () use ($member, $signedAmount, $reason, $by, $key, $orgId) {
            $this->refuseErased($member);
            $currency = $this->currency($orgId);
            $cents = self::amountCents($signedAmount, $currency, true, false);
            $unit = self::unitCents($currency);

            [$line, $replayed] = $this->write($member, CreditTransaction::ADJUST, function (int $balance) use ($cents, $unit, $currency) {
                if ($cents % $unit !== 0 && $balance + $cents !== 0) {
                    throw self::badAmount($currency);
                }

                return $cents;
            }, $key, [
                'note'       => mb_substr($reason, 0, 500),
                'created_by' => $by->id,
            ], $currency, function (CreditTransaction $line, int $before, int $after) use ($member, $by, $reason, $currency, $orgId) {
                $this->audit($orgId, (int) $member->id, $by, 'credit.adjusted', [
                    'line_id' => (int) $line->id, 'amount' => self::major($after - $before), 'balance' => self::major($after),
                    'currency' => $currency, 'reason' => $reason,
                ], 'Credit corrected by ' . self::decimal($after - $before) . " {$currency}");
            });

            return $this->answer($member, $line, $replayed, CreditTransaction::ADJUST);
        });
    }

    /**
     * A refunded or cancelled booking (VisitRecorder::reversed()): each earn line of the reference is reversed once
     * (key `cashback_reverse_{earn line}`), by what it earned or, when the member has spent some of it, by what is left
     * — never below zero; what was already spent stays spent. The shortfall is audited `credit.reverse_short` (earned,
     * reversed, shortfall). A line that could take nothing back is still written, at 0, so a later call (or a later
     * earn of the member's) is never reversed against. The earn lines are found wherever a merge moved them.
     */
    public function reverseFor(int $orgId, string $referenceType, int $referenceId, ?User $by = null): void
    {
        $this->underOrg($orgId, function () use ($orgId, $referenceType, $referenceId, $by) {
            $earns = CreditTransaction::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('type', CreditTransaction::EARN)
                ->where('reference_type', $referenceType)
                ->where('reference_id', $referenceId)
                ->orderBy('id')
                ->get();

            foreach ($earns as $earn) {
                $member = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($earn->member_id)->first();
                if ($member === null) {
                    continue;
                }
                $earned = self::cents($earn->getRawOriginal('amount'));
                // A refund must not stay unreversed for want of a currency: the earn line's own, when the venue's is unusable.
                $currency = $this->currency($orgId, false, $earn->currency);
                $this->write($member, CreditTransaction::REVERSE, fn (int $balance) => -min($earned, max(0, $balance)), 'cashback_reverse_' . $earn->id, [
                    'reference_type' => $referenceType,
                    'reference_id'   => $referenceId,
                    'note'           => 'Cashback of ' . self::decimal($earned) . " {$earn->currency} reversed (line {$earn->id})",
                    'created_by'     => $by?->id,
                ], $currency, function (CreditTransaction $line, int $before, int $after) use ($earned, $earn, $member, $by, $currency, $orgId, $referenceType, $referenceId) {
                    $reversed = $before - $after;
                    if ($reversed >= $earned) {
                        return;
                    }
                    $this->audit($orgId, (int) $member->id, $by, 'credit.reverse_short', [
                        'line_id' => (int) $line->id, 'earn_line_id' => (int) $earn->id, 'reference' => "{$referenceType}#{$referenceId}",
                        'earned' => self::major($earned), 'reversed' => self::major($reversed), 'shortfall' => self::major($earned - $reversed),
                        'currency' => $currency,
                    ], 'Cashback reversed short: ' . self::decimal($earned - $reversed) . " {$currency} had been spent");
                });
            }
        });
    }

    /**
     * Erasure — by staff (MemberErasure) or the member's own account deletion (`$byTheMember`, the app and the portal),
     * each inside its own transaction: the balance is forfeited — an `adjust` line to zero, "Forfeited at erasure",
     * audited `credit.forfeited_on_erasure` with the amount. The ledger rows stay (money records). Nothing is written for
     * a balance of zero. A member's own deletion names no staff member on the line; the audit names the account.
     * Answers the amount forfeited.
     */
    public function forfeitOnErasure(LoyaltyMember $member, ?User $by, bool $byTheMember = false): float
    {
        $orgId = (int) $member->organization_id;

        return $this->underOrg($orgId, function () use ($member, $by, $byTheMember, $orgId) {
            // An erasure never fails for want of a currency: the member's own lines' when the venue's is unusable.
            $currency = $this->currency($orgId, false, $this->lastCurrency($orgId, [(int) $member->id]));
            // The key names the member's state: a second erasure writes nothing (the balance is 0), and one after new
            // credit (a line since) gets a key of its own.
            $last = (int) CreditTransaction::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $member->id)->max('id');
            $forfeited = 0;
            $this->write($member, CreditTransaction::ADJUST, function (int $balance) use (&$forfeited) {
                $forfeited = max(0, $balance);

                return $forfeited > 0 ? -$forfeited : null;
            }, "credit_erasure_{$member->id}_{$last}", [
                'reference_type' => self::REF_ERASURE,
                'reference_id'   => (int) $member->id,
                'note'           => 'Forfeited at erasure',
                'created_by'     => $byTheMember ? null : $by?->id,
            ], $currency, function (CreditTransaction $line, int $before) use ($member, $by, $byTheMember, $currency, $orgId) {
                $this->audit($orgId, (int) $member->id, $by, 'credit.forfeited_on_erasure', [
                    'line_id' => (int) $line->id, 'amount' => self::major($before), 'currency' => $currency, 'by_the_member' => $byTheMember,
                ], 'Credit of ' . self::decimal($before) . " {$currency} forfeited at erasure" . ($byTheMember ? ' (the member deleted their account)' : ''));
            });

            return self::major($forfeited);
        });
    }

    /**
     * A merge (MemberMergeService::mergeCredit(), with both member rows already locked, before the loser's lines move to
     * the winner): the loser's balance is moved out (an `adjust` line on the loser, to 0) and in (an `adjust` line on the
     * winner, its balance the sum). The winner's line is written last, so once the loser's lines are the winner's, the
     * latest of them states the winner's balance — written even at 0 when the loser had lines but no balance. A loser
     * with neither leaves no line. Answers the amount moved.
     */
    public function mergeInto(LoyaltyMember $winner, LoyaltyMember $loser): float
    {
        $orgId = (int) $winner->organization_id;
        if ((int) $loser->organization_id !== $orgId) {
            throw new \InvalidArgumentException('Cannot merge credit across organisations.');
        }

        return $this->underOrg($orgId, function () use ($winner, $loser, $orgId) {
            $hasLines = CreditTransaction::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $loser->id)->exists();
            // A merge never fails for want of a currency: the members' own lines' when the venue's is unusable.
            $currency = $this->currency($orgId, false, $this->lastCurrency($orgId, [(int) $winner->id, (int) $loser->id]));
            $moved = 0;
            $this->write($loser, CreditTransaction::ADJUST, function (int $balance) use (&$moved) {
                $moved = max(0, $balance);

                return $moved > 0 ? -$moved : null;
            }, "credit_merge_{$loser->id}_out", [
                'reference_type' => self::REF_MERGE,
                'reference_id'   => (int) $winner->id,
                'note'           => 'Moved to member #' . ($winner->member_number ?? $winner->id) . ' at a merge',
            ], $currency);

            if ($moved > 0 || $hasLines) {
                $this->write($winner, CreditTransaction::ADJUST, fn () => $moved, "credit_merge_{$loser->id}_in", [
                    'reference_type' => self::REF_MERGE,
                    'reference_id'   => (int) $loser->id,
                    'note'           => 'Merged from member #' . ($loser->member_number ?? $loser->id),
                ], $currency);
            }

            return self::major($moved);
        });
    }

    /**
     * A member's credit for the workspace: whether cashback is on, the balance and currency, and one page of lines,
     * newest first, with who wrote each.
     *
     * @return array{enabled: bool, balance: float, currency: string, lines: list<array<string, mixed>>, pagination: array{page: int, pages: int, total: int, per_page: int}}
     */
    public function forMember(LoyaltyMember $member, int $page = 1): array
    {
        $orgId = (int) $member->organization_id;

        return $this->underOrg($orgId, function () use ($member, $page, $orgId) {
            $query = CreditTransaction::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $member->id);
            $total = (clone $query)->count();
            $pages = max(1, (int) ceil($total / self::PER_PAGE));
            $page = min(max(1, $page), $pages);
            $rows = $query->orderByDesc('id')->forPage($page, self::PER_PAGE)->get();
            $names = User::withoutGlobalScopes()->whereIn('id', $rows->pluck('created_by')->filter()->unique()->values()->all())->pluck('name', 'id');

            return $this->summary($member, $orgId) + [
                'lines'      => $rows->map(fn (CreditTransaction $l) => self::line($l) + ['by' => $l->created_by ? ($names[$l->created_by] ?? null) : null])->values()->all(),
                'pagination' => ['page' => $page, 'pages' => $pages, 'total' => $total, 'per_page' => self::PER_PAGE],
            ];
        });
    }

    /**
     * The member's own view (the portal, the app): whether cashback is on, the balance, the currency and the last
     * lines — no staff names.
     *
     * @return array{enabled: bool, balance: float, currency: string, lines: list<array<string, mixed>>}
     */
    public function forMemberSelf(LoyaltyMember $member): array
    {
        $orgId = (int) $member->organization_id;

        return $this->underOrg($orgId, function () use ($member, $orgId) {
            $rows = CreditTransaction::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $member->id)
                ->orderByDesc('id')->limit(self::MEMBER_LINES)->get();

            return $this->summary($member, $orgId) + ['lines' => $rows->map(fn (CreditTransaction $l) => self::line($l))->values()->all()];
        });
    }

    // ─── Amounts ────────────────────────────────────────────────────────────

    /** A decimal(12,2) value as whole cents, exactly: a string digit by digit, a number rounded. */
    public static function cents(mixed $value): int
    {
        if ($value === null || $value === '') {
            return 0;
        }
        if (is_int($value)) {
            return $value * 100;
        }
        if (is_string($value) && preg_match('/^\s*([+-]?)(\d*)(?:\.(\d{0,2}))?\s*$/', $value, $m) && ($m[2] !== '' || ($m[3] ?? '') !== '')) {
            $cents = (int) ($m[2] === '' ? '0' : $m[2]) * 100 + (int) str_pad($m[3] ?? '', 2, '0');

            return $m[1] === '-' ? -$cents : $cents;
        }

        return (int) round(((float) $value) * 100);
    }

    /** Cents as the decimal string the column stores ("-12.40"). */
    public static function decimal(int $cents): string
    {
        $abs = abs($cents);

        return ($cents < 0 ? '-' : '') . intdiv($abs, 100) . '.' . str_pad((string) ($abs % 100), 2, '0', STR_PAD_LEFT);
    }

    /** Cents as the number an answer carries (12.4). */
    public static function major(int $cents): float
    {
        return round($cents / 100, 2);
    }

    /** The currency's smallest unit in cents: 100 for a zero-decimal currency (Stripe's list), else 1. */
    public static function unitCents(string $currency): int
    {
        return StripeService::smallestUnitOf(1.0, $currency) === 1 ? 100 : 1;
    }

    /**
     * An amount a person typed, in cents: refused (422 `bad_amount`, with the currency's decimals) when it is not
     * positive (or, `$signed`, zero), larger than MAX_AMOUNT, or has more decimals than the column — or than the currency,
     * unless `$wholeUnits` is false (a correction, which checks that rule against the balance under the lock).
     */
    public static function amountCents(float $amount, string $currency, bool $signed, bool $wholeUnits = true): int
    {
        $unit = self::unitCents($currency);
        $scaled = $amount * 100;
        $cents = is_finite($scaled) ? (int) round($scaled) : 0;
        $bad = !is_finite($scaled)
            || abs($scaled - $cents) > 0.0001
            || ($signed ? $cents === 0 : $cents <= 0)
            || abs($cents) > self::MAX_AMOUNT * 100
            || ($wholeUnits && $cents % $unit !== 0);
        if ($bad) {
            throw self::badAmount($currency);
        }

        return $cents;
    }

    private static function badAmount(string $currency): LoyaltyRefused
    {
        return new LoyaltyRefused('bad_amount', 'Type an amount in the venue’s currency.', 422, [
            'decimals' => self::unitCents($currency) === 100 ? 0 : 2, 'max' => self::MAX_AMOUNT, 'currency' => $currency,
        ]);
    }

    public static function earnKey(string $referenceType, int $referenceId): string
    {
        return "cashback_{$referenceType}_{$referenceId}";
    }

    // ─── The one write ──────────────────────────────────────────────────────

    /**
     * Writes one line under the member row's lock, in its own transaction (a savepoint inside a caller's): the key is
     * looked up first (a replay answers the line that is and writes nothing); `$amountFor` gets the balance under the
     * lock, in cents, and answers the line's signed amount (null: write nothing); a balance below zero is refused (422
     * `credit_short`). `$then` runs inside the same transaction once the line is written (its audit row).
     *
     * @param \Closure(int): ?int $amountFor
     * @param array<string, mixed> $columns
     * @param (\Closure(CreditTransaction, int, int): void)|null $then the line, the balance before and after, in cents
     * @return array{0: CreditTransaction, 1: bool}|null the line and whether it was a replay; null when nothing was written
     */
    private function write(LoyaltyMember $member, string $type, \Closure $amountFor, string $key, array $columns, string $currency, ?\Closure $then = null): ?array
    {
        $orgId = (int) $member->organization_id;

        return DB::transaction(function () use ($member, $type, $amountFor, $key, $columns, $currency, $then, $orgId) {
            $locked = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($member->id)->lockForUpdate()->first();
            if ($locked === null) {
                throw LoyaltyRefused::notFound();
            }
            $balance = self::cents($locked->getRawOriginal('credit_balance'));
            self::keep($member, $balance);

            $existing = CreditTransaction::withoutGlobalScopes()->where('organization_id', $orgId)->where('idempotency_key', $key)->first();
            if ($existing !== null) {
                return [$existing, true];
            }

            $amount = $amountFor($balance);
            if ($amount === null) {
                return null;
            }
            $after = $balance + $amount;
            if ($after < 0) {
                throw new LoyaltyRefused('credit_short', 'The member does not have that much credit.', 422, ['balance' => self::major($balance), 'currency' => $currency]);
            }
            if ($after > self::MAX_BALANCE_CENTS) {
                throw new \OverflowException("A credit balance above the column's ceiling (member {$member->id}).");
            }

            $line = new CreditTransaction();
            $line->forceFill([
                'organization_id' => $orgId,
                'member_id'       => (int) $member->id,
                'type'            => $type,
                'amount'          => self::decimal($amount),
                'balance_after'   => self::decimal($after),
                'currency'        => $currency,
                'idempotency_key' => $key,
            ] + $columns)->save();

            LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($member->id)->update(['credit_balance' => self::decimal($after)]);
            self::keep($member, $after);

            if ($then !== null) {
                $then($line, $balance, $after);
            }

            return [$line, false];
        });
    }

    /** The caller's member instance shows the stored balance without making it a change of its own (a later save() leaves it). */
    private static function keep(LoyaltyMember $member, int $cents): void
    {
        $member->forceFill(['credit_balance' => self::decimal($cents)]);
        $member->syncOriginalAttribute('credit_balance');
    }

    /**
     * The answer of a spend or a correction: the line (the first one, on a replay) and the balance now. A key that
     * names another member's line or another kind of line is refused (409 `key_reused`) rather than answered.
     *
     * @return array{line: array<string, mixed>, balance: float, currency: string, replayed: bool}
     */
    private function answer(LoyaltyMember $member, CreditTransaction $line, bool $replayed, string $type): array
    {
        if ((int) $line->member_id !== (int) $member->id || $line->type !== $type) {
            throw new LoyaltyRefused('key_reused', 'This retry key was used for something else.', 409);
        }
        $byName = $line->created_by ? User::withoutGlobalScopes()->whereKey($line->created_by)->value('name') : null;

        return [
            'line'     => self::line($line) + ['by' => $byName],
            'balance'  => self::major(self::cents($member->getAttributes()['credit_balance'] ?? 0)),
            'currency' => (string) $line->currency,
            'replayed' => $replayed,
        ];
    }

    /** @return array{enabled: bool, balance: float, currency: string} */
    private function summary(LoyaltyMember $member, int $orgId): array
    {
        $stored = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($member->id)->value('credit_balance');

        return [
            'enabled'  => (bool) ProgrammeOptions::get($orgId, 'cashback_enabled'),
            'balance'  => self::major(self::cents($stored)),
            'currency' => $this->currency($orgId, false),
        ];
    }

    /** @return array<string, mixed> a line as the screens read it */
    private static function line(CreditTransaction $line): array
    {
        return [
            'id'             => (int) $line->id,
            'type'           => (string) $line->type,
            'amount'         => self::major(self::cents($line->getRawOriginal('amount'))),
            'balance_after'  => self::major(self::cents($line->getRawOriginal('balance_after'))),
            'currency'       => (string) $line->currency,
            'note'           => $line->note,
            'reference_type' => $line->reference_type,
            'created_at'     => $line->created_at?->toIso8601String(),
        ];
    }

    // ─── The organisation ───────────────────────────────────────────────────

    /**
     * The venue's currency (PortalBootstrap::currency, upper case). A write refuses one that is not a three-letter code
     * (409 `bad_currency`) rather than stamp a line with it; a read answers it as it is.
     */
    private function currency(int $orgId, bool $strict = true, ?string $fallback = null): string
    {
        $org = Organization::withoutGlobalScopes()->find($orgId);
        $currency = $org ? PortalBootstrap::currency($org) : '';
        if (preg_match('/^[A-Z]{3}$/', $currency) === 1) {
            return $currency;
        }
        if ($strict) {
            throw new LoyaltyRefused('bad_currency', 'The venue’s currency is not set (Card & app → Currency).', 409);
        }

        return preg_match('/^[A-Z]{3}$/', (string) $fallback) === 1 ? (string) $fallback : mb_substr($currency, 0, 3);
    }

    /** The currency of the newest line of these members (a merge's or an erasure's fallback). @param list<int> $memberIds */
    private function lastCurrency(int $orgId, array $memberIds): ?string
    {
        return CreditTransaction::withoutGlobalScopes()->where('organization_id', $orgId)->whereIn('member_id', $memberIds)->orderByDesc('id')->value('currency');
    }

    /**
     * Deleted by staff (MemberErasure) or by themselves (the app's and the portal's account deletion): such a member
     * earns, spends and is corrected no more — their balance was forfeited when the account went.
     */
    private static function isDeleted(LoyaltyMember $member): bool
    {
        return MemberErasure::isErased($member) || MemberErasure::isSelfDeleted($member);
    }

    private function refuseErased(LoyaltyMember $member): void
    {
        if (self::isDeleted($member)) {
            throw new LoyaltyRefused('already_erased', 'This member was deleted.', 409);
        }
    }

    /** @param array<string, mixed> $values */
    private function audit(int $orgId, int $memberId, ?User $by, string $action, array $values, string $description): void
    {
        $row = new AuditLog();
        $row->forceFill([
            'organization_id' => $orgId,
            'causer_type'     => $by ? User::class : null,
            'causer_id'       => $by?->id,
            'action'          => $action,
            'subject_type'    => LoyaltyMember::class,
            'subject_id'      => $memberId,
            'new_values'      => $values,
            'description'     => $description,
        ])->save();
    }

    /** "5", "5.25": a percentage as a note writes it. */
    private static function percentText(float $percent): string
    {
        return rtrim(rtrim(number_format($percent, 2, '.', ''), '0'), '.');
    }

    /**
     * Runs $work with the organisation bound as the tenant (what BelongsToOrganization stamps on a new row and the
     * settings the currency comes from), and the prior binding restored after.
     *
     * @template T
     * @param \Closure(): T $work
     * @return T
     */
    private function underOrg(int $orgId, \Closure $work): mixed
    {
        $bound = app()->bound('current_organization_id');
        $prior = $bound ? app('current_organization_id') : null;
        app()->instance('current_organization_id', $orgId);
        try {
            return $work();
        } finally {
            if ($bound) {
                app()->instance('current_organization_id', $prior);
            } else {
                app()->forgetInstance('current_organization_id');
            }
        }
    }
}

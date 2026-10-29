<?php

namespace App\Services\Auth;

use App\Models\EmailVerificationCode;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** A recovery code authorizes one identity and one atomic credential change. */
final class AccountRecovery
{
    public static function consume(string $email, string $code, string $password, string $purpose, callable $after): mixed
    {
        return DB::transaction(function () use ($email, $code, $password, $purpose, $after) {
            $records = EmailVerificationCode::where('email', $email)->where('code', $code)
                ->whereNull('verified_at')->get();
            $record = $records->count() === 1 ? $records->first() : null;
            if (!$record || $record->isExpired() || ($record->purpose !== null && $record->purpose !== $purpose)) {
                self::refuse();
            }

            $users = User::where('email', $email)
                ->when($record->user_id, fn ($q) => $q->whereKey($record->user_id))
                ->lockForUpdate()->get();
            // Old emailed codes remain usable only where the email names exactly one account.
            if ($users->count() !== 1) {
                self::refuse();
            }
            $user = $users->first();
            // Same order as issuance: identity, then grant. Re-read after waiting for the identity lock.
            $record = EmailVerificationCode::whereKey($record->id)->whereNull('verified_at')->lockForUpdate()->first();
            if (!$record || $record->isExpired()) {
                self::refuse();
            }
            $user->password = $password;
            // Both flows prove control of the bound account's mailbox.
            $user->email_verified_at = now();
            $user->save();
            $user->tokens()->delete();
            $record->update(['verified_at' => now()]);
            // Every outstanding credential grant for this identity predates
            // the replacement password, including a long-lived invitation.
            // Keep signup verification and other same-email identities intact.
            EmailVerificationCode::whereNull('verified_at')
                ->where(fn ($q) => $q->whereIn('purpose', ['claim', 'reset'])->orWhereNull('purpose'))
                ->where(fn ($q) => $q->where('user_id', $user->id)
                    ->orWhere(fn ($legacy) => $legacy->whereNull('user_id')->where('email', $user->email)))
                ->update(['verified_at' => now()]);

            return $after($user);
        });
    }

    private static function refuse(): never
    {
        throw ValidationException::withMessages(['code' => 'Invalid or expired code. Request a new code for this account.']);
    }
}

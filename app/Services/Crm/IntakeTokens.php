<?php

namespace App\Services\Crm;

use App\Http\Controllers\Api\V1\Integrations\LeadIntakeController;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Routing\Route;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * HexaTech CRM's API tokens (round 5, 2026-11-12): a token made in the CRM sends leads in through
 * `POST /v1/integrations/leads` and does nothing else.
 *
 * The full admin's tokens (`admin/api-tokens`, ApiTokenController) are Sanctum tokens with every ability (`*`): Sanctum
 * itself checks no ability on `auth:sanctum` routes, so such a token is its owner's whole session for as long as it
 * lives. A CRM token carries the one ability ABILITY, and admits() — Sanctum's token check, registered by
 * CrmIntakeTokensServiceProvider — accepts a token naming it only on the intake route; on every other route Sanctum treats it as
 * no token at all (401). Which organisation a lead lands in is the token owner's (LeadIntakeController, TenantMiddleware),
 * and the intake still asks AccessMap (`integrations/leads`: an active staff member, product crm), so switching the
 * owner's access off stops the token too.
 *
 * Tokens are the caller's own, as in the full admin (named `integration:<label>`, so the full admin's list shows them
 * as well). The plain token is answered once, by create(); it is never logged, audited or answered again (the
 * database keeps only Sanctum's hash).
 */
final class IntakeTokens
{
    public const ABILITY = 'crm:lead-intake';

    public const PREFIX = 'integration:';

    /** At most this many tokens per person: enough for every website and form, few enough to keep track of. */
    public const LIMIT = 20;

    /** A label: letters, digits, spaces, `_`, `-` and `.` (the full admin's rule). */
    public const LABEL_RULE = ['required', 'string', 'min:1', 'max:80', 'regex:/^[a-zA-Z0-9 _\-\.]+$/'];

    /**
     * The caller's lead-intake tokens, newest first: never the token itself.
     *
     * @return list<array{id: int, label: string, last_used_at: ?string, created_at: ?string}>
     */
    public static function of(User $user): array
    {
        return array_values(self::query($user)->orderByDesc('created_at')->orderByDesc('id')->get()
            ->filter(fn (PersonalAccessToken $t) => self::isIntakeOnly($t))
            ->map(fn (PersonalAccessToken $t) => self::row($t))
            ->all());
    }

    /**
     * A new lead-intake token for the caller: the row and, once, the plain token. Null with a reason when the label is
     * taken by one of the caller's integration tokens or the caller holds LIMIT of them.
     *
     * @return array{row: array{id: int, label: string, last_used_at: ?string, created_at: ?string}, token: string}|array{refused: string}
     */
    public static function create(User $user, string $label): array
    {
        $name = self::nameFor($label);
        if (self::query($user)->where('name', $name)->exists()) {
            return ['refused' => 'label_taken'];
        }
        if (self::query($user)->get()->filter(fn (PersonalAccessToken $t) => self::isIntakeOnly($t))->count() >= self::LIMIT) {
            return ['refused' => 'too_many_tokens'];
        }

        $made = $user->createToken($name, [self::ABILITY]);
        // The audit names the token and what it may do, never the token itself.
        AuditLog::record('api_token.created', $made->accessToken, ['name' => $name, 'abilities' => [self::ABILITY]], [], $user,
            'Created lead-intake token ' . $name);

        return ['row' => self::row($made->accessToken), 'token' => $made->plainTextToken];
    }

    /** Revoke one of the caller's own lead-intake tokens at once; false when it is not one. */
    public static function revoke(User $user, int $id): bool
    {
        $token = self::query($user)->whereKey($id)->first();
        if (!$token instanceof PersonalAccessToken || !self::isIntakeOnly($token)) {
            return false;
        }
        $name = $token->name;
        $token->delete();
        AuditLog::record('api_token.revoked', $token, [], ['name' => $name, 'abilities' => [self::ABILITY]], $user,
            'Revoked lead-intake token ' . $name);

        return true;
    }

    /**
     * Whether Sanctum may accept this token for the request being handled: a token naming ABILITY only on the lead
     * intake (whatever else it names, so it fails closed); every other token as before. Asked for every Sanctum token,
     * on every route (CrmIntakeTokensServiceProvider).
     */
    public static function admits(mixed $token): bool
    {
        if (!$token instanceof PersonalAccessToken || !self::isIntakeOnly($token)) {
            return true;
        }
        $request = app('request');
        $route = $request->route();

        return $request->isMethod('POST')
            && $route instanceof Route
            && $route->getActionName() === LeadIntakeController::class . '@store';
    }

    /** A token made for the lead intake: one that names ABILITY. */
    public static function isIntakeOnly(PersonalAccessToken $token): bool
    {
        return in_array(self::ABILITY, (array) ($token->abilities ?? []), true);
    }

    /** `integration:<label as a slug>`, the full admin's naming. */
    public static function nameFor(string $label): string
    {
        $slug = trim((string) preg_replace('/[^a-z0-9]+/', '_', strtolower($label)), '_');

        return self::PREFIX . ($slug !== '' ? $slug : 'token');
    }

    /** @return \Illuminate\Database\Eloquent\Builder<PersonalAccessToken> */
    private static function query(User $user)
    {
        return PersonalAccessToken::query()
            ->where('tokenable_type', $user->getMorphClass())
            ->where('tokenable_id', $user->getKey())
            ->where('name', 'like', self::PREFIX . '%');
    }

    /** @return array{id: int, label: string, last_used_at: ?string, created_at: ?string} */
    private static function row(PersonalAccessToken $token): array
    {
        return [
            'id'           => (int) $token->id,
            'label'        => substr((string) $token->name, strlen(self::PREFIX)),
            'last_used_at' => $token->last_used_at?->toIso8601String(),
            'created_at'   => $token->created_at?->toIso8601String(),
        ];
    }
}

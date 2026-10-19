<?php

namespace App\Services\Content;

use App\Models\Staff;
use App\Models\User;
use App\Support\AdminAccess\AccessMap;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A brand's team (spec 2026-10-19 §4.1): the organisation's active staff who can use the brand — no brand rows on
 * the person, or a row for this one. Who posts a post must be one of them; one who has left, or whose staff row is
 * inactive, counts as nobody (the panel shows nobody, the reminders go to the managers).
 */
final class ContentTeam
{
    /** @return Collection<int, array{id: int, name: string, role: string}> by name */
    public static function of(int $brandId): Collection
    {
        // Staff is tenant-scoped: the bound organisation's rows only.
        $staff = Staff::where('is_active', true)->get(['user_id', 'role'])->keyBy(fn (Staff $row) => (int) $row->user_id);
        if ($staff->isEmpty()) {
            return collect();
        }
        $brandRows = DB::table('brand_user')->whereIn('user_id', $staff->keys()->all())->get(['user_id', 'brand_id'])
            ->groupBy(fn ($row) => (int) $row->user_id);

        return User::query()->whereIn('id', $staff->keys()->all())->orderBy('name')->orderBy('id')->get(['id', 'name'])
            ->filter(fn (User $user) => !$brandRows->has((int) $user->id)
                || $brandRows[(int) $user->id]->contains(fn ($row) => (int) $row->brand_id === $brandId))
            ->map(fn (User $user) => [
                'id'   => (int) $user->id,
                'name' => (string) $user->name,
                'role' => in_array($staff[(int) $user->id]->role, AccessMap::MANAGER_ROLES, true) ? 'manager' : 'staff',
            ])
            ->values();
    }

    /** @return list<int> */
    public static function memberIds(int $brandId): array
    {
        return self::of($brandId)->pluck('id')->all();
    }

    public static function isMember(?int $userId, int $brandId): bool
    {
        return $userId !== null && in_array($userId, self::memberIds($brandId), true);
    }

    /** Who posts it, as the panel shows it: a member, or nobody. @return array{id: int, name: string}|null */
    public static function poster(?int $userId, int $brandId): ?array
    {
        if ($userId === null) {
            return null;
        }
        $member = self::of($brandId)->firstWhere('id', $userId);

        return $member ? ['id' => $member['id'], 'name' => $member['name']] : null;
    }

    /** A new poster must be on the team; the post's own poster sent again is no change, even once they have left. */
    public static function assertPoster(mixed $userId, ?int $current, int $brandId): void
    {
        if ($userId === null || (int) $userId === $current) {
            return;
        }
        if (!self::isMember((int) $userId, $brandId)) {
            throw ValidationException::withMessages(['poster_id' => "Choose someone on this brand's team."]);
        }
    }
}

<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Reward;
use App\Models\SpecialOffer;
use App\Rules\MaxImageDimensions;
use App\Scopes\BrandScope;
use App\Services\Loyalty\App\OwnMedia;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\MediaService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * A reward's and an offer's picture (release 2 §7, R2-2): the one writer of `image_url` in the workspace, for staff
 * with `can_manage_offers`. The full admin's limits — JPEG, PNG or WebP, rewards up to 5 MB, offers up to 2 MB — and the
 * dimension rule the landing pictures use (MaxImageDimensions, 4,096 px on the longest side); MediaService's folders
 * `rewards` and `offers`. Multipart does not parse on a PUT in PHP, hence POST.
 *
 * As the landing page's picture endpoints: the upload lands before the row is locked (never a lock across a transfer),
 * the old address is read from the locked row, a failed save deletes the new file again, and the old file is deleted
 * only once the row no longer names it — and only when it is ours (OwnMedia) and no other row of the table still
 * shows it. Rewards and offers are brand-scoped: found for the whole organisation as RewardController and
 * OfferController find them. Answers `{image_url}`.
 */
class ImageController extends Controller
{
    /** The longest side a picture may have, in pixels. */
    public const MAX_EDGE = 4096;

    /** Each folder's size limit in KB, as the full admin's forms. */
    public const MAX_KB = ['rewards' => 5120, 'offers' => 2048];

    /** What the form's file input accepts (the rule's `mimes:jpeg,png,jpg,webp`). */
    public const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

    /**
     * The limits a form names before sending, served beside the catalogue and the offers.
     *
     * @return array{max_kb: int, max_edge: int, types: list<string>}
     */
    public static function limits(string $folder): array
    {
        return ['max_kb' => self::MAX_KB[$folder], 'max_edge' => self::MAX_EDGE, 'types' => self::TYPES];
    }

    public function storeReward(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::require($request->user(), LoyaltyAccess::MANAGE_REWARDS);

        return $this->store($request, Reward::class, $id, 'rewards', 'reward');
    }

    public function destroyReward(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::require($request->user(), LoyaltyAccess::MANAGE_REWARDS);

        return $this->destroy($request, Reward::class, $id, 'rewards', 'reward');
    }

    public function storeOffer(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::require($request->user(), LoyaltyAccess::MANAGE_REWARDS);

        return $this->store($request, SpecialOffer::class, $id, 'offers', 'offer');
    }

    public function destroyOffer(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::require($request->user(), LoyaltyAccess::MANAGE_REWARDS);

        return $this->destroy($request, SpecialOffer::class, $id, 'offers', 'offer');
    }

    /** @param class-string<Model> $model */
    private function store(Request $request, string $model, int $id, string $folder, string $kind): JsonResponse
    {
        // Not found before the file is looked at or uploaded.
        $model::query()->whereKey($id)->exists() || throw LoyaltyRefused::notFound();
        $data = $request->validate([
            'image' => ['required', 'image', 'mimes:jpeg,png,jpg,webp', 'max:' . self::MAX_KB[$folder], new MaxImageDimensions(self::MAX_EDGE)],
        ]);

        $orgId = (int) app('current_organization_id');
        $url = MediaService::upload($data['image'], $folder);

        try {
            [$row, $old] = DB::transaction(function () use ($model, $id, $url) {
                $row = $model::query()->whereKey($id)->lockForUpdate()->first() ?? throw LoyaltyRefused::notFound();
                $old = $row->image_url;
                $row->image_url = $url;
                $row->save();

                return [$row, $old];
            });
        } catch (\Throwable $e) {
            // The new file is on the disk with nothing pointing at it; the original failure is the answer.
            try {
                MediaService::delete($url);
            } catch (\Throwable) {
            }
            throw $e;
        }

        if (is_string($old) && $old !== $url) {
            $this->forgetUnused($model, $id, $old, $orgId, $folder);
        }

        AuditLog::record("{$kind}_image_uploaded", $row, ['picture' => $old ? 'replaced' : 'added'], [], $request->user(),
            ucfirst($kind) . " '" . self::name($row) . "' picture " . ($old ? 'replaced' : 'added'));

        return response()->json(['image_url' => $url]);
    }

    /** @param class-string<Model> $model */
    private function destroy(Request $request, string $model, int $id, string $folder, string $kind): JsonResponse
    {
        $orgId = (int) app('current_organization_id');

        [$row, $old] = DB::transaction(function () use ($model, $id) {
            $row = $model::query()->whereKey($id)->lockForUpdate()->first() ?? throw LoyaltyRefused::notFound();
            $old = $row->image_url;
            if ($old !== null) {
                $row->image_url = null;
                $row->save();
            }

            return [$row, $old];
        });

        // Removing a picture that is not there is done already.
        if (is_string($old) && $old !== '') {
            $this->forgetUnused($model, $id, $old, $orgId, $folder);
            AuditLog::record("{$kind}_image_removed", $row, ['picture' => 'removed'], [], $request->user(),
                ucfirst($kind) . " '" . self::name($row) . "' picture removed");
        }

        return response()->json(['image_url' => null]);
    }

    /**
     * The old file goes only when no other row of this organisation still shows it (a copied reward keeps its
     * picture). Read for the whole organisation, every brand.
     *
     * @param class-string<Model> $model
     */
    private function forgetUnused(string $model, int $id, string $old, int $orgId, string $folder): void
    {
        $shared = $model::query()->withoutGlobalScope(BrandScope::class)
            ->where('image_url', $old)->whereKeyNot($id)->exists();
        if (!$shared) {
            OwnMedia::forget($old, $orgId, $folder);
        }
    }

    private static function name(Model $row): string
    {
        return (string) ($row->getAttribute('name') ?? $row->getAttribute('title') ?? '');
    }
}

<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Services\DiscountService;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyForms;
use App\Services\Loyalty\LoyaltyRefused;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator as FormValidator;

/**
 * The rewards catalogue (spec 2026-10-21 §4.6): every staff member reads it,
 * staff with `can_manage_offers` add and change it (§5). The rules are
 * RewardAdminController's, as JSON; the picture has its own endpoints
 * (ImageController, release 2 §7), whose limits the list's options carry.
 * Rewards are brand-scoped: read as the request's brand binding gives,
 * created on the brand the request names (release 4: one of the options'
 * brands, which are this organisation's and the staff member's), else on the
 * one the model's own hook picks. A reward keeps its brand when changed.
 */
class RewardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $rewards = Reward::query()->withCount(self::counts())->orderBy('sort_order')->orderBy('name')->get();

        return response()->json([
            'rewards' => $rewards->map(fn (Reward $r) => self::row($r))->values(),
            'options' => [
                'discount_types' => LoyaltyForms::REWARD_DISCOUNT_TYPES,
                'applies_to'     => LoyaltyForms::appliesTo(),
                'image'          => ImageController::limits('rewards'),
                // Release 4: the brands a new reward may be put on (one: nothing to choose).
                'brands'         => LoyaltyForms::brands($request->user(), (int) app('current_organization_id')),
            ],
        ]);
    }

    /** A new reward may name its brand (release 4, `brand`): one of the options' brands; none, the model's hook picks it as before. */
    public function store(Request $request): JsonResponse
    {
        LoyaltyAccess::require($request->user(), LoyaltyAccess::MANAGE_REWARDS);
        $reward = Reward::create($this->validated($request));

        AuditLog::record('reward_created', $reward, $reward->toArray(), [], $request->user(), "Reward '{$reward->name}' created");

        return response()->json(['reward' => self::row($reward->fresh()->loadCount(self::counts()))], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::require($request->user(), LoyaltyAccess::MANAGE_REWARDS);
        $reward = Reward::query()->find($id) ?? throw LoyaltyRefused::notFound();
        $old = $reward->toArray();

        $reward->update($this->validated($request, $reward));

        AuditLog::record('reward_updated', $reward, $reward->toArray(), $old, $request->user(), "Reward '{$reward->name}' updated");

        return response()->json(['reward' => self::row($reward->fresh()->loadCount(self::counts()))]);
    }

    /** @return array<string, mixed> */
    private static function row(Reward $r): array
    {
        return [
            'id'               => (int) $r->id,
            'brand_id'         => $r->brand_id !== null ? (int) $r->brand_id : null,
            'name'             => (string) $r->name,
            'description'      => $r->description,
            'terms'            => $r->terms,
            'category'         => $r->category,
            'points_cost'      => (int) $r->points_cost,
            'stock'            => $r->stock,
            'per_member_limit' => $r->per_member_limit,
            'discount_type'    => $r->discount_type,
            'discount_value'   => $r->discount_value !== null ? (float) $r->discount_value : null,
            'applies_to'       => (string) ($r->applies_to ?? 'all'),
            'expires_at'       => $r->expires_at?->toIso8601String(),
            'is_active'        => (bool) $r->is_active,
            'image_url'        => $r->image_url,
            'redeemed'         => (int) ($r->redeemed ?? 0),
            'fulfilled'        => (int) ($r->fulfilled ?? 0),
        ];
    }

    /** @return array<int|string, mixed> Every redemption of a reward, and the fulfilled ones (as the full admin counts them). */
    private static function counts(): array
    {
        return [
            'redemptions as redeemed',
            'redemptions as fulfilled' => fn ($q) => $q->where('status', RewardRedemption::STATUS_FULFILLED),
        ];
    }

    /**
     * RewardAdminController::validatePayload's rules (a whole reward on create and on change alike), and what its
     * store and update then do: a discount type sent empty clears its value too, and `applies_to` is never stored
     * empty (the column holds `all` for every booking). The expiry is an instant, read as LoyaltyForms::instant() says.
     *
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Reward $reward = null): array
    {
        $data = Validator::make($request->all(), [
            'name'             => 'required|string|max:191',
            'description'      => 'nullable|string',
            'terms'            => 'nullable|string',
            'category'         => 'nullable|string|max:60',
            'points_cost'      => 'required|integer|min:1|max:1000000',
            'stock'            => 'nullable|integer|min:0|max:1000000',
            'per_member_limit' => 'nullable|integer|min:1|max:1000',
            'discount_type'    => ['nullable', Rule::in(LoyaltyForms::REWARD_DISCOUNT_TYPES)],
            'discount_value'   => 'nullable|numeric|min:0.01|max:100000|required_with:discount_type',
            'applies_to'       => ['nullable', Rule::in(LoyaltyForms::appliesTo())],
            'expires_at'       => 'nullable|date',
            'is_active'        => 'sometimes|boolean',
            'sort_order'       => 'sometimes|integer|min:0|max:10000',
            // Release 4: a new reward may name its brand; a reward keeps the one it has.
            ...($reward === null ? ['brand' => LoyaltyForms::brandRule($request->user(), (int) app('current_organization_id'))] : []),
        ])->after(function (FormValidator $v) use ($request, $reward) {
            // A percentage above 100 would hand money back; the type is the stored one when the request keeps it.
            $type = $request->has('discount_type') ? $request->input('discount_type') : $reward?->discount_type;
            if ($type === DiscountService::PERCENT && (float) $request->input('discount_value', 0) > 100) {
                $v->errors()->add('discount_value', 'A percentage discount cannot exceed 100%.');
            }
        })->validate();

        if ($request->has('discount_type') && !$request->filled('discount_type')) {
            $data['discount_type'] = null;
            $data['discount_value'] = null;
        }
        if (array_key_exists('applies_to', $data)) {
            $data['applies_to'] ??= 'all';
        }
        $data = LoyaltyForms::withBrand($data);
        if (!empty($data['expires_at'])) {
            $data['expires_at'] = LoyaltyForms::instant($data['expires_at'], (int) app('current_organization_id'));
        }

        return $data;
    }
}

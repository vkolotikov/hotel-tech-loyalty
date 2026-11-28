<?php

namespace App\Services\Content;

use App\Models\Brand;
use App\Models\Organization;
use App\Models\Staff;
use App\Models\User;
use App\Services\ContentPlanner\CalendarGenerationBudget;
use Illuminate\Support\Facades\Auth;

/** Explicit, restored queue context. Never inherit a previous job's actor or allowance. */
final class ContentExecution
{
    public function __construct(
        public int $organizationId,
        public int $brandId,
        public int $userId,
        public bool $manager = false,
        public ?\Closure $guard = null,
        public ?CalendarGenerationBudget $budget = null,
    ) {}

    public function authorized(): User
    {
        $org = Organization::find($this->organizationId);
        $user = User::find($this->userId);
        $seat = Staff::withoutGlobalScopes()->where('organization_id', $this->organizationId)
            ->where('user_id', $this->userId)->where('is_active', true)->first();
        if (! $org || ! $org->is_active || ! $user || ! $seat || $user->user_type !== 'staff') {
            throw new ContentRefused('access_revoked', 'Your access to this work has changed.', 403);
        }
        if (! $user->isPlatformAdmin()) {
            $status = $org->subscription_status;
            $expiredTrial = $org->trial_end && $org->trial_end->isPast() && $status !== 'ACTIVE';
            if ($expiredTrial || ($status && ! in_array($status, ['ACTIVE', 'TRIALING'], true))
                || (! $status && (app()->environment('production') || config('services.saas.api_url')))) {
                throw new ContentRefused('subscription_required', 'An active subscription is required.', 403);
            }
        }
        if (! $org->workspaceEnabled('content') || ! $org->holdsModule('content')) {
            throw new ContentRefused('workspace_disabled', 'Content is not available for this organisation.', 403);
        }
        if (! Brand::where('organization_id', $org->id)->whereKey($this->brandId)->exists()) {
            throw new ContentRefused('no_brand', 'This brand is no longer available.', 403);
        }
        $brands = $user->brands()->pluck('brands.id')->map(fn ($id) => (int) $id)->all();
        if (! $user->isPlatformAdmin() && $brands !== [] && ! in_array($this->brandId, $brands, true)) {
            throw new ContentRefused('brand_not_allowed', 'Your access to this brand has changed.', 403);
        }
        if ($this->manager) {
            ContentAccess::requireManager($user);
        }

        return $user;
    }

    public function run(callable $call): mixed
    {
        $keys = ['current_organization_id', 'current_brand_id', self::class];
        $prior = [];
        foreach ($keys as $key) {
            $prior[$key] = app()->bound($key) ? app($key) : null;
        }
        $previousUser = Auth::user();
        app()->instance('current_organization_id', $this->organizationId);
        app()->instance('current_brand_id', $this->brandId);
        app()->instance(self::class, $this);
        $this->budget ??= new CalendarGenerationBudget(null, 55);
        try {
            Auth::forgetGuards();
            Auth::setUser($this->authorized());
            self::check();

            return $call();
        } finally {
            Auth::forgetGuards();
            if ($previousUser) {
                Auth::setUser($previousUser);
            }
            foreach ($prior as $key => $value) {
                $value === null ? app()->forgetInstance($key) : app()->instance($key, $value);
            }
        }
    }

    /** Called before paid requests and inside every result transaction. */
    public static function check(bool $commit = false): void
    {
        if (! app()->bound(self::class)) {
            return;
        }
        $context = app(self::class);
        $context->authorized();
        if ($context->guard) {
            ($context->guard)($commit);
        }
    }

    /** One deadline shared by every transport/repair/fallback in the web request. */
    public static function budget(): CalendarGenerationBudget
    {
        if (app()->bound(self::class)) {
            return app(self::class)->budget;
        }
        $request = request();
        if (! $request->attributes->has('content_ai_budget')) {
            $request->attributes->set('content_ai_budget', new CalendarGenerationBudget(null, 45));
        }

        return $request->attributes->get('content_ai_budget');
    }
}

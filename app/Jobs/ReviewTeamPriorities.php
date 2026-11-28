<?php

namespace App\Jobs;

use App\Models\Organization;
use App\Models\User;
use App\Services\Crm\TeamPriorityReview;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

final class ReviewTeamPriorities implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;
    public int $timeout = 120;

    public function __construct(public int $orgId, public ?int $brandId, public int $userId, public array $batch)
    {
        $this->onQueue('ai');
    }

    public function handle(TeamPriorityReview $review): void
    {
        $org = Organization::find($this->orgId);
        $user = User::where('organization_id', $this->orgId)->find($this->userId);
        if (!$org || !$user) {
            return;
        }
        $prior = [];
        foreach (['current_organization_id' => $this->orgId, 'current_brand_id' => $this->brandId] as $key => $value) {
            $prior[$key] = app()->bound($key) ? app($key) : null;
            app()->instance($key, $value);
        }
        try {
            $review->run($org, $user, $this->brandId, $this->batch);
        } finally {
            foreach ($prior as $key => $value) {
                app()->forgetInstance($key);
                if ($value !== null) app()->instance($key, $value);
            }
        }
    }
}

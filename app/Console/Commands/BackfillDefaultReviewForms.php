<?php

namespace App\Console\Commands;

use App\Models\Organization;
use App\Models\ReviewForm;
use App\Scopes\TenantScope;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

class BackfillDefaultReviewForms extends Command
{
    protected $signature = 'reviews:backfill-default-forms';

    protected $description = 'Ensure every organization has a default Basic review form (idempotent).';

    public function handle(): int
    {
        $orgs = Organization::withoutGlobalScope(TenantScope::class)->get();
        $created = 0;

        foreach ($orgs as $org) {
            $exists = ReviewForm::withoutGlobalScope(TenantScope::class)
                ->where('organization_id', $org->id)
                ->where('is_default', true)
                ->exists();

            if ($exists) continue;

            ReviewForm::withoutGlobalScopes()->create([
                'organization_id' => $org->id,
                'name'       => 'Stay Feedback',
                'type'       => 'basic',
                'is_active'  => true,
                'is_default' => true,
                'embed_key'  => Str::random(32),
                'config'     => [
                    'intro_text'         => 'We hope you enjoyed your stay. Your feedback helps us improve.',
                    'thank_you_text'     => 'Thank you for taking the time to share your experience.',
                    'ask_for_comment'    => true,
                    'allow_anonymous'    => true,
                    'redirect_threshold' => 4,
                    'redirect_prompt'    => 'Would you share this on a review site?',
                ],
            ]);
            $created++;
            $this->line("  created default form for org#{$org->id} ({$org->name})");
        }

        $this->info("Backfill complete. Created {$created} default form(s) across " . $orgs->count() . ' organization(s).');
        return self::SUCCESS;
    }
}

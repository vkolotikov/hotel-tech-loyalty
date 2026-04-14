<?php

namespace App\Console\Commands;

use App\Models\BookingMirror;
use App\Models\Guest;
use App\Models\ReviewForm;
use App\Models\ReviewInvitation;
use App\Scopes\TenantScope;
use App\Services\ReviewInvitationService;
use Illuminate\Console\Command;

class SendPostStayReviewInvitations extends Command
{
    protected $signature = 'reviews:send-post-stay {--dry-run : Preview only; do not send}';

    protected $description = 'Send review invitations for bookings that checked out N days ago (per-form opt-in)';

    public function handle(ReviewInvitationService $svc): int
    {
        $forms = ReviewForm::withoutGlobalScope(TenantScope::class)
            ->where('is_active', true)
            ->get()
            ->filter(fn(ReviewForm $f) => (bool) ($f->config['auto_send_post_stay'] ?? false));

        if ($forms->isEmpty()) {
            $this->info('No forms opted into post-stay sending.');
            return self::SUCCESS;
        }

        $dry = (bool) $this->option('dry-run');
        $totalSent = 0;
        $totalSkipped = 0;

        foreach ($forms as $form) {
            $orgId = $form->organization_id;
            $delayDays = max(1, (int) ($form->config['auto_send_delay_days'] ?? 1));
            $target = now()->subDays($delayDays)->toDateString();

            app()->instance('current_organization_id', $orgId);

            $bookings = BookingMirror::withoutGlobalScope(TenantScope::class)
                ->where('organization_id', $orgId)
                ->whereDate('departure_date', $target)
                ->whereNotNull('guest_email')
                ->where(function ($q) {
                    $q->whereNull('internal_status')
                      ->orWhereNotIn('internal_status', ['cancelled']);
                })
                ->get();

            foreach ($bookings as $b) {
                $already = ReviewInvitation::withoutGlobalScope(TenantScope::class)
                    ->where('organization_id', $orgId)
                    ->where('form_id', $form->id)
                    ->whereJsonContains('metadata->booking_id', $b->id)
                    ->exists();

                if ($already) {
                    $totalSkipped++;
                    continue;
                }

                if ($dry) {
                    $this->line(" would send → org#{$orgId} booking#{$b->id} {$b->guest_email}");
                    $totalSent++;
                    continue;
                }

                $recipient = $b->guest_id
                    ? Guest::withoutGlobalScope(TenantScope::class)->find($b->guest_id)
                    : null;

                try {
                    $svc->sendEmail(
                        $form,
                        $recipient ?: ['name' => $b->guest_name, 'email' => $b->guest_email],
                        ['metadata' => ['booking_id' => $b->id, 'source' => 'post_stay_auto']],
                    );
                    $totalSent++;
                } catch (\Throwable $e) {
                    $this->error("  org#{$orgId} booking#{$b->id}: {$e->getMessage()}");
                }
            }
        }

        $verb = $dry ? 'would send' : 'sent';
        $this->info("Post-stay sweep: {$verb} {$totalSent} invitation(s); skipped {$totalSkipped} already-sent.");
        return self::SUCCESS;
    }
}

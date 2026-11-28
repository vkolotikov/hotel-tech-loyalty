<?php

namespace App\Console\Commands;

use App\Models\LeadFormEmailDelivery;
use App\Services\LeadForms\AutoReply;
use Illuminate\Console\Command;

/** Recover reservations made before a request/worker stopped. Attempted SMTP deliveries are never retried. */
final class SendPendingLeadFormReplies extends Command
{
    protected $signature = 'lead-forms:send-pending';
    protected $description = 'Send up to 20 unattempted, consented lead-form replies';

    public function handle(AutoReply $replies): int
    {
        foreach (LeadFormEmailDelivery::withoutGlobalScopes()->where('status', 'pending')->orderBy('id')->limit(20)->pluck('id') as $id) {
            $replies->deliver((int) $id);
        }
        return self::SUCCESS;
    }
}

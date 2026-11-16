<?php

namespace App\Jobs;

use App\Services\LeadForms\AutoReply;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;

final class SendLeadFormAutoReply implements ShouldQueue
{
    use Dispatchable, Queueable;

    public int $tries = 1;
    public int $timeout = 30;

    public function __construct(public int $deliveryId) {}

    public function handle(AutoReply $replies): void
    {
        $replies->deliver($this->deliveryId);
    }
}

<?php

namespace App\Services\Crm;

use App\Models\Brand;
use App\Models\Guest;
use App\Scopes\TenantScope;
use App\Services\Integrations\CrmMail;
use App\Services\Integrations\CrmWhatsApp;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

final class LeadCorrespondenceSync
{
    public function __construct(private readonly CrmMail $mail, private readonly CrmWhatsApp $whatsapp) {}

    public static function emailIdentity(Guest $guest): string
    {
        return hash('sha256', strtolower(trim((string) $guest->email)));
    }

    public static function phoneIdentity(Guest $guest): string
    {
        return hash('sha256', implode(',', CrmWhatsApp::phones($guest)));
    }

    public function run(int $limit = 12): int
    {
        $org = CrmMail::ORGANIZATION;
        $brand = CrmMail::BRAND;
        if (strlen((string) config('crm_mail.token')) < 32
            || ! Brand::withoutGlobalScope(TenantScope::class)->whereKey($brand)->where('organization_id', $org)->exists()) {
            return 0;
        }
        $guests = Guest::withoutGlobalScope(TenantScope::class)->where('guests.organization_id', $org)
            ->whereExists(fn ($q) => $q->selectRaw('1')->from('inquiries as i')->whereColumn('i.guest_id', 'guests.id')
                ->where('i.organization_id', $org)->where('i.brand_id', $brand))
            ->leftJoin('crm_correspondence_syncs as sync', fn ($join) => $join->on('sync.guest_id', '=', 'guests.id')->where('sync.brand_id', $brand))
            ->where(fn ($q) => $q->whereNull('sync.due_at')->orWhere('sync.due_at', '<=', now()))
            ->orderByRaw('CASE WHEN sync.due_at IS NULL THEN 0 ELSE 1 END')->orderBy('sync.due_at')->orderByDesc('guests.id')
            ->limit($limit)->get(['guests.id', 'guests.organization_id', 'guests.email', 'guests.phone', 'guests.mobile']);

        $processed = 0;
        $deadline = microtime(true) + 45;
        foreach ($guests as $guest) {
            if (microtime(true) >= $deadline) {
                break;
            }
            $key = ['organization_id' => $org, 'brand_id' => $brand, 'guest_id' => $guest->id];
            $query = DB::table('crm_correspondence_syncs')->where($key);
            DB::table('crm_correspondence_syncs')->insertOrIgnore([...$key, 'due_at' => now()]);
            $claim = (string) Str::uuid();
            if (! (clone $query)->where('due_at', '<=', now())->update(['claim' => $claim, 'due_at' => now()->addMinutes(3)])) {
                continue;
            }

            $row = $query->first();
            if (! $row) {
                continue;
            }
            $email = $this->email($guest, json_decode($row->email ?? '[]', true));
            $email = LeadMessageValue::capture($this->mail, $guest, $email);
            $wa = $this->whatsapp($guest, json_decode($row->whatsapp ?? '[]', true));
            $query->where('claim', $claim)->update([
                'claim' => null, 'due_at' => ! empty($email['cursor']) ? now()->addMinute() : now()->addMinutes(5),
                'email' => json_encode($email, JSON_THROW_ON_ERROR), 'whatsapp' => json_encode($wa, JSON_THROW_ON_ERROR),
            ]);
            $processed++;
        }

        return $processed;
    }

    private function email(Guest $guest, array $previous): array
    {
        $identity = self::emailIdentity($guest);
        $empty = ['identity' => $identity, 'threads' => []];
        $state = ($previous['identity'] ?? null) === $identity ? $previous : $empty;
        $cursor = $state['cursor'] ?? null;
        try {
            // A large historical backfill must continue to pick up fresh customer replies.
            if ($cursor && now()->timestamp - ($state['head_checked_at'] ?? 0) >= 900) {
                $head = $this->mail->read($guest, ['action' => 'capture'], 16);
                if (isset($head['code'])) {
                    return $empty;
                }
                if (isset($head['threads'])) {
                    $state['threads'] = $head['threads'];
                    $state['head_checked_at'] = now()->timestamp;
                }
            }
            $page = $this->mail->read($guest, ['action' => 'capture', 'cursor' => $cursor], 16);
        } catch (HttpExceptionInterface $error) {
            Log::notice('CRM lead email capture deferred', ['guest_id' => $guest->id, 'status' => $error->getStatusCode()]);

            return $state;
        }

        if (($page['code'] ?? '') === 'mail_cursor_expired') {
            unset($state['cursor']);

            return $state;
        }
        if (isset($page['code'])) {
            return $empty;
        }
        if (! isset($page['threads'], $page['snapshot_at']) || ! is_array($page['threads'])) {
            return $state;
        }
        if (! $cursor) {
            $state['head_checked_at'] = now()->timestamp;
        }
        $state['threads'] = $page['threads'];
        $next = $page['next_cursor'] ?? null;
        $oldest = $page['oldest_received_at'] ?? null;
        // Overlap the last completed scan to catch mail indexed late by Zoho. Cursors freeze the search across pages.
        $caughtUp = $oldest && isset($state['through']) && CarbonImmutable::parse($oldest)->lt(CarbonImmutable::parse($state['through'])->subDay());
        if ($next && ! $caughtUp) {
            $state['cursor'] = $next;
        } else {
            unset($state['cursor']);
            $state['through'] = $page['snapshot_at'];
        }

        return $state;
    }

    private function whatsapp(Guest $guest, array $previous): array
    {
        $identity = self::phoneIdentity($guest);
        $state = ['identity' => $identity, 'threads' => []];
        $page = $this->whatsapp->messages($guest, 1, true);
        if ($page['state'] === 'bridge_unavailable') {
            return ($previous['identity'] ?? null) === $identity ? $previous : $state;
        }
        if (in_array($page['state'], ['connected', 'needs_attention', 'awaiting_messages'], true)) {
            $state['threads'] = $page['threads'] ?? [];
        }

        return $state;
    }
}

<?php

namespace App\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/** Export counts and timestamps, never visitor identities, messages or private URLs. */
class BusinessOutcomeReport
{
    public const HOSTS = [
        'fds-cards.co.uk' => 'fds', 'fdscards.de' => 'fds-de', 'fdscards.fr' => 'fds-fr',
        'fdscards.es' => 'fds-es', 'fdscards.ee' => 'fds-ee', 'fdscards.lv' => 'fds-lv',
        'hexa-academy.co.uk' => 'academy-uk', 'hexa-academy.lv' => 'academy-lv',
        'hexa-tech.uk' => 'hexa', 'hotel-tech.ai' => 'hotel', 'hospitality.hexa-tech.uk' => 'hospitality',
        'gym.hexa-tech.uk' => 'gym', 'med.hexa-tech.uk' => 'med', 'beauty-tech.uk' => 'beauty',
    ];

    public function build(int $organization): array
    {
        $now = CarbonImmutable::now('UTC');
        $from = $now->startOfDay()->subDays(179);
        // Explicit organization predicates on BOTH sides prevent cross-tenant joins even if
        // a damaged foreign key points at another organization's conversation or enquiry.
        $messages = DB::table('chat_messages as m')->join('chat_conversations as c', 'c.id', '=', 'm.conversation_id')
            ->where('c.organization_id', $organization)->where('m.organization_id', $organization)
            ->where('m.sender_type', 'visitor')->where('m.created_at', '>=', $from)->where('m.created_at', '<=', $now)
            ->where(fn ($query) => $query->whereNull('c.channel')->orWhereIn('c.channel', ['web', 'widget']))
            ->select(['m.id', 'm.conversation_id', 'm.created_at', 'c.page_url', 'c.inquiry_id'])
            ->orderBy('m.id')->limit(20001)->get();
        $truncated = $messages->count() > 20000;
        $rows = [];
        $conversations = [];
        $inquiries = [];
        $append = function ($id, $at, $kind, $site) use (&$rows) {
            $rows[] = ['id' => $id, 'occurred_at' => CarbonImmutable::parse($at, 'UTC')->toIso8601String(),
                'kind' => $kind, 'site' => $site, 'product' => 'chat', 'amount' => null, 'currency' => null];
        };
        foreach ($messages->take(20000) as $message) {
            $host = preg_replace('/^www\./', '', strtolower(parse_url($message->page_url ?? '', PHP_URL_HOST) ?? ''));
            $site = self::HOSTS[$host] ?? null;
            if (! $site) {
                continue;
            }
            $append('message-'.$message->id, $message->created_at, 'chat_message', $site);
            $conversations[$message->conversation_id] ??= $site;
            if ($message->inquiry_id) {
                $inquiries[$message->inquiry_id] ??= $site;
            }
        }
        // Count a conversation only on its first visitor message, never an auto greeting.
        $first = DB::table('chat_messages')->where('organization_id', $organization)
            ->whereIn('conversation_id', array_keys($conversations))->where('sender_type', 'visitor')
            ->groupBy('conversation_id')->selectRaw('conversation_id, MIN(created_at) as started_at')->get();
        foreach ($first as $row) {
            if (CarbonImmutable::parse($row->started_at, 'UTC')->gte($from)) {
                $append('chat-'.$row->conversation_id, $row->started_at, 'chat_started', $conversations[$row->conversation_id]);
            }
        }
        // Saved inquiry identity is the dedupe key; mirrored builder leads never count again.
        foreach (DB::table('inquiries')->where('organization_id', $organization)->whereIn('id', array_keys($inquiries))
            ->where('created_at', '>=', $from)->where('created_at', '<=', $now)
            ->whereNull('external_source')->get(['id', 'created_at']) as $inquiry) {
            $append('chat-lead-'.$inquiry->id, $inquiry->created_at, 'chat_lead', $inquiries[$inquiry->id]);
        }
        usort($rows, fn ($a, $b) => strcmp($b['occurred_at'], $a['occurred_at']));

        return ['version' => 1, 'source' => 'chat', 'generated_at' => $now->toIso8601String(), 'timezone' => 'UTC',
            'from' => $from->toDateString(), 'to' => $now->toDateString(), 'rows' => $rows, 'truncated' => $truncated,
            'limits' => ['Owned-host web conversations only. Visitor messages exclude AI and staff replies.',
                'Enquiries require a saved CRM inquiry; messages alone are interactions.',
                'Builder imports are excluded; enquiry counts are records, not unique customers.',
                'No private messages or inferred advertising attribution are exported.']];
    }
}

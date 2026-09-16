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
            ->select(['m.id', 'm.conversation_id', 'm.created_at', 'c.page_url', 'c.inquiry_id', 'c.entry_source_channel', 'c.entry_source_site', 'c.marketing_attribution'])
            ->orderBy('m.id')->limit(20001)->get();
        $truncated = $messages->count() > 20000;
        $rows = [];
        $conversations = [];
        $inquiries = [];
        $entries = [];
        $append = function ($id, $at, $kind, $site, $source = 'unknown', $attribution = null) use (&$rows) {
            $row = ['id' => $id, 'occurred_at' => CarbonImmutable::parse($at, 'UTC')->toIso8601String(),
                'kind' => $kind, 'site' => $site, 'product' => 'chat', 'amount' => null, 'currency' => null, 'source_channel' => $source];
            if ($attribution) $row['attribution'] = $attribution;
            $rows[] = $row;
        };
        foreach ($messages->take(20000) as $message) {
            $host = preg_replace('/^www\./', '', strtolower(parse_url($message->page_url ?? '', PHP_URL_HOST) ?? ''));
            // A thread may resume on a different page or brand. Its captured entry site is immutable.
            $site = in_array($message->entry_source_site, self::HOSTS, true) ? $message->entry_source_site : (self::HOSTS[$host] ?? null);
            if (! $site) {
                continue;
            }
            $append('message-'.$message->id, $message->created_at, 'chat_message', $site);
            $conversations[$message->conversation_id] ??= $site;
            if ($message->inquiry_id) {
                $inquiries[$message->inquiry_id] ??= $site;
                $entries[$message->inquiry_id][] = ['site' => $site, 'at' => $message->created_at,
                    'source' => $message->entry_source_site === $site ? ($message->entry_source_channel ?? 'unknown') : 'unknown',
                    'attribution' => $message->marketing_attribution];
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
            $matching = collect($entries[$inquiry->id] ?? [])->where('site', $inquiries[$inquiry->id])->filter(fn ($e) => $e['at'] <= $inquiry->created_at);
            $candidates = $matching->pluck('source')->filter(fn ($s) => $s !== 'unknown')->unique();
            // NOT $truncated. That name already holds "the 20000-row cap was hit", which the
            // consumer uses to reject an incomplete replacement; reusing it here overwrote that
            // answer with one enquiry's touch-list truncation on every report containing an
            // enquiry, so a cut-off snapshot could be accepted and a complete one rejected.
            $touches = []; $touchesTruncated = false;
            foreach ($matching->pluck('attribution')->unique() as $raw) {
                $observed = WidgetAttribution::exported($raw, $inquiries[$inquiry->id], $inquiry->created_at);
                if ($observed) { $touches = array_merge($touches, $observed['touches']); $touchesTruncated = $touchesTruncated || $observed['truncated']; }
            }
            $touches = WidgetAttribution::cleanTouches($touches, $inquiry->created_at);
            if (count($touches) > 12) { $touches = array_merge([$touches[0]], array_slice($touches, -11)); $touchesTruncated = true; }
            $attribution = $touches ? ['version' => 1, 'touches' => $touches, 'truncated' => $touchesTruncated] : null;
            $known = collect($touches)->filter(fn ($t) => ! in_array($t['channel'], ['unknown', 'internal'], true))->last();
            $source = $known['channel'] ?? ($candidates->count() === 1 ? $candidates->first() : 'unknown');
            $append('chat-lead-'.$inquiry->id, $inquiry->created_at, 'chat_lead', $inquiries[$inquiry->id], $source, $attribution);
        }
        usort($rows, fn ($a, $b) => strcmp($b['occurred_at'], $a['occurred_at']));

        return ['version' => 1, 'source' => 'chat', 'generated_at' => $now->toIso8601String(), 'timezone' => 'UTC',
            'from' => $from->toDateString(), 'to' => $now->toDateString(), 'rows' => $rows, 'truncated' => $truncated,
            'limits' => ['Owned-host web conversations only. Visitor messages exclude AI and staff replies.',
                'Enquiries require a saved CRM inquiry; messages alone are interactions.',
                'Builder imports are excluded; enquiry counts are records, not unique customers.',
                'Consented observed channel/campaign touches are retained for new enquiries. Old conversations remain unknown. No private messages, URLs or click identifiers.',
                'Observed touches share a site and explicit chat session; they are not a complete cross-device journey or causal credit model.']];
    }

    public static function captureEntry(\App\Models\ChatConversation $conversation, string $url, ?int $visitorId = null): void
    {
        // page_url is refreshed on resume. Never use that mutable field to reconstruct an old source.
        if ($conversation->exists) return;
        // The SITE stays the page the chat is running on: that is which brand was being visited,
        // and it must not follow the visitor back to wherever they first arrived.
        $host = preg_replace('/^www\./', '', strtolower(parse_url($url, PHP_URL_HOST) ?? ''));
        $conversation->entry_source_site = self::HOSTS[$host] ?? null;
        if (! $conversation->entry_source_site) {
            $conversation->entry_source_channel = 'unknown';

            return;
        }
        // The CHANNEL comes from where they landed, which is a different page. $url is whatever
        // page the visitor had reached when they opened the panel, and a gclid or utm_* is long
        // gone by then -- so a paid click classified from that page alone looked like plain
        // organic search. The earliest page view of this session still holds both.
        $landing = self::landingView($visitorId);
        $conversation->entry_source_channel = self::entrySource($landing->url ?? $url, $landing->referrer ?? '');
    }

    /**
     * The first page of THIS browsing session, with the URL and referrer it carried.
     *
     * The lookback is deliberately short. A returning visitor's first ever page view is not
     * this conversation's acquisition, and crediting a months-old campaign for today's enquiry
     * is a worse answer than admitting the source is unknown.
     */
    private static function landingView(?int $visitorId): ?object
    {
        if (! $visitorId) {
            return null;
        }

        // Never fatal. This runs on the hot path of every new conversation, and losing a channel
        // label costs a line in a report while a thrown query costs the visitor their chat: the
        // init request 500s and the panel never opens. Reporting is not worth that trade.
        try {
            return DB::table('visitor_page_views')->where('visitor_id', $visitorId)
                ->where('viewed_at', '>=', CarbonImmutable::now('UTC')->subHours(6))
                ->orderBy('viewed_at')->orderBy('id')
                ->first(['url', 'referrer']);
        } catch (\Throwable $e) {
            \Log::warning('Landing page lookup failed; entry channel falls back to the current page', [
                'visitor_id' => $visitorId, 'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    private static function entrySource(string $url, string $referrer = ''): string
    {
        parse_str(parse_url($url, PHP_URL_QUERY) ?? '', $params);
        $source = is_string($params['utm_source'] ?? null) ? strtolower($params['utm_source']) : '';
        $medium = is_string($params['utm_medium'] ?? null) ? strtolower($params['utm_medium']) : '';
        $paid = in_array($medium, ['cpc', 'ppc', 'paid', 'paid_social', 'paidsocial', 'paid_search', 'display', 'cpm'], true);
        if (isset($params['gclid']) || isset($params['wbraid']) || isset($params['gbraid'])) return 'google';
        if ($paid && in_array($source, ['google', 'googleads', 'adwords'], true)) return 'google';
        if ($paid && in_array($source, ['facebook', 'fb', 'instagram', 'ig', 'meta'], true)) return 'meta';
        if ($paid && in_array($source, ['chatgpt', 'openai', 'chatgpt.com'], true)) return 'chatgpt';
        if ($medium === 'email') return 'email';
        if ($medium === 'organic') return 'organic';
        if (! $paid && in_array($source, ['facebook', 'fb', 'instagram', 'ig', 'meta', 'linkedin', 'tiktok'], true)) return 'social';
        // A Facebook click ID is shared by paid and organic clicks; it cannot prove ad spend.
        if (isset($params['fbclid'])) return 'social';

        // The referrer, which until now was never consulted: every visitor who arrived without
        // a utm_* tag or a click id was filed 'unknown', so ordinary search, social and referral
        // traffic was indistinguishable from traffic we genuinely could not see. The widget's own
        // browser-side classifier has had this fallback all along; the server did not.
        $host = preg_replace('/^www\./', '', strtolower((string) (parse_url($referrer, PHP_URL_HOST) ?? '')));
        if ($host === '') {
            // No referrer and no tag is not evidence of a direct visit: privacy settings, apps and
            // https-to-http hops all strip it. Unknown is the honest answer, not 'direct'.
            return 'unknown';
        }
        if (isset(self::HOSTS[$host])) return 'internal';
        if (preg_match('/^(google\.[a-z.]{2,}|bing\.com|duckduckgo\.com|search\.yahoo\.com|ecosia\.org|search\.brave\.com|yandex\.[a-z.]{2,})$/', $host)) return 'organic';
        if (preg_match('/(^|\.)(facebook\.com|instagram\.com|linkedin\.com|tiktok\.com|t\.co|x\.com|twitter\.com|pinterest\.[a-z.]{2,})$/', $host)) return 'social';

        return 'referral';
    }
}

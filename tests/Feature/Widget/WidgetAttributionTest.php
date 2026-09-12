<?php

namespace Tests\Feature\Widget;

use App\Models\ChatConversation;
use App\Services\WidgetAttribution;
use Illuminate\Http\Request;
use Tests\TestCase;

class WidgetAttributionTest extends TestCase
{
    private function request(array $touches, bool $consent = true, string $host = 'fdscards.lv'): Request
    {
        return Request::create('/', 'POST', ['analytics_consent' => $consent, 'page_url' => 'https://'.$host.'/?email=private@example.test',
            'attribution' => ['version' => 1, 'touches' => $touches, 'truncated' => false]]);
    }

    private function touch(string $channel, string $id, string $at): array
    {
        return ['channel' => $channel, 'campaign_id' => $id, 'observed_at' => $at, 'evidence' => 'utm',
            'email' => 'private@example.test', 'gclid' => 'secret', 'page_url' => 'https://private.test/'];
    }

    public function test_consent_site_boundary_and_frozen_enquiry_snapshot(): void
    {
        $this->travelTo(\Carbon\Carbon::parse('2026-09-12 12:00:00', 'UTC'));
        $conversation = new ChatConversation;
        $conversation->entry_source_site = 'fds-lv';
        $meta = $this->touch('meta', '12345', '2026-09-11T09:00:00Z');
        $google = $this->touch('google', '45678', '2026-09-12T09:00:00Z');
        WidgetAttribution::capture($conversation, $this->request([$meta], false));
        $this->assertNull($conversation->marketing_attribution);
        WidgetAttribution::capture($conversation, $this->request([$meta]));
        WidgetAttribution::capture($conversation, $this->request([$meta, $google]));
        $this->assertSame(['meta', 'google'], array_column($conversation->marketing_attribution['touches'], 'channel'));
        $this->assertStringNotContainsString('private', json_encode($conversation->marketing_attribution));
        $this->assertStringNotContainsString('gclid', json_encode($conversation->marketing_attribution));
        $snapshot = $conversation->marketing_attribution;
        WidgetAttribution::capture($conversation, $this->request([$this->touch('chatgpt', 'campaign-3', '2026-09-12T10:00:00Z')], true, 'fds-cards.co.uk'));
        $this->assertSame($snapshot, $conversation->marketing_attribution);
        $conversation->inquiry_id = 100;
        WidgetAttribution::capture($conversation, $this->request([$this->touch('chatgpt', 'campaign-3', '2026-09-12T10:00:00Z')]));
        $this->assertSame($snapshot, $conversation->marketing_attribution);
        WidgetAttribution::capture($conversation, $this->request([], false));
        $this->assertNull($conversation->marketing_attribution, 'A later consent withdrawal must remove the stored context, including frozen journeys.');
    }

    public function test_only_valid_recent_bounded_touches_are_retained(): void
    {
        $this->travelTo(\Carbon\Carbon::parse('2026-09-12 12:00:00', 'UTC'));
        $conversation = new ChatConversation;
        $rows = [];
        for ($i = 1; $i <= 12; $i++) $rows[] = $this->touch('meta', (string) $i, sprintf('2026-09-11T%02d:00:00Z', $i));
        WidgetAttribution::capture($conversation, $this->request($rows));
        WidgetAttribution::capture($conversation, $this->request([$this->touch('google', 'latest', '2026-09-12T09:00:00Z')]));
        $this->assertCount(12, $conversation->marketing_attribution['touches']);
        $this->assertSame('1', $conversation->marketing_attribution['touches'][0]['campaign_id']);
        $this->assertSame('latest', $conversation->marketing_attribution['touches'][11]['campaign_id']);
        $this->assertTrue($conversation->marketing_attribution['truncated']);
        $clean = WidgetAttribution::cleanTouches([
            $this->touch('meta', 'private@example.test', '2026-09-11T09:00:00Z'),
            $this->touch('meta', 'old', '2026-07-11T09:00:00Z'),
            $this->touch('google', 'future', '2026-09-13T09:00:00Z'),
            $this->touch('secret-channel', 'id', '2026-09-11T09:00:00Z'),
        ]);
        $this->assertCount(1, $clean);
        $this->assertNull($clean[0]['campaign_id']);
    }
}

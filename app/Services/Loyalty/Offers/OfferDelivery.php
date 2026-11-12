<?php

namespace App\Services\Loyalty\Offers;

use App\Models\{EmailCampaign, LoyaltyMember, SpecialOffer, SpecialOfferSend, User};
use App\Services\Loyalty\Campaigns\{CampaignAudience, CampaignBody, CampaignStart};
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\NotificationService;
use App\Support\AdvisoryLock;

/** A saved offer never sends; this outbox snapshots an explicitly confirmed, individual audience. */
final class OfferDelivery
{
    public function __construct(private CampaignAudience $audience, private CampaignStart $campaigns, private NotificationService $notifications) {}

    /** Explicit all-member selection still uses this offer's current eligibility and the shared campaign limit. */
    public function eligibleMemberIds(SpecialOffer $offer): array
    {
        $query = LoyaltyMember::query()->where('organization_id', $offer->getAttribute('organization_id'))->where('is_active', true);
        if ($offer->getAttribute('audience') === 'members') $query->whereIn('id', $offer->recipientIds());
        elseif ((array) $offer->tier_ids !== []) $query->whereIn('tier_id', $offer->tier_ids);
        $ids = [];
        $query->chunkById(500, function ($members) use ($offer, &$ids) {
            foreach ($members as $member) {
                if (!$offer->allowsMembership($member)) continue;
                $ids[] = (int) $member->id;
                if (count($ids) > CampaignAudience::LIMIT) throw new LoyaltyRefused('too_many', 'Choose selected members for an offer with more than 5,000 eligible members.');
            }
        });
        return $ids;
    }

    public function preview(SpecialOffer $offer, array $ids): array
    {
        if (!$offer->canDeliver()) throw new LoyaltyRefused('offer_unavailable', 'This offer has ended or is switched off.');
        $ids = self::ids($ids);
        $members = LoyaltyMember::query()->where('organization_id', $offer->getAttribute('organization_id'))->whereIn('id', $ids)->get();
        $allowed = $members->filter(fn ($m) => $m->is_active && $offer->allowsMembership($m));
        $allowedIds = self::ids($allowed->pluck('id')->all());
        $email = $this->audience->ofMembers($allowedIds, (int) $offer->getAttribute('organization_id'));
        $portal = self::ids($allowed->reject(fn ($m) => NotificationService::optsOut($m->notification_preferences, 'offers'))->pluck('id')->all());
        $counts = ['selected' => count($ids), 'eligible' => count($allowedIds), 'email' => count($email['reached']), 'portal' => count($portal),
            'ineligible' => count($ids) - count($allowedIds), 'no_consent' => $email['no_consent'], 'unsubscribed' => $email['unsubscribed'],
            'no_email' => $email['no_email'], 'suppressed' => $email['suppressed'], 'portal_off' => count($allowedIds) - count($portal)];
        $file = OfferFiles::file($offer);
        $revision = hash('sha256', json_encode([$offer->getAttributes(), $offer->recipientIds(), $file?->getAttributes(), $ids, $email['reached'], $portal], JSON_THROW_ON_ERROR));
        return ['revision' => $revision, 'member_ids' => $ids, 'counts' => $counts, 'email_ids' => $email['reached'], 'portal_ids' => $portal,
            'offer' => ['title' => $offer->title, 'description' => $offer->description, 'code' => $offer->getAttribute('code'),
                'start_date' => $offer->start_date->toDateString(), 'end_date' => $offer->end_date->toDateString(), 'attachment' => OfferFiles::metadata($offer)]];
    }

    public function send(SpecialOffer $offer, User $by, array $ids, string $revision, string $key): array
    {
        $ids = self::ids($ids);
        $hash = hash('sha256', json_encode([$offer->id, $ids, $revision], JSON_THROW_ON_ERROR));
        $send = AdvisoryLock::transaction('offer-send:'.$offer->getAttribute('organization_id').':'.$key, function () use ($offer, $by, $ids, $revision, $key, $hash) {
            $existing = SpecialOfferSend::query()->where('idempotency_key', $key)->first();
            if ($existing) {
                if (!hash_equals($existing->payload_hash, $hash)) throw new LoyaltyRefused('send_key_reused', 'This send key already belongs to a different confirmation.', 409);
                return $existing;
            }
            $locked = SpecialOffer::query()->whereKey($offer->id)->lockForUpdate()->firstOrFail();
            $preview = $this->preview($locked, $ids);
            if (!hash_equals($preview['revision'], $revision)) throw new LoyaltyRefused('audience_changed', 'The offer or its recipients changed. Preview it again.', 409);
            if ($preview['counts']['email'] + $preview['counts']['portal'] === 0) throw new LoyaltyRefused('nobody_to_send_to', 'None of the selected members can receive this offer.');
            $file = OfferFiles::file($locked, true);
            $snapshot = ['title' => $locked->title, 'description' => $locked->description, 'code' => $locked->getAttribute('code'),
                'start_date' => $locked->start_date->toDateString(), 'end_date' => $locked->end_date->toDateString(), 'attachment' => OfferFiles::metadata($locked)];
            $send = SpecialOfferSend::create(['organization_id' => $locked->getAttribute('organization_id'), 'offer_id' => $locked->id, 'created_by' => $by->id,
                'idempotency_key' => $key, 'payload_hash' => $hash, 'member_ids' => $preview['email_ids'], 'portal_ids' => $preview['portal_ids'],
                'counts' => $preview['counts'], 'snapshot' => $snapshot, 'attachment_content' => $file?->content]);
            if ($preview['email_ids'] !== []) {
                $blocks = [['id' => 'title', 'type' => 'heading', 'text' => $snapshot['title']]];
                foreach (mb_str_split($snapshot['description'], CampaignBody::MAX_TEXT) as $i => $text) $blocks[] = ['id' => 'text'.$i, 'type' => 'text', 'text' => $text];
                if ($snapshot['code']) $blocks[] = ['id' => 'code', 'type' => 'heading', 'text' => $snapshot['code'], 'level' => 3];
                $blocks[] = ['id' => 'dates', 'type' => 'text', 'text' => $snapshot['start_date'].' — '.$snapshot['end_date']];
                [$blocks, $problems] = CampaignBody::read($blocks);
                if ($problems !== []) throw new LoyaltyRefused('incomplete', 'The offer message is too long to send.');
                $html = CampaignBody::render($blocks);
                $subject = mb_substr(preg_replace('/[\r\n]+/', ' ', $locked->title), 0, 190);
                $send->forceFill(['snapshot' => $snapshot + ['body_html' => $html, 'subject' => $subject]])->save();
                $campaign = EmailCampaign::create(['name' => mb_substr($locked->title, 0, 120), 'subject' => $subject,
                    'body_html' => $html, 'body_text' => $snapshot['description'], 'body_blocks' => $blocks, 'status' => EmailCampaign::STATUS_DRAFT, 'created_by_user_id' => $by->id]);
                $campaign->forceFill(['offer_send_id' => $send->id])->save();
                $send->forceFill(['campaign_id' => $campaign->id])->save();
            }
            foreach ($preview['portal_ids'] as $id) {
                $member = LoyaltyMember::query()->findOrFail($id);
                $this->notifications->keep($member, ['type' => 'new_offer', 'title' => $locked->title, 'body' => $locked->description ?? '',
                    'data' => ['offer_id' => $locked->id, 'attachment' => $snapshot['attachment']]]);
            }
            $send->forceFill(['portal_done' => true])->save();
            return $send;
        });
        // The immutable outbox is committed before a queue worker can see this campaign.
        $campaign = $send->campaign_id ? EmailCampaign::query()->findOrFail($send->campaign_id) : null;
        if ($campaign?->status === EmailCampaign::STATUS_DRAFT) {
            try { $campaign = $this->campaigns->startFullAdmin($campaign, $by, $send->member_ids, offerDelivery: true); }
            catch (LoyaltyRefused $e) {
                $campaign->refresh();
                if ($campaign->status === EmailCampaign::STATUS_DRAFT) throw $e;
            }
        }
        if ($campaign && in_array($campaign->fresh()->status, [EmailCampaign::STATUS_FAILED, EmailCampaign::STATUS_CANCELLED], true)) {
            throw new LoyaltyRefused('offer_delivery_stopped', 'This email delivery failed or was cancelled. Prepare a new send to contact these members again.', 409);
        }
        return ['send_id' => (int) $send->id, 'counts' => $send->counts, 'email_status' => $campaign?->fresh()->status ?? 'none', 'portal_done' => (bool) $send->portal_done];
    }

    private static function ids(array $ids): array
    {
        $ids = array_values(array_unique(array_map('intval', $ids))); sort($ids); return $ids;
    }
}

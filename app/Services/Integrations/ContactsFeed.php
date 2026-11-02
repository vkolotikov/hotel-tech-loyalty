<?php

namespace App\Services\Integrations;

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

/** A bounded, resumable, read-only export. Every query enforces tenant and brand. */
class ContactsFeed
{
    public const COLUMNS = [
        'profiles' => ['full_name', 'first_name', 'last_name', 'email', 'phone', 'mobile', 'company', 'position_title', 'country', 'city', 'address', 'postal_code', 'preferred_language', 'email_consent', 'marketing_consent', 'consent_updated_at', 'lead_source', 'owner_name', 'lifecycle_status', 'importance', 'custom_data', 'created_at', 'updated_at'],
        'leads' => ['guest_id', 'corporate_account_id', 'event_name', 'inquiry_type', 'source', 'status', 'priority', 'special_requests', 'notes', 'custom_data', 'total_value', 'currency', 'paid_amount', 'payment_status', 'fulfillment_stage', 'next_task_type', 'next_task_due', 'next_task_notes', 'next_task_completed', 'last_contacted_at', 'last_contact_comment', 'pipeline_id', 'pipeline_stage_id', 'assigned_to', 'created_at', 'updated_at'],
        'activities' => ['guest_id', 'inquiry_id', 'type', 'direction', 'subject', 'body', 'duration_minutes', 'occurred_at', 'created_at', 'updated_at'],
        'tasks' => ['guest_id', 'inquiry_id', 'type', 'title', 'description', 'due_at', 'completed_at', 'outcome', 'custom_data', 'created_at', 'updated_at'],
        'conversations' => ['inquiry_id', 'visitor_id', 'visitor_name', 'visitor_email', 'visitor_phone', 'channel', 'status', 'agent_notes', 'last_message_at', 'created_at', 'updated_at'],
        'messages' => ['conversation_id', 'sender_type', 'content', 'content_type', 'direction', 'attachment_type', 'attachment_size', 'created_at'],
        'attachments' => ['inquiry_id', 'filename', 'mime_type', 'size_bytes', 'note', 'created_at', 'updated_at'],
    ];

    public function page(int $org, int $brand, int $limit, ?string $cursor): array
    {
        $resources = array_keys(self::COLUMNS);
        $state = ['resource' => 'profiles', 'after' => 0, 'brand' => $brand, 'org' => $org];
        if ($cursor !== null) {
            try {
                $state = json_decode(Crypt::decryptString($cursor), true, 16, JSON_THROW_ON_ERROR);
            } catch (DecryptException|\JsonException $e) {
                abort(422, 'Invalid feed cursor.');
            }
            abort_unless(is_array($state) && ($state['brand'] ?? null) === $brand && ($state['org'] ?? null) === $org
                && in_array($state['resource'] ?? null, $resources, true) && is_int($state['after'] ?? null) && $state['after'] >= 0, 422, 'Invalid feed cursor.');
        }
        $resource = $state['resource'];
        $rows = $this->query($resource, $org, $brand)->where('id', '>', $state['after'])->orderBy('id')->limit($limit + 1)
            ->get(['id', ...self::COLUMNS[$resource]]);
        $more = $rows->count() > $limit;
        $rows = $rows->take($limit);
        $nextResource = $resources[array_search($resource, $resources, true) + 1] ?? null;
        $next = $more ? [...$state, 'after' => (int) $rows->last()->id]
            : ($nextResource ? [...$state, 'resource' => $nextResource, 'after' => 0] : null);
        $contacts = [];
        $history = [];
        $guestLinks = $this->guestLinks($resource, $rows->all(), $org, $brand);
        foreach ($rows as $row) {
            $payload = (array) $row;
            foreach (['custom_data'] as $json) {
                if (isset($payload[$json]) && is_string($payload[$json])) {
                    $payload[$json] = json_decode($payload[$json], true, 64, JSON_THROW_ON_ERROR);
                }
            }
            $guest = $guestLinks[$row->id] ?? null;
            if ($resource === 'profiles') {
                $email = trim((string) $row->email);
                $validEmail = $email !== '' && Validator::make(['email' => $email], ['email' => 'email:rfc|max:320'])->passes();
                $contacts[] = ['external_id' => 'guest:'.$row->id, 'name' => $row->full_name ?: trim($row->first_name.' '.$row->last_name),
                    'company' => $row->company, 'country' => $row->country, 'city' => $row->city, 'address' => $row->address,
                    'emails' => $validEmail ? [$email] : [], 'phones' => array_values(array_unique(array_filter([$row->phone, $row->mobile]))),
                    'active' => true, 'relationship' => in_array(strtolower($row->lifecycle_status ?? ''), ['customer', 'active', 'loyal', 'repeat', 'first-time guest', 'returning guest', 'vip', 'corporate'], true) ? 'Customer' : 'Lead'];
            }
            $history[] = ['type' => $resource, 'external_id' => (string) $row->id,
                'contact_external_id' => $guest ? 'guest:'.$guest : null, 'data' => $payload];
        }

        return ['account_id' => 'hexatech:brand:'.$brand, 'contacts' => $contacts, 'crm_records' => $history,
            'next_cursor' => $next ? Crypt::encryptString(json_encode($next, JSON_THROW_ON_ERROR)) : null];
    }

    private function leads(int $org, int $brand): Builder
    {
        return DB::table('inquiries')->where('organization_id', $org)->where('brand_id', $brand);
    }

    private function visitors(int $org, int $brand): Builder
    {
        return DB::table('visitors')->where('organization_id', $org)->where('brand_id', $brand);
    }

    private function conversations(int $org, int $brand): Builder
    {
        return DB::table('chat_conversations')->where('organization_id', $org)->where('brand_id', $brand)
            ->where(fn (Builder $q) => $q->whereNotNull('inquiry_id')
                ->orWhereIn('visitor_id', $this->visitors($org, $brand)->whereNotNull('guest_id')->select('id'))
                ->orWhere(fn (Builder $notes) => $notes->whereNotNull('agent_notes')->where('agent_notes', '<>', ''))
                ->orWhereExists(fn (Builder $messages) => $messages->selectRaw('1')->from('chat_messages')
                    ->where('chat_messages.organization_id', $org)->whereColumn('conversation_id', 'chat_conversations.id')
                    ->whereIn('sender_type', ['visitor', 'agent', 'ai'])));
    }

    private function query(string $type, int $org, int $brand): Builder
    {
        if ($type === 'profiles') {
            return DB::table('guests')->where('organization_id', $org)->where(fn (Builder $q) => $q
                ->whereIn('id', $this->leads($org, $brand)->select('guest_id'))
                ->orWhereIn('id', $this->visitors($org, $brand)->select('guest_id'))
                ->orWhereIn('id', DB::table('tasks')->where('organization_id', $org)->where('brand_id', $brand)->select('guest_id'))
                ->orWhereIn('id', DB::table('activities')->where('organization_id', $org)->where('brand_id', $brand)->select('guest_id')));
        }
        if ($type === 'leads') {
            return $this->leads($org, $brand);
        }
        if ($type === 'conversations') {
            return $this->conversations($org, $brand);
        }
        if ($type === 'messages') {
            return DB::table('chat_messages')->where('organization_id', $org)
                ->whereIn('sender_type', ['visitor', 'agent', 'ai'])
                ->whereIn('conversation_id', $this->conversations($org, $brand)->select('id'));
        }
        if ($type === 'attachments') {
            return DB::table('inquiry_attachments')->where('organization_id', $org)
                ->whereIn('inquiry_id', $this->leads($org, $brand)->select('id'));
        }

        return DB::table($type)->where('organization_id', $org)->where(fn (Builder $q) => $q->where('brand_id', $brand)
            ->orWhere(fn (Builder $legacy) => $legacy->whereNull('brand_id')->whereIn('inquiry_id', $this->leads($org, $brand)->select('id'))));
    }

    /** Resolve page associations in batches; never perform a query per message. */
    private function guestLinks(string $type, array $rows, int $org, int $brand): array
    {
        $related = collect($rows);
        $conversations = collect();
        if ($type === 'messages') {
            $conversations = $this->conversations($org, $brand)->whereIn('id', $related->pluck('conversation_id'))->get()->keyBy('id');
            $related = $conversations;
        }
        $leads = $this->leads($org, $brand)->whereIn('id', $related->pluck('inquiry_id')->filter())->pluck('guest_id', 'id');
        $visitors = $this->visitors($org, $brand)->whereIn('id', $related->pluck('visitor_id')->filter())->pluck('guest_id', 'id');
        $links = [];
        foreach ($rows as $original) {
            $row = $type === 'messages' ? $conversations->get($original->conversation_id) : $original;
            $links[$original->id] = $type === 'profiles' ? $original->id
                : ($row->guest_id ?? $leads->get($row->inquiry_id ?? null) ?? $visitors->get($row->visitor_id ?? null));
        }
        $eligible = $this->query('profiles', $org, $brand)->whereIn('id', array_filter($links))->pluck('id')->all();
        foreach ($links as $id => $guest) {
            $links[$id] = $guest && in_array((int) $guest, array_map('intval', $eligible), true) ? (int) $guest : null;
        }

        return $links;
    }
}

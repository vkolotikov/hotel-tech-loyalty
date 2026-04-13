<?php

namespace App\Http\Controllers\Api\V1\Widget;

use App\Http\Controllers\Controller;
use App\Models\AiConversation;
use App\Models\BookingRoom;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\ChatbotBehaviorConfig;
use App\Models\ChatbotModelConfig;
use App\Models\ChatWidgetConfig;
use App\Models\PopupRule;
use App\Models\Visitor;
use App\Models\VisitorPageView;
use App\Services\AvailabilityService;
use App\Services\BookingContextService;
use App\Services\KnowledgeService;
use App\Services\OpenAiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class WidgetChatController extends Controller
{
    use \App\Traits\DispatchesAiChat;

    public function __construct(
        protected OpenAiService $openAi,
        protected KnowledgeService $knowledge,
        protected BookingContextService $bookingContext,
    ) {}

    /**
     * Find or create a Visitor record for this request. The fingerprint is a
     * hash of (org_id|ip|truncated user agent|optional cookie id) so the same
     * person opening multiple chat sessions or tabs from the same device
     * collapses into ONE visitor identity. We bump last_seen_at on every call
     * and increment visit_count when the gap since last activity exceeds
     * 30 minutes (a "new visit").
     */
    private function resolveVisitor(Request $request, int $orgId, ?string $cookieId = null): Visitor
    {
        $ip = (string) $request->ip();
        $ua = substr((string) $request->header('User-Agent'), 0, 500);
        // Fingerprint deliberately EXCLUDES the widget cookie — if a visitor
        // clears cookies or opens a private tab, the cookieId changes but
        // IP + UA usually don't, and we want those sessions to collapse to
        // the same Visitor row so the inbox shows a returning visit rather
        // than a fresh face. Matches the inbox's cascading dedup intent.
        $fingerprint = hash('sha256', $orgId . '|' . $ip . '|' . substr($ua, 0, 200));

        $visitor = Visitor::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('visitor_key', $fingerprint)
            ->first();

        $now      = now();
        $pageUrl  = $request->input('page_url') ?: $request->header('Referer');
        $pageTitle = $request->input('page_title');
        $referrer = $request->input('referrer') ?: $request->header('Referer');

        // Geolocate the IP (cached for 24h to keep us under free-tier limits).
        $geo = $this->geolocateIp($ip);

        if (!$visitor) {
            $visitor = Visitor::create([
                'organization_id'    => $orgId,
                'visitor_key'        => $fingerprint,
                'visitor_ip'         => $ip,
                'user_agent'         => $ua,
                'country'            => $geo['country'] ?? null,
                'city'               => $geo['city'] ?? null,
                'referrer'           => $referrer,
                'current_page'       => $pageUrl,
                'current_page_title' => $pageTitle,
                'first_seen_at'      => $now,
                'last_seen_at'       => $now,
                'visit_count'        => 1,
            ]);
        } else {
            // New visit if there's been a 30+ minute gap
            $isNewVisit = !$visitor->last_seen_at || $visitor->last_seen_at->lt($now->copy()->subMinutes(30));
            $visitor->fill([
                'visitor_ip'         => $ip,
                'user_agent'         => $ua,
                'last_seen_at'       => $now,
                'current_page'       => $pageUrl ?: $visitor->current_page,
                'current_page_title' => $pageTitle ?: $visitor->current_page_title,
            ]);
            // Backfill geo if missing
            if (empty($visitor->country) && !empty($geo['country'])) {
                $visitor->country = $geo['country'];
            }
            if (empty($visitor->city) && !empty($geo['city'])) {
                $visitor->city = $geo['city'];
            }
            if ($isNewVisit) {
                $visitor->visit_count = (int) $visitor->visit_count + 1;
            }
            $visitor->save();
        }

        return $visitor;
    }

    /**
     * Look up country/city for an IP using ip-api.com (free, no key, 45 req/min).
     * Results cached for 24h per IP. Skips private/local addresses.
     */
    private function geolocateIp(string $ip): array
    {
        if (!$ip || $ip === '127.0.0.1' || $ip === '::1' || str_starts_with($ip, '192.168.') || str_starts_with($ip, '10.')) {
            return [];
        }

        // Use a versioned key so prior bad cache entries (which stored partial
        // results without city) don't stick around. Only cache successful
        // lookups — empty results should be retried next time, not frozen
        // for 24h.
        $cacheKey = 'geoip_v2:' . $ip;
        $cached = \Cache::get($cacheKey);
        if (is_array($cached) && !empty($cached)) {
            return $cached;
        }

        try {
            $resp = \Illuminate\Support\Facades\Http::timeout(3)
                ->get("http://ip-api.com/json/{$ip}?fields=status,country,city,regionName");
            if ($resp->successful() && ($resp->json('status') === 'success')) {
                $geo = [
                    'country' => $resp->json('country'),
                    'city'    => $resp->json('city') ?: $resp->json('regionName'),
                ];
                if (!empty($geo['country']) || !empty($geo['city'])) {
                    \Cache::put($cacheKey, $geo, now()->addHours(24));
                    return $geo;
                }
            }
        } catch (\Throwable $e) {
            \Log::debug('GeoIP lookup failed: ' . $e->getMessage());
        }
        return [];
    }

    /**
     * Resolve the widget config and bind the org context so all
     * downstream scoped model queries work correctly.
     */
    private function resolveWidget(string $widgetKey): ?ChatWidgetConfig
    {
        $config = ChatWidgetConfig::withoutGlobalScopes()
            ->where('widget_key', $widgetKey)
            ->where('is_active', true)
            ->first();

        if ($config) {
            app()->instance('current_organization_id', $config->organization_id);
        }

        return $config;
    }

    /**
     * GET /v1/widget/{widgetKey}/config
     */
    public function getConfig(string $widgetKey): JsonResponse
    {
        $config = $this->resolveWidget($widgetKey);

        if (!$config) {
            return response()->json(['error' => 'Widget not found or inactive'], 404);
        }

        $behavior = ChatbotBehaviorConfig::where('organization_id', $config->organization_id)->first();
        $voiceConfig = \App\Models\VoiceAgentConfig::where('organization_id', $config->organization_id)->first();

        $primaryColor = $config->primary_color ?: (\App\Models\HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $config->organization_id)
            ->where('key', 'primary_color')
            ->value('value') ?: '#2d6a4f');

        return response()->json([
            'company_name'       => $config->company_name,
            'header_title'       => $config->header_title,
            'header_subtitle'    => $config->header_subtitle,
            'welcome_message'    => $config->welcome_message,
            'welcome_title'      => $config->welcome_title,
            'welcome_subtitle'   => $config->welcome_subtitle,
            'input_placeholder'  => $config->input_placeholder,
            'show_suggestions'   => $config->show_suggestions ?? true,
            'suggestions'        => $config->suggestions,
            'primary_color'      => $primaryColor,
            'header_text_color'  => $config->header_text_color ?? '#ffffff',
            'user_bubble_color'  => $config->user_bubble_color ?? $primaryColor,
            'user_bubble_text'   => $config->user_bubble_text ?? '#ffffff',
            'bot_bubble_color'   => $config->bot_bubble_color ?? '#f3f4f6',
            'bot_bubble_text'    => $config->bot_bubble_text ?? '#1f2937',
            'chat_bg_color'      => $config->chat_bg_color ?? '#ffffff',
            'font_family'        => $config->font_family ?? 'Inter',
            'border_radius'      => $config->border_radius ?? 16,
            'show_branding'      => $config->show_branding ?? true,
            'header_style'       => $config->header_style ?? 'solid',
            'header_gradient_end' => $config->header_gradient_end,
            'launcher_size'      => $config->launcher_size ?? 56,
            'position'           => $config->position,
            'icon_style'         => $config->icon_style,
            'launcher_shape'     => $config->launcher_shape,
            'launcher_icon'      => $config->launcher_icon,
            'lead_capture'       => [
                'enabled' => $config->lead_capture_enabled,
                'fields'  => $config->lead_capture_fields ?? ['name' => true, 'email' => true, 'phone' => false],
                'delay'   => $config->lead_capture_delay,
            ],
            'assistant_name'     => $behavior->assistant_name ?? 'Hotel Assistant',
            // Avatar must be an absolute URL — the widget runs on the
            // customer's website, so a relative `/storage/...` path would
            // resolve against THEIR domain and 404. Prepend our app URL.
            'assistant_avatar'   => $this->absolutizeUrl(
                $config->assistant_avatar_url ?: ($behavior->assistant_avatar ?? null)
            ),
            'branding_text'      => $config->branding_text,
            'input_hint_text'    => $config->input_hint_text,
            'agent_status'       => $config->agent_status ?? 'online',
            'offline_message'    => $config->offline_message,
            'voice_enabled'      => $voiceConfig && $voiceConfig->is_active && $voiceConfig->realtime_enabled,
            'is_open'            => $this->isWithinBusinessHours($config),
            'business_hours'     => $config->business_hours,
            'gdpr_consent_required' => (bool) $config->gdpr_consent_required,
            'gdpr_consent_text'  => $config->gdpr_consent_text,
            'booking_widget_url' => \App\Models\HotelSetting::withoutGlobalScopes()
                ->where('organization_id', $config->organization_id)
                ->where('key', 'booking_widget_url')
                ->value('value') ?: '',
            'has_booking_rooms'  => BookingRoom::withoutGlobalScopes()
                ->where('organization_id', $config->organization_id)
                ->where('is_active', true)
                ->exists(),
            'organization_id'    => $config->organization_id,
        ]);
    }

    /**
     * Turn a stored relative path like `/storage/chat-avatars/foo.jpg` into
     * an absolute URL using the app's configured base URL. The widget is
     * embedded on the CUSTOMER's website, not ours, so relative paths break.
     */
    private function absolutizeUrl(?string $url): ?string
    {
        if (!$url) return null;
        if (preg_match('#^https?://#i', $url)) return $url;
        $base = rtrim(config('app.url') ?: url('/'), '/');
        return $base . '/' . ltrim($url, '/');
    }

    /**
     * Decide whether the widget is currently within configured business
     * hours. The `business_hours` JSON looks like:
     *   { "mon": [{"open":"09:00","close":"17:00"}], "tue": [...], ... }
     * Empty array for a day = closed all day. Missing config = always open
     * (back-compat — existing widgets without hours configured stay open).
     */
    private function isWithinBusinessHours(ChatWidgetConfig $config): bool
    {
        $hours = $config->business_hours;
        if (empty($hours) || !is_array($hours)) return true;

        try {
            $tz = $config->timezone ?: config('app.timezone', 'UTC');
            $now = now($tz);
        } catch (\Throwable $e) {
            $now = now();
        }

        $dayKey = strtolower($now->format('D')); // mon, tue, ...
        $dayKey = substr($dayKey, 0, 3);
        $windows = $hours[$dayKey] ?? null;
        if ($windows === null) return true; // not configured for today = open
        if (!is_array($windows) || count($windows) === 0) return false; // explicitly closed

        $cur = $now->format('H:i');
        foreach ($windows as $w) {
            $open  = $w['open']  ?? null;
            $close = $w['close'] ?? null;
            if ($open && $close && $cur >= $open && $cur <= $close) {
                return true;
            }
        }
        return false;
    }

    /**
     * POST /v1/widget/{widgetKey}/init
     */
    public function initSession(Request $request, string $widgetKey): JsonResponse
    {
        try {
            $config = $this->resolveWidget($widgetKey);

            if (!$config) {
                return response()->json(['error' => 'Widget not found'], 404);
            }

            $requestedSessionId = $request->input('session_id');
            $visitorName = $request->input('visitor_name');
            $cookieId    = $request->input('visitor_cookie');

            // Resolve persistent visitor identity (dedupes by fingerprint).
            $visitor = $this->resolveVisitor($request, (int) $config->organization_id, $cookieId);

            // If the widget sent an existing session_id, verify it actually
            // belongs to this org so we don't resume someone else's thread.
            $existingConv = null;
            if ($requestedSessionId) {
                $existingConv = ChatConversation::where('session_id', $requestedSessionId)
                    ->where('organization_id', $config->organization_id)
                    ->first();
            }
            $sessionId = $existingConv ? $existingConv->session_id : Str::uuid()->toString();

            $userAgent = substr((string) $request->header('User-Agent'), 0, 500);
            $pageUrl   = $request->input('page_url') ?: $request->header('Referer');

            AiConversation::updateOrCreate(
                ['session_id' => $sessionId],
                [
                    'organization_id' => $config->organization_id,
                    'member_id' => null,
                    'messages' => [],
                    'model' => 'gpt-4o',
                    'is_active' => true,
                ]
            );

            ChatConversation::updateOrCreate(
                ['session_id' => $sessionId],
                [
                    'organization_id'    => $config->organization_id,
                    'visitor_id'         => $visitor->id,
                    'visitor_name'       => $visitorName ?: $visitor->display_name,
                    'visitor_email'      => $visitor->email,
                    'visitor_phone'      => $visitor->phone,
                    'visitor_ip'         => $visitor->visitor_ip,
                    'visitor_user_agent' => $userAgent,
                    'page_url'           => $pageUrl,
                    'channel'            => 'widget',
                    'status'             => 'active',
                    'last_message_at'    => now(),
                ]
            );

            // When resuming, return prior messages so the widget can
            // rehydrate the thread instead of showing an empty panel.
            $history = [];
            if ($existingConv) {
                $history = ChatMessage::where('conversation_id', $existingConv->id)
                    ->orderBy('id')
                    ->limit(200)
                    ->get(['id', 'sender_type', 'content', 'attachment_url', 'attachment_type', 'created_at'])
                    ->map(fn ($m) => [
                        'id'              => $m->id,
                        'sender_type'     => $m->sender_type,
                        'content'         => $m->content,
                        'attachment_url'  => $m->attachment_url,
                        'attachment_type' => $m->attachment_type,
                        'created_at'      => optional($m->created_at)->toIso8601String(),
                    ])->toArray();
            }

            return response()->json([
                'session_id'      => $sessionId,
                'visitor_id'      => $visitor->id,
                'visitor_key'     => $visitor->visitor_key,
                'welcome_message' => $config->welcome_message,
                'messages'        => $history,
            ]);
        } catch (\Throwable $e) {
            \Log::error('Widget init error: ' . $e->getMessage(), ['file' => $e->getFile() . ':' . $e->getLine()]);
            return response()->json(['error' => 'Init failed', 'debug' => config('app.debug') ? $e->getMessage() : null], 500);
        }
    }

    /**
     * POST /v1/widget/{widgetKey}/message
     */
    public function sendMessage(Request $request, string $widgetKey): JsonResponse
    {
        $request->validate([
            'message'    => 'required|string|max:2000',
            'session_id' => 'required|string|max:64',
            'lang'       => 'nullable|string|max:16',
        ]);

        $config = $this->resolveWidget($widgetKey);

        if (!$config) {
            return response()->json(['error' => 'Widget not found'], 404);
        }

        $orgId = $config->organization_id;
        $behaviorConfig = ChatbotBehaviorConfig::where('organization_id', $orgId)->first();
        $modelConfig = ChatbotModelConfig::where('organization_id', $orgId)->first();

        // If an agent has muted the AI on this conversation, just record the
        // visitor message and return — a human will reply from the inbox.
        $existingChatConv = ChatConversation::where('session_id', $request->session_id)
            ->where('organization_id', $orgId)
            ->first();
        if ($existingChatConv && $existingChatConv->ai_enabled === false) {
            try {
                $visitor = $this->resolveVisitor($request, (int) $orgId);
                $visitor->increment('messages_count');
                if (!$existingChatConv->visitor_id) {
                    $existingChatConv->visitor_id = $visitor->id;
                }
            } catch (\Throwable $e) {
                \Log::warning('Widget visitor heartbeat (ai-disabled) failed: ' . $e->getMessage());
            }
            ChatMessage::create([
                'conversation_id' => $existingChatConv->id,
                'sender_type' => 'visitor',
                'content' => $request->message,
                'created_at' => now(),
            ]);
            $existingChatConv->update([
                'last_message_at' => now(),
                'messages_count'  => $existingChatConv->messages_count + 1,
                'status'          => 'waiting',
            ]);
            return response()->json([
                'response'   => null,
                'ai_paused'  => true,
                'session_id' => $request->session_id,
            ]);
        }

        // Get knowledge context
        $knowledgeContext = '';
        try {
            $knowledgeContext = $this->knowledge->getKnowledgeContext($request->message, $orgId);
        } catch (\Throwable $e) {
            \Log::warning('Widget knowledge lookup failed: ' . $e->getMessage());
        }

        // Get booking context — room catalog + live availability when booking intent detected.
        // Only inject when the visitor is actually asking about rooms/booking to save tokens.
        $bookingContextStr = '';
        try {
            $bookingIntent = $this->bookingContext->detectBookingIntent($request->message);
            if ($bookingIntent['has_intent']) {
                $rooms = $this->bookingContext->getRoomCatalog($orgId);
                if (!empty($rooms)) {
                    $bookingContextStr = $this->bookingContext->buildRoomCatalogPrompt($orgId);

                    // If dates detected, fetch live availability
                    if ($bookingIntent['check_in'] && $bookingIntent['check_out']) {
                        $available = $this->bookingContext->checkAvailability(
                            $orgId,
                            $bookingIntent['check_in'],
                            $bookingIntent['check_out'],
                            $bookingIntent['adults'] ?? 2,
                            $bookingIntent['children'] ?? 0,
                        );
                        $bookingContextStr .= "\n" . $this->bookingContext->buildAvailabilityPrompt(
                            $available, $bookingIntent['check_in'], $bookingIntent['check_out']
                        );
                    }
                }
            }
        } catch (\Throwable $e) {
            \Log::warning('Widget booking context failed: ' . $e->getMessage());
        }

        // Load or create conversation
        $conversation = AiConversation::firstOrCreate(
            ['session_id' => $request->session_id],
            [
                'organization_id' => $orgId,
                'member_id' => null,
                'messages' => [],
                'model' => $modelConfig->model_name ?? 'gpt-4o',
                'is_active' => true,
            ]
        );

        $messages = $conversation->messages ?? [];
        $messages[] = ['role' => 'user', 'content' => $request->message, 'timestamp' => now()->toIso8601String()];

        // Resolve booking widget URL for room card links
        $bookingWidgetUrl = '';
        try {
            $bookingSetting = \App\Models\HotelSetting::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('key', 'booking_widget_url')
                ->value('value');
            $bookingWidgetUrl = $bookingSetting ?: '';
        } catch (\Throwable) {}

        $systemPrompt = $this->buildWidgetSystemPrompt($behaviorConfig, $knowledgeContext, $config->company_name, $request->input('lang'), $bookingContextStr, $bookingWidgetUrl);

        $contextMessages = array_slice(
            array_map(fn($m) => ['role' => $m['role'], 'content' => $m['content']], $messages),
            -20
        );

        $provider = $modelConfig->provider ?? 'openai';
        $model = $modelConfig->model_name ?? 'gpt-4o';
        $temperature = (float) ($modelConfig->temperature ?? 0.7);
        $maxTokens = (int) ($modelConfig->max_tokens ?? 500);
        $extraParams = array_filter([
            'top_p'             => $modelConfig->top_p ?? null,
            'frequency_penalty' => $modelConfig->frequency_penalty ?? null,
            'presence_penalty'  => $modelConfig->presence_penalty ?? null,
            'stop_sequences'    => $modelConfig->stop_sequences ?? null,
        ], fn($v) => $v !== null);

        try {
            $aiResponse = $this->callProvider($provider, $systemPrompt, $contextMessages, $model, $temperature, $maxTokens, $extraParams);
        } catch (\Throwable $e) {
            \Log::error("Widget chat error [{$provider}/{$model}]: " . $e->getMessage());
            $aiResponse = $behaviorConfig->fallback_message
                ?? "I'm sorry, I'm having trouble responding right now. Please try again shortly.";
        }

        $messages[] = ['role' => 'assistant', 'content' => $aiResponse, 'timestamp' => now()->toIso8601String()];

        $conversation->update([
            'messages' => $messages,
            'tokens_used' => $conversation->tokens_used + (int) (strlen($aiResponse) / 4),
        ]);

        // Bump visitor heartbeat so they stay "online" while chatting.
        try {
            $visitor = $this->resolveVisitor($request, (int) $orgId);
            $visitor->increment('messages_count');
        } catch (\Throwable $e) {
            \Log::warning('Widget visitor heartbeat (sendMessage) failed: ' . $e->getMessage());
            $visitor = null;
        }

        // Store in chat_messages for inbox
        $aiMessageId = null;
        try {
            $chatConv = ChatConversation::where('session_id', $request->session_id)->first();
            if ($chatConv && $visitor && !$chatConv->visitor_id) {
                $chatConv->visitor_id = $visitor->id;
            }
            if ($chatConv) {
                ChatMessage::create([
                    'conversation_id' => $chatConv->id,
                    'sender_type' => 'visitor',
                    'content' => $request->message,
                    'created_at' => now(),
                ]);
                $aiMsg = ChatMessage::create([
                    'conversation_id' => $chatConv->id,
                    'sender_type' => 'ai',
                    'content' => $aiResponse,
                    'created_at' => now(),
                ]);
                $aiMessageId = $aiMsg->id;
                $chatConv->update([
                    'last_message_at' => now(),
                    'messages_count' => $chatConv->messages_count + 2,
                ]);
            }
        } catch (\Throwable $e) {
            \Log::warning('Widget inbox save failed: ' . $e->getMessage());
        }

        return response()->json([
            'response'      => $aiResponse,
            'session_id'    => $request->session_id,
            'ai_message_id' => $aiMessageId,
        ]);
    }

    /**
     * POST /v1/widget/{widgetKey}/lead
     */
    public function captureLead(Request $request, string $widgetKey): JsonResponse
    {
        $validated = $request->validate([
            'name'       => 'nullable|string|max:120',
            'email'      => 'nullable|email|max:180',
            'phone'      => 'nullable|string|max:30',
            'message'    => 'nullable|string|max:2000',
            'session_id' => 'nullable|string|max:64',
        ]);

        $config = $this->resolveWidget($widgetKey);

        if (!$config) {
            return response()->json(['error' => 'Widget not found'], 404);
        }

        $orgId = $config->organization_id;

        $guest = null;
        if (!empty($validated['email'])) {
            $guest = \App\Models\Guest::where('organization_id', $orgId)
                ->where('email', $validated['email'])
                ->first();
        }

        if (!$guest) {
            $nameParts = explode(' ', $validated['name'] ?? 'Widget Visitor', 2);
            $guest = \App\Models\Guest::create([
                'organization_id'  => $orgId,
                'first_name'       => $nameParts[0] ?? '',
                'last_name'        => $nameParts[1] ?? '',
                'full_name'        => $validated['name'] ?? 'Widget Visitor',
                'email'            => $validated['email'] ?? null,
                'phone'            => $validated['phone'] ?? null,
                'guest_type'       => 'Individual',
                'lead_source'      => 'Chat Widget',
                'last_activity_at' => now(),
                // lifecycle_status is set to 'Prospect' by the Guest::created
                // hook (GuestLifecycleService::initialize) so it stays in sync
                // with the canonical lifecycle vocabulary.
            ]);
        }

        $inquiry = \App\Models\Inquiry::create([
            'organization_id' => $orgId,
            'guest_id'        => $guest->id,
            'notes'           => $validated['message'] ?? null,
            'source'          => 'chatbot',
            'status'          => 'new',
            'inquiry_type'    => 'general',
        ]);

        // Mark the visitor as a lead and link to the guest so the admin
        // visitors view shows the lead badge and can jump to the guest record.
        try {
            $visitor = $this->resolveVisitor($request, $orgId);
            $visitor->fill([
                'is_lead'      => true,
                'guest_id'     => $guest->id,
                'display_name' => $validated['name'] ?? $visitor->display_name,
                'email'        => $validated['email'] ?? $visitor->email,
                'phone'        => $validated['phone'] ?? $visitor->phone,
            ])->save();

            // Also link any existing chat conversation for this session.
            if (!empty($validated['session_id'])) {
                ChatConversation::where('session_id', $validated['session_id'])
                    ->update([
                        'visitor_id'   => $visitor->id,
                        'lead_captured' => true,
                        'inquiry_id'   => $inquiry->id,
                        'visitor_name' => $validated['name'] ?? null,
                        'visitor_email'=> $validated['email'] ?? null,
                        'visitor_phone'=> $validated['phone'] ?? null,
                    ]);
            }
        } catch (\Throwable $e) {
            \Log::warning('Widget lead visitor link failed: ' . $e->getMessage());
        }

        return response()->json([
            'success'    => true,
            'inquiry_id' => $inquiry->id,
            'guest_id'   => $guest->id,
        ]);
    }

    /**
     * POST /v1/widget/{widgetKey}/heartbeat — keep visitor "online" status fresh.
     * Called every ~30s while the page is open.
     */
    public function heartbeat(Request $request, string $widgetKey): JsonResponse
    {
        $config = $this->resolveWidget($widgetKey);
        if (!$config) return response()->json(['error' => 'Widget not found'], 404);

        $visitor = $this->resolveVisitor($request, (int) $config->organization_id, $request->input('visitor_cookie'));

        return response()->json([
            'visitor_id' => $visitor->id,
            'online'     => true,
        ]);
    }

    /**
     * GET /v1/widget/{widgetKey}/poll
     *
     * Long-poll-style endpoint the embedded widget hits every few seconds while
     * the chat panel is open. Returns any agent/ai/system messages with id
     * greater than `since_id`, plus the current "agent typing" indicator and
     * the active human agent's name/avatar (when a human has taken over).
     * This is what makes agent inbox replies actually appear in the visitor's
     * widget — without it, the AI pause/resume feature is half-broken because
     * the visitor never sees the human's reply.
     */
    public function poll(Request $request, string $widgetKey): JsonResponse
    {
        $request->validate([
            'session_id' => 'required|string|max:64',
            'since_id'   => 'nullable|integer|min:0',
        ]);

        $config = $this->resolveWidget($widgetKey);
        if (!$config) {
            return response()->json(['error' => 'Widget not found'], 404);
        }

        $conv = ChatConversation::where('session_id', $request->session_id)
            ->where('organization_id', $config->organization_id)
            ->first();

        if (!$conv) {
            return response()->json([
                'messages'     => [],
                'agent_typing' => false,
                'active_agent' => null,
                'ai_paused'    => false,
            ]);
        }

        $sinceId = (int) $request->input('since_id', 0);

        // Only deliver messages that did NOT originate from the visitor — the
        // visitor already has their own messages locally, so echoing them back
        // would cause duplicates. Agent + AI + system messages are what we
        // need to push down.
        $messages = ChatMessage::where('conversation_id', $conv->id)
            ->where('id', '>', $sinceId)
            ->whereIn('sender_type', ['agent', 'ai', 'system'])
            ->orderBy('id')
            ->get(['id', 'sender_type', 'content', 'attachment_url', 'attachment_type', 'created_at'])
            ->map(fn ($m) => [
                'id'              => $m->id,
                'sender_type'     => $m->sender_type,
                'content'         => $m->content,
                'attachment_url'  => $m->attachment_url,
                'attachment_type' => $m->attachment_type,
                'created_at'      => optional($m->created_at)->toIso8601String(),
            ]);

        // Mark delivered agent messages as read so the inbox stops showing
        // them as "unread" once the visitor's widget has actually fetched them.
        if ($messages->count() > 0) {
            ChatMessage::where('conversation_id', $conv->id)
                ->where('id', '>', $sinceId)
                ->where('sender_type', 'agent')
                ->update(['is_read' => true]);
        }

        $agentTyping = $conv->agent_typing_until && $conv->agent_typing_until->isFuture();

        return response()->json([
            'messages'     => $messages,
            'agent_typing' => (bool) $agentTyping,
            'active_agent' => $conv->active_agent_name ? [
                'name'   => $conv->active_agent_name,
                'avatar' => $conv->active_agent_avatar,
            ] : null,
            'ai_paused'    => $conv->ai_enabled === false,
            'status'       => $conv->status,
            'prompt_rating' => $conv->rating_requested && !$conv->rating,
        ]);
    }

    /**
     * POST /v1/widget/{widgetKey}/rate — visitor submits a 1-5 rating + comment.
     */
    public function rateConversation(Request $request, string $widgetKey): JsonResponse
    {
        $request->validate([
            'session_id' => 'required|string|max:64',
            'rating'     => 'required|integer|between:1,5',
            'comment'    => 'nullable|string|max:1000',
        ]);

        $config = $this->resolveWidget($widgetKey);
        if (!$config) return response()->json(['error' => 'Widget not found'], 404);

        $conv = ChatConversation::where('session_id', $request->session_id)
            ->where('organization_id', $config->organization_id)
            ->first();
        if (!$conv) return response()->json(['error' => 'Conversation not found'], 404);

        $conv->update([
            'rating'           => $request->rating,
            'rating_comment'   => $request->comment,
            'rating_requested' => false,
        ]);

        return response()->json(['ok' => true]);
    }

    /**
     * POST /v1/widget/{widgetKey}/typing
     *
     * Visitor is typing — set a short window (~5s) so the agent inbox can show
     * a typing indicator. Idempotent: clients call this every keystroke.
     */
    public function visitorTyping(Request $request, string $widgetKey): JsonResponse
    {
        $request->validate([
            'session_id' => 'required|string|max:64',
            'typing'     => 'nullable|boolean',
        ]);

        $config = $this->resolveWidget($widgetKey);
        if (!$config) {
            return response()->json(['error' => 'Widget not found'], 404);
        }

        $conv = ChatConversation::where('session_id', $request->session_id)
            ->where('organization_id', $config->organization_id)
            ->first();

        if (!$conv) {
            return response()->json(['ok' => false], 404);
        }

        $isTyping = $request->boolean('typing', true);
        $conv->visitor_typing_until = $isTyping ? now()->addSeconds(5) : null;
        $conv->save();

        return response()->json(['ok' => true]);
    }

    /**
     * POST /v1/widget/{widgetKey}/upload
     *
     * Visitor uploads an image/file as part of the conversation. We persist
     * the file under storage/app/public/chat-attachments/ and create a
     * chat_message row tagged with the attachment metadata so the agent
     * inbox can render a thumbnail/link inline. Allowed types are limited
     * to common image/document mime types and the size cap is 8MB to keep
     * abuse contained.
     */
    public function uploadAttachment(Request $request, string $widgetKey): JsonResponse
    {
        $request->validate([
            'session_id' => 'required|string|max:64',
            'file'       => 'required|file|max:8192|mimes:jpg,jpeg,png,gif,webp,pdf,doc,docx,txt',
        ]);

        $config = $this->resolveWidget($widgetKey);
        if (!$config) return response()->json(['error' => 'Widget not found'], 404);

        $conv = ChatConversation::where('session_id', $request->session_id)
            ->where('organization_id', $config->organization_id)
            ->first();

        if (!$conv) {
            return response()->json(['error' => 'Conversation not found'], 404);
        }

        $file = $request->file('file');
        $path = $file->storePublicly('chat-attachments', 'public');
        $url  = '/storage/' . $path;
        $type = str_starts_with((string) $file->getMimeType(), 'image/') ? 'image' : 'file';

        $msg = ChatMessage::create([
            'conversation_id'  => $conv->id,
            'sender_type'      => 'visitor',
            'content'          => $file->getClientOriginalName(),
            'attachment_url'   => $url,
            'attachment_type'  => $type,
            'attachment_size'  => $file->getSize(),
            'created_at'       => now(),
        ]);

        $conv->update([
            'last_message_at' => now(),
            'messages_count'  => $conv->messages_count + 1,
            'status'          => $conv->status === 'resolved' ? 'waiting' : $conv->status,
        ]);

        return response()->json([
            'ok'              => true,
            'message_id'      => $msg->id,
            'attachment_url'  => $url,
            'attachment_type' => $type,
        ]);
    }

    /**
     * POST /v1/widget/{widgetKey}/page-view — record a page navigation.
     * Body: { url, title, referrer, duration_seconds (for previous page) }
     */
    public function pageView(Request $request, string $widgetKey): JsonResponse
    {
        $request->validate([
            'url'              => 'required|string|max:2000',
            'title'            => 'nullable|string|max:500',
            'referrer'         => 'nullable|string|max:2000',
            'duration_seconds' => 'nullable|integer|min:0|max:86400',
        ]);

        $config = $this->resolveWidget($widgetKey);
        if (!$config) return response()->json(['error' => 'Widget not found'], 404);

        $visitor = $this->resolveVisitor($request, (int) $config->organization_id, $request->input('visitor_cookie'));

        $pv = VisitorPageView::create([
            'organization_id'  => $config->organization_id,
            'visitor_id'       => $visitor->id,
            'url'              => $request->input('url'),
            'title'            => $request->input('title'),
            'referrer'         => $request->input('referrer'),
            'duration_seconds' => $request->input('duration_seconds'),
            'viewed_at'        => now(),
        ]);

        $visitor->increment('page_views_count');
        $visitor->fill([
            'current_page'       => $request->input('url'),
            'current_page_title' => $request->input('title'),
        ])->save();

        return response()->json(['ok' => true, 'page_view_id' => $pv->id]);
    }

    /**
     * GET /v1/widget/{widgetKey}/popup-rules
     */
    public function getPopupRules(string $widgetKey): JsonResponse
    {
        $config = $this->resolveWidget($widgetKey);

        if (!$config) {
            return response()->json(['rules' => []]);
        }

        $rules = PopupRule::where('organization_id', $config->organization_id)
            ->active()
            ->orderByDesc('priority')
            ->get(['id', 'trigger_type', 'trigger_value', 'url_match_type', 'url_match_value', 'visitor_type', 'language_targets', 'message', 'quick_replies', 'priority']);

        return response()->json(['rules' => $rules]);
    }

    /**
     * POST /v1/widget/{widgetKey}/popup-impression
     *
     * Called by the widget when a specific popup rule is actually shown to the
     * visitor. Only increments the single rule that fired, not all active rules.
     */
    public function popupImpression(Request $request, string $widgetKey): JsonResponse
    {
        $request->validate(['rule_id' => 'required|integer']);

        $config = $this->resolveWidget($widgetKey);
        if (!$config) return response()->json(['error' => 'Widget not found'], 404);

        PopupRule::where('organization_id', $config->organization_id)
            ->where('id', $request->rule_id)
            ->increment('impressions_count');

        return response()->json(['ok' => true]);
    }

    private function buildWidgetSystemPrompt(?ChatbotBehaviorConfig $config, string $knowledgeContext, string $companyName, ?string $userLang = null, string $bookingContext = '', string $bookingWidgetUrl = ''): string
    {
        $parts = [];

        // Language instruction — match the user's browser/voice locale so replies are in their language.
        if ($userLang) {
            $langMap = [
                'en' => 'English', 'es' => 'Spanish', 'fr' => 'French', 'de' => 'German',
                'it' => 'Italian', 'pt' => 'Portuguese', 'nl' => 'Dutch', 'pl' => 'Polish',
                'ru' => 'Russian', 'uk' => 'Ukrainian', 'lv' => 'Latvian', 'lt' => 'Lithuanian',
                'et' => 'Estonian', 'fi' => 'Finnish', 'sv' => 'Swedish', 'no' => 'Norwegian',
                'da' => 'Danish', 'cs' => 'Czech', 'sk' => 'Slovak', 'hu' => 'Hungarian',
                'ro' => 'Romanian', 'bg' => 'Bulgarian', 'el' => 'Greek', 'tr' => 'Turkish',
                'ar' => 'Arabic', 'he' => 'Hebrew', 'zh' => 'Chinese', 'ja' => 'Japanese',
                'ko' => 'Korean', 'hi' => 'Hindi',
            ];
            $prefix = strtolower(explode('-', $userLang)[0]);
            $langName = $langMap[$prefix] ?? $userLang;
            $parts[] = "IMPORTANT: Reply in {$langName}. The user's preferred language is {$userLang}. Always respond in the same language as the user, unless they explicitly switch.";
        }

        if ($config && $config->identity) {
            $parts[] = $config->identity;
        } else {
            $name = $config->assistant_name ?? 'Hotel Assistant';
            $parts[] = "You are {$name}, a helpful hotel concierge AI assistant" . ($companyName ? " for {$companyName}" : '') . ".";
        }

        if ($config && $config->goal) {
            $parts[] = "Your goal: {$config->goal}";
        }

        $toneMap = [
            'professional' => 'Be professional and courteous.',
            'friendly' => 'Be warm, friendly, and approachable.',
            'casual' => 'Use a casual, relaxed conversational style.',
            'formal' => 'Maintain a formal, respectful tone.',
        ];
        $lengthMap = [
            'concise' => 'Keep replies short (1-2 sentences).',
            'moderate' => 'Provide moderately detailed replies (2-4 sentences).',
            'detailed' => 'Give thorough, detailed responses.',
        ];

        if ($config) {
            $parts[] = $toneMap[$config->tone] ?? $toneMap['professional'];
            $parts[] = $lengthMap[$config->reply_length] ?? $lengthMap['moderate'];

            $salesMap = [
                'consultative' => 'Ask questions to understand the visitor\'s needs before making recommendations.',
                'aggressive'   => 'Proactively suggest offers, upsells, and booking opportunities.',
                'passive'      => 'Only suggest products or services when the visitor explicitly asks.',
                'educational'  => 'Focus on informing and educating the visitor, letting them decide.',
            ];
            if (!empty($config->sales_style) && isset($salesMap[$config->sales_style])) {
                $parts[] = $salesMap[$config->sales_style];
            }

            if (!empty($config->core_rules)) {
                $parts[] = "Rules you MUST follow:";
                foreach ($config->core_rules as $rule) {
                    $parts[] = "- {$rule}";
                }
            }

            if ($config->escalation_policy) {
                $parts[] = "Escalation: {$config->escalation_policy}";
            }

            if ($config->custom_instructions) {
                $parts[] = $config->custom_instructions;
            }
        }

        $parts[] = "You are chatting with a website visitor. You do not have access to their loyalty account.";
        $parts[] = "Date: " . now()->format('Y-m-d');

        if ($knowledgeContext) {
            $parts[] = "\n{$knowledgeContext}";
            $parts[] = "IMPORTANT — Knowledge Base Rules:";
            $parts[] = "- When the knowledge base above contains an answer to the visitor's question, use it IMMEDIATELY and directly. Do NOT ask clarifying sub-questions when you already have the answer.";
            $parts[] = "- Provide the answer first, THEN offer to help with additional details if needed.";
            $parts[] = "- Only ask follow-up questions when the knowledge base genuinely does not cover what the visitor is asking about.";
            $parts[] = "- Prefer giving a complete, helpful answer in one message over dragging out a multi-turn interrogation.";
        }

        // Booking context — room catalog + availability
        if ($bookingContext) {
            $parts[] = "\n{$bookingContext}";
            $parts[] = "\n## Room Sales Instructions";
            $parts[] = "One of your primary goals is to help visitors find and book rooms. When discussing rooms:";
            $parts[] = "- Recommend specific rooms based on the visitor's needs (group size, budget, preferences).";
            $parts[] = "- Always mention key selling points: amenities, size, bed type, and price.";
            $parts[] = "- When you recommend a room, output a ROOM CARD block so the widget can render a rich visual card.";
            $parts[] = "- Ask for check-in/check-out dates and number of guests if not provided.";
            $parts[] = "- If live availability data is shown above, use it for accurate pricing. Otherwise use the base prices as starting points and note that final pricing depends on dates.";
            $parts[] = "";
            $parts[] = "## Room Card Format";
            $parts[] = "When recommending rooms, include one or more room card blocks in your response using this EXACT format:";
            $parts[] = "[ROOM_CARD]{\"id\":\"ROOM_ID\",\"name\":\"Room Name\",\"description\":\"Brief appeal\",\"price\":123.45,\"currency\":\"EUR\",\"per_night\":true,\"image\":\"IMAGE_URL\",\"amenities\":[\"WiFi\",\"AC\"],\"max_guests\":4,\"check_in\":\"2026-04-15\",\"check_out\":\"2026-04-18\"}[/ROOM_CARD]";
            $parts[] = "Rules for room cards:";
            $parts[] = "- Use the room's actual ID from the catalog above.";
            $parts[] = "- The description should be a short, persuasive 1-sentence pitch.";
            $parts[] = "- Include the image URL from the room catalog if available.";
            $parts[] = "- Set per_night to true if showing per-night price, false if showing total price.";
            $parts[] = "- If you have specific dates from the visitor, include check_in and check_out.";
            $parts[] = "- You can include multiple ROOM_CARD blocks in one response.";
            $parts[] = "- Always add a brief text recommendation around/before the cards — don't just output raw cards.";
            if ($bookingWidgetUrl) {
                $parts[] = "- The booking widget URL is: {$bookingWidgetUrl}";
            }
        }

        return implode("\n", $parts);
    }

    /**
     * POST /v1/widget/{widgetKey}/realtime-session
     */
    public function createRealtimeSession(Request $request, string $widgetKey): JsonResponse
    {
        $config = $this->resolveWidget($widgetKey);

        if (!$config) {
            return response()->json(['error' => 'Widget not found'], 404);
        }

        $voiceConfig = \App\Models\VoiceAgentConfig::where('organization_id', $config->organization_id)->first();

        if (!$voiceConfig || !$voiceConfig->is_active || !$voiceConfig->realtime_enabled) {
            return response()->json(['error' => 'Voice agent not enabled'], 403);
        }

        $apiKey = config('services.openai.api_key') ?: env('OPENAI_API_KEY');
        if (!$apiKey) {
            return response()->json(['error' => 'OpenAI not configured'], 500);
        }

        $behavior = ChatbotBehaviorConfig::where('organization_id', $config->organization_id)->first();
        $instructions = $this->buildVoiceInstructions($config, $behavior, $voiceConfig);

        try {
            // Map our language code to a Whisper-compatible ISO-639-1 code so the
            // realtime model transcribes (and replies in) the right language.
            // Setting "auto" / null lets Whisper detect — but explicit is more reliable.
            $lang = $voiceConfig->language && $voiceConfig->language !== 'auto'
                ? $voiceConfig->language
                : null;

            // Pin the response language. The realtime model defaults to
            // whatever the model "feels" otherwise (often Spanish), so we
            // both inject a hard rule into the instructions AND pass the
            // ISO code to whisper for input transcription.
            $langName = $this->languageCodeToName($lang ?: 'en');
            $instructions = "IMPORTANT: Always speak and respond in {$langName}. Never switch languages unless the caller explicitly asks you to.\n\n" . $instructions;

            $sessionPayload = [
                'model' => $voiceConfig->realtime_model ?? 'gpt-4o-realtime-preview',
                'voice' => $voiceConfig->voice ?? 'alloy',
                'instructions' => $instructions,
                'modalities' => ['audio', 'text'],
                // Whisper transcription with explicit language so the model doesn't
                // mis-detect (was switching languages mid-conversation).
                'input_audio_transcription' => array_filter([
                    'model'    => 'whisper-1',
                    'language' => $lang,
                ]),
                'temperature' => max(0.6, (float) ($voiceConfig->temperature ?? 0.8)),
                // Use semantic VAD — the model decides if the caller is
                // actually done speaking instead of relying on a fixed
                // silence-duration timer. eagerness=low makes it the most
                // patient available, waiting through mid-sentence pauses
                // ("hello,... can you tell me...") instead of jumping in.
                'turn_detection' => [
                    'type'      => 'semantic_vad',
                    'eagerness' => 'low',
                ],
            ];

            $response = \Illuminate\Support\Facades\Http::withHeaders([
                'Authorization' => 'Bearer ' . $apiKey,
                'OpenAI-Beta'   => 'realtime=v1',
                'Content-Type'  => 'application/json',
            ])->post('https://api.openai.com/v1/realtime/sessions', $sessionPayload);

            if ($response->failed()) {
                $body = $response->json();
                $upstreamMsg = $body['error']['message'] ?? substr((string) $response->body(), 0, 300);
                \Log::error('OpenAI realtime session failed', [
                    'status' => $response->status(),
                    'body'   => substr((string) $response->body(), 0, 500),
                ]);
                return response()->json([
                    'error'   => 'OpenAI ' . $response->status() . ': ' . $upstreamMsg,
                    'details' => $body ?: $response->body(),
                ], 502);
            }

            $data = $response->json();

            return response()->json([
                'client_secret' => $data['client_secret']['value'] ?? null,
                'expires_at' => $data['client_secret']['expires_at'] ?? null,
                'session_id' => $data['id'] ?? null,
                'voice' => $voiceConfig->voice,
                'language' => $lang ?: 'en',
                'language_name' => $langName,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    private function languageCodeToName(string $code): string
    {
        $map = [
            'en' => 'English', 'es' => 'Spanish', 'fr' => 'French', 'de' => 'German',
            'it' => 'Italian', 'pt' => 'Portuguese', 'nl' => 'Dutch', 'ru' => 'Russian',
            'pl' => 'Polish', 'tr' => 'Turkish', 'ar' => 'Arabic', 'zh' => 'Chinese',
            'ja' => 'Japanese', 'ko' => 'Korean', 'hi' => 'Hindi', 'uk' => 'Ukrainian',
        ];
        return $map[strtolower($code)] ?? 'English';
    }

    private function buildVoiceInstructions(
        ChatWidgetConfig $widget,
        ?ChatbotBehaviorConfig $behavior,
        \App\Models\VoiceAgentConfig $voiceConfig,
    ): string {
        $companyName = $widget->company_name ?: 'our hotel';
        $assistantName = $behavior->assistant_name ?? 'Hotel Assistant';

        // If the admin wrote custom voice instructions, use those as the base
        // and still append the full behavior config + knowledge below.
        $base = $voiceConfig->voice_instructions;

        if (!$base) {
            // Build from chatbot behavior config — reuse ALL the same fields
            // the text chatbot uses so voice and text stay in sync.
            $parts = [];

            // Identity
            if ($behavior && $behavior->identity) {
                $parts[] = "# Identity\n" . $behavior->identity;
            } else {
                $parts[] = "# Identity\nYou are {$assistantName}, the voice AI assistant for {$companyName}.";
            }

            // Goal
            if ($behavior && $behavior->goal) {
                $parts[] = "\n# Goal\n" . $behavior->goal;
            }

            // Tone & style
            $toneMap = [
                'professional' => 'Be professional and courteous.',
                'friendly'     => 'Be warm, friendly, and approachable.',
                'casual'       => 'Use a casual, relaxed conversational style.',
                'formal'       => 'Maintain a formal, respectful tone.',
            ];
            $salesMap = [
                'consultative' => 'Ask questions to understand the caller\'s needs before making recommendations.',
                'aggressive'   => 'Proactively suggest offers, upsells, and booking opportunities.',
                'passive'      => 'Only suggest products or services when the caller explicitly asks.',
                'educational'  => 'Focus on informing and educating the caller, letting them decide.',
            ];
            $tone = $behavior->tone ?? 'professional';
            $style = $behavior->sales_style ?? 'consultative';
            $parts[] = "\n# Tone & Style";
            $parts[] = $toneMap[$tone] ?? $toneMap['professional'];
            $parts[] = $salesMap[$style] ?? $salesMap['consultative'];
            $parts[] = "Keep voice answers concise — 2-3 sentences unless more detail is requested.";
            $parts[] = "Speak naturally with occasional filler words for a human feel.";

            // Core rules from admin config
            if ($behavior && !empty($behavior->core_rules)) {
                $parts[] = "\n# Rules you MUST follow";
                foreach ($behavior->core_rules as $rule) {
                    $parts[] = "- {$rule}";
                }
            } else {
                $parts[] = "\n# Rules";
                $parts[] = "- Always greet the caller warmly";
                $parts[] = "- If you don't know specific details, suggest they contact the front desk";
                $parts[] = "- Never make up prices or availability — offer to connect them with reservations";
            }

            // Escalation policy
            if ($behavior && $behavior->escalation_policy) {
                $parts[] = "\n# Escalation\n" . $behavior->escalation_policy;
            }

            // Custom instructions
            if ($behavior && $behavior->custom_instructions) {
                $parts[] = "\n# Additional Instructions\n" . $behavior->custom_instructions;
            }

            $base = implode("\n", $parts);
        }

        // Append knowledge base — fetch multiple relevant contexts
        try {
            $orgId = $widget->organization_id;
            $queries = ['hotel information services amenities', 'pricing packages products', 'booking check-in policies'];
            $knowledgeParts = [];
            foreach ($queries as $q) {
                $ctx = $this->knowledge->getKnowledgeContext($q, $orgId);
                if ($ctx) $knowledgeParts[] = $ctx;
            }
            if (!empty($knowledgeParts)) {
                $combined = implode("\n\n", array_unique($knowledgeParts));
                $base .= "\n\n# Knowledge Base — use this information to answer caller questions\n" . $combined;
                $base .= "\n\nIMPORTANT: When the knowledge base contains an answer, use it directly. Do not tell the caller you need to check — just provide the answer.";
            }
        } catch (\Throwable $e) {
            // Knowledge service failure shouldn't break voice
        }

        return $base;
    }

    /**
     * GET /v1/widget/{widgetKey}/rooms — public room catalog for the chat widget.
     * Returns all active rooms with images, amenities, and base pricing.
     */
    public function getRooms(string $widgetKey): JsonResponse
    {
        $config = $this->resolveWidget($widgetKey);
        if (!$config) {
            return response()->json(['error' => 'Widget not found'], 404);
        }

        $rooms = $this->bookingContext->getRoomCatalog($config->organization_id);

        // Absolutize image URLs
        $rooms = array_map(function ($room) {
            $room['image'] = $this->absolutizeUrl($room['image'] ?? null);
            $room['gallery'] = array_map(fn($img) => $this->absolutizeUrl($img), $room['gallery'] ?? []);
            return $room;
        }, $rooms);

        // Get booking widget URL for Book Now links
        $bookingWidgetUrl = \App\Models\HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $config->organization_id)
            ->where('key', 'booking_widget_url')
            ->value('value') ?: '';

        return response()->json([
            'rooms'              => $rooms,
            'currency'           => $rooms[0]['currency'] ?? 'EUR',
            'booking_widget_url' => $bookingWidgetUrl,
        ]);
    }

    /**
     * GET /v1/widget/{widgetKey}/availability — live availability check.
     * Query: check_in, check_out, adults (optional), children (optional)
     */
    public function checkAvailability(Request $request, string $widgetKey): JsonResponse
    {
        $request->validate([
            'check_in'  => 'required|date|after_or_equal:today',
            'check_out' => 'required|date|after:check_in',
            'adults'    => 'nullable|integer|min:1|max:20',
            'children'  => 'nullable|integer|min:0|max:10',
        ]);

        $config = $this->resolveWidget($widgetKey);
        if (!$config) {
            return response()->json(['error' => 'Widget not found'], 404);
        }

        $orgId = $config->organization_id;
        $available = $this->bookingContext->checkAvailability(
            $orgId,
            $request->input('check_in'),
            $request->input('check_out'),
            (int) $request->input('adults', 2),
            (int) $request->input('children', 0),
        );

        // Absolutize image URLs
        $available = array_map(function ($room) {
            $room['image'] = $this->absolutizeUrl($room['image'] ?? null);
            $room['gallery'] = array_map(fn($img) => $this->absolutizeUrl($img), $room['gallery'] ?? []);
            return $room;
        }, $available);

        $bookingWidgetUrl = \App\Models\HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', 'booking_widget_url')
            ->value('value') ?: '';

        return response()->json([
            'available'          => $available,
            'check_in'           => $request->input('check_in'),
            'check_out'          => $request->input('check_out'),
            'booking_widget_url' => $bookingWidgetUrl,
        ]);
    }

    /**
     * GET /v1/widget/{widgetKey}/calendar-prices — date-range pricing for in-chat calendar.
     * Query: start, end
     */
    public function widgetCalendarPrices(Request $request, string $widgetKey): JsonResponse
    {
        $request->validate([
            'start' => 'required|date',
            'end'   => 'required|date|after:start',
        ]);

        $config = $this->resolveWidget($widgetKey);
        if (!$config) {
            return response()->json(['error' => 'Widget not found'], 404);
        }

        app()->instance('current_organization_id', $config->organization_id);
        $avail = app(AvailabilityService::class);
        $prices = $avail->calendarPrices($request->input('start'), $request->input('end'));

        $currency = \App\Models\HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $config->organization_id)
            ->where('key', 'booking_currency')
            ->value('value') ?: 'EUR';

        return response()->json([
            'prices'   => $prices,
            'currency' => $currency,
        ]);
    }
}

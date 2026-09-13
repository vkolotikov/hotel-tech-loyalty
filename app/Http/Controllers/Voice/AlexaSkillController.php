<?php

namespace App\Http\Controllers\Voice;

use App\Http\Controllers\Controller;
use App\Http\Middleware\Plugin\CheckPluginSubscription;
use App\Models\User;
use App\Models\VoiceAlexaLink;
use App\Voice\Alexa\AlexaAccountResolver;
use App\Voice\Alexa\AlexaPairing;
use App\Voice\Alexa\AlexaPairingLockedException;
use App\Voice\Alexa\AlexaRequestVerifier;
use App\Voice\Alexa\AlexaResponse;
use App\Voice\Alexa\AlexaVerificationException;
use App\Voice\TurnSession;
use App\Voice\VoiceGateway;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Throwable;

/**
 * The Alexa custom-skill endpoint. Alexa transcribes; this verifies the
 * request, resolves the Echo to a paired staff member and speaks whatever the
 * Voice Gateway answers. Every outcome except a failed verification is HTTP
 * 200 with speech, because Alexa reads anything else as a broken skill.
 */
class AlexaSkillController extends Controller
{
    private const PAIR_INSTRUCTIONS = 'To use Hexa-Tech on this Echo, open Hexa-Tech on your phone or computer, go to Connected apps and choose Link an Echo. Then say: link code, followed by the six digits.';

    private const PAIR_REPROMPT = 'Say link code, followed by the six digits from Connected apps.';

    private const HELP = 'You can ask how many leads came in today, what is booked next, or to find a customer. What would you like to know?';

    private const REPROMPT = 'What would you like to know?';

    public function __construct(
        private AlexaRequestVerifier $verifier,
        private AlexaAccountResolver $accounts,
        private AlexaPairing $pairing,
        private VoiceGateway $gateway,
        private TurnSession $sessions,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        try {
            $payload = $this->verifier->verify($request->getContent(),
                $request->header('SignatureCertChainUrl'), $request->header('Signature-256'));
        } catch (AlexaVerificationException $rejected) {
            // Amazon requires 400 for a request that cannot be proven genuine, and
            // that 400 is all it ever shows. The reason and the claimed skill id
            // (neither is secret) tell a wrong VOICE_ALEXA_SKILL_IDS apart from an
            // untrusted certificate chain or a forged request.
            \Illuminate\Support\Facades\Log::notice('Alexa skill request rejected', [
                'reason' => $rejected->getMessage(),
                'skill_id' => data_get(json_decode($request->getContent(), true), 'context.System.application.applicationId'),
                'certificate_url' => $request->header('SignatureCertChainUrl'),
            ]);

            return response()->json(['error' => 'invalid_alexa_request'], 400);
        }

        if (! config('voice.alexa.enabled')) {
            return $this->say("Hexa-Tech voice isn't available right now.", end: true);
        }

        try {
            return $this->handle($payload);
        } catch (Throwable $error) {
            report($error);

            return $this->say("Sorry, I couldn't reach Hexa-Tech just now. Please try again.", end: true);
        }
    }

    private function handle(array $payload): JsonResponse
    {
        $type = data_get($payload, 'request.type');
        $intent = data_get($payload, 'request.intent.name');
        $sessionId = 'alexa:'.data_get($payload, 'session.sessionId', '');
        $link = $this->accounts->resolve($payload);

        if ($type === 'SessionEndedRequest') {
            if ($link !== null) {
                $this->sessions->forget((int) $link->user_id, $sessionId);
            }

            return response()->json(AlexaResponse::empty());
        }

        if ($type === 'LaunchRequest') {
            return $link === null
                ? $this->say(self::PAIR_INSTRUCTIONS, reprompt: self::PAIR_REPROMPT)
                : $this->say('Hexa-Tech is ready. Ask me something like: how many leads came in today?', reprompt: self::REPROMPT);
        }

        return match ($intent) {
            'PairIntent' => $this->pair($payload),
            'AMAZON.StopIntent', 'AMAZON.CancelIntent', 'AMAZON.NavigateHomeIntent' => $this->say('Goodbye.', end: true),
            'AskIntent' => $link === null
                ? $this->say(self::PAIR_INSTRUCTIONS, reprompt: self::PAIR_REPROMPT)
                : $this->ask($link, $payload, $sessionId),
            // Help, Fallback and anything unrecognised.
            default => $this->say(self::HELP, reprompt: self::REPROMPT),
        };
    }

    private function pair(array $payload): JsonResponse
    {
        $alexaUserId = data_get($payload, 'context.System.user.userId') ?? data_get($payload, 'session.user.userId');
        if (! is_string($alexaUserId) || $alexaUserId === '') {
            return $this->say(self::PAIR_INSTRUCTIONS, end: true);
        }

        try {
            $link = $this->pairing->claim($alexaUserId, (string) data_get($payload, 'request.intent.slots.code.value', ''));
        } catch (AlexaPairingLockedException) {
            return $this->say('Too many codes were tried. Wait fifteen minutes, then try again.', end: true);
        }

        return $link === null
            ? $this->say("That code didn't work. Check the code in Connected apps and try again.", reprompt: self::PAIR_REPROMPT)
            : $this->say('This Echo is now linked to your Hexa-Tech account. It can read your workspace, but not add notes until you allow that in Connected apps. What would you like to know?', reprompt: self::REPROMPT);
    }

    private function ask(VoiceAlexaLink $link, array $payload, string $sessionId): JsonResponse
    {
        $query = trim((string) data_get($payload, 'request.intent.slots.query.value', ''));
        if ($query === '') {
            return $this->say(self::REPROMPT, reprompt: self::REPROMPT);
        }

        $staff = $link->user;

        // Nothing else authenticates a skill request: the tools read exactly
        // this user and tenant context.
        Auth::setUser($staff);
        app()->instance('current_organization_id', (int) $staff->organization_id);

        $refusal = $this->subscriptionRefusal($staff);
        if ($refusal !== null) {
            return $this->say($refusal, end: true);
        }

        try {
            $turn = $this->gateway->turn($staff, $query, $sessionId, allowWrites: (bool) $link->can_write);
        } catch (AuthorizationException $denied) {
            // VoiceCapability's messages are written to be heard.
            return $this->say($denied->getMessage(), end: true);
        }

        $link->forceFill(['last_used_at' => now()])->save();

        return $this->say($turn['spoken'], reprompt: 'Anything else?');
    }

    /** Runs the shipped subscription middleware unchanged and turns its answer into speech. */
    private function subscriptionRefusal(User $staff): ?string
    {
        $probe = Request::create('/api/v1/voice/alexa', 'POST');
        $probe->setUserResolver(fn () => $staff);

        $status = app(CheckPluginSubscription::class)
            ->handle($probe, fn () => response()->noContent())
            ->getStatusCode();

        return match (true) {
            $status === 204 => null,
            $status === 503 => "I couldn't check your Hexa-Tech subscription just now. Try again in half a minute.",
            default => "Your Hexa-Tech subscription isn't active, so I can't look that up.",
        };
    }

    private function say(string $text, bool $end = false, ?string $reprompt = null): JsonResponse
    {
        return response()->json(AlexaResponse::speak($text, $end, $reprompt));
    }
}

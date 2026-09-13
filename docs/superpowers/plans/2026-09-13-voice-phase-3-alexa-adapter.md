# Voice phase 3 — Alexa skill adapter (internal pilot)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A staff member at FDS Cards says "Alexa, open Hexa Tech", links the Echo once with a
code from the portal, then asks questions by voice and hears answers produced by the Voice
Gateway.

**Architecture:** Alexa is ears and a mouth. `POST /api/v1/voice/alexa` verifies Amazon's
request signature, resolves the Echo's Amazon account to a paired staff member, checks the
subscription with the shipped middleware, and hands the transcript to `VoiceGateway::turn()`.
The answer goes back as Alexa `outputSpeech`. Linking uses a single-use code issued in the
portal. OAuth account linking replaces it before any public launch.

**Tech Stack:** Laravel 13, PHP `ext-openssl` (verified: key generation, SAN, sign/verify and
`openssl_x509_checkpurpose` all work on php 8.4.20 here), React + Vitest for the portal panel.

**Spec:** `docs/superpowers/specs/2026-09-12-voice-assistant-design.md`
**Predecessors:** phase 1 and phase 2a plans, both complete.

## Decisions taken while planning

**Phase 2b is superseded.** The admin SPA already ships a real-time staff voice agent:
`AiChat.tsx` opens a WebRTC call to the OpenAI Realtime API with an ephemeral token from
`CrmAiController::createRealtimeSession`, relays tool calls to `CrmVoiceToolset` (30 tools) and
confirms mutations in a modal. It has been on `main` since March–June 2026. Building a second
push-to-talk UI would duplicate it. In-app voice is that agent; phase 3 serves the channel it
cannot reach, which is an Echo.

**The pilot links an Echo with a pairing code, not OAuth.** The OAuth stack is hard-wired to
the ChatGPT client in 9 shipped files (21 references to `chatgpt.client_id`).
`ValidatePluginOAuthRequest` rejects every other client *and every confidential client*, and
requires an RFC 8707 `resource` parameter. Alexa account linking needs a client secret and
sends no `resource`. Refresh tokens expire after 30 days where Alexa recommends 180 or more.
The consent and login views are ChatGPT-branded. Generalizing all of that is the right work
before a public launch, not for an internal pilot, so the adapter depends on an
`AlexaAccountResolver` interface and OAuth becomes a second implementation later.

**Alexa links are read-only until the person who linked them allows notes.** An Echo is a
shared device (spec §7). The gateway offers write tools only when the link allows them, and the
runner refuses them as well, so a model that names an unoffered tool still cannot write.

**Subscription is checked with the shipped middleware, not a copy.** `CheckPluginSubscription`
exposes its logic only as middleware. The adapter invokes it with the resolved staff member and
turns 403 and 503 into spoken sentences, because Alexa reads a JSON error as "there was a
problem with the requested skill's response".

**A coupling is documented, not changed.** Every voice tool runs
`CustomerBookingAccess::authorize()`, which requires `PluginIdentity::active()`, which requires
the organization in `CHATGPT_PLUGIN_ORGANIZATION_IDS`. Voice therefore needs the organization in
both allowlists.

**Codes use `AMAZON.FOUR_DIGIT_NUMBER`.** Despite its name it returns any number of digits and
handles PIN-style speech ("six oh nine…"). Codes are six digits, live ten minutes, work once and
are bound to the staff member who generated them. Attempts are rate-limited per Amazon account.

**Progressive responses are deferred.** The gateway's HTTP timeout is 6 seconds inside Alexa's
8, and a turn that overruns is spoken as a failure rather than going silent.

## Global Constraints

- PHP is always `/c/wamp64/bin/php/php8.4.20/php.exe`. Never a bare `php artisan test`.
- Frontend: `cd frontend && npx tsc -b && npx vitest run` (3 `plannerMeta` failures are
  pre-existing). Never commit `frontend/dist` or `public/spa`.
- No change to `HexaTechServer`, `HexaTechTool`, `CustomerBookingAccess`,
  `CheckPluginSubscription`, `PluginIdentity` or any OAuth middleware.
- Every Alexa failure path returns HTTP 200 with speech, except signature or timestamp failures,
  which return 400 as Amazon requires.
- Verification fails closed: no CA bundle, an empty skill allowlist or an unreadable certificate
  rejects the request.
- `VOICE_ALEXA_ENABLED` defaults to `false`; `VOICE_ALEXA_SKILL_IDS` empty denies every request.
- New UI strings exist in all five locales (`en`, `ru`, `de`, `fr`, `es`).

## File Structure

| File | Responsibility |
|---|---|
| `config/voice.php` | `alexa` block: enabled, skill ids, CA bundle, tolerances, pairing TTL |
| `app/Voice/Alexa/AlexaRequestVerifier.php` | Certificate URL, chain, SAN, validity, signature, timestamp, skill id |
| `app/Voice/Alexa/AlexaVerificationException.php` | A rejected request (HTTP 400) |
| `app/Voice/Alexa/AlexaResponse.php` | Speech response builder with Alexa's size limits |
| `database/migrations/2026_09_13_100000_create_voice_alexa_links_table.php` | Paired Echo accounts |
| `app/Models/VoiceAlexaLink.php` | A link: Amazon account ↔ staff member, `can_write`, revocation |
| `app/Voice/Alexa/AlexaPairing.php` | Issue and claim single-use codes |
| `app/Voice/Alexa/AlexaAccountResolver.php` | Interface: request → linked staff member |
| `app/Voice/Alexa/PairedAlexaAccountResolver.php` | Implementation backed by `voice_alexa_links` |
| `app/Voice/VoiceToolCatalogue.php`, `VoiceToolRunner.php`, `VoiceGateway.php` | Add read-only mode |
| `app/Http/Controllers/Voice/AlexaSkillController.php` | The skill endpoint |
| `app/Http/Controllers/Api/V1/Admin/VoiceAlexaLinkController.php` | Portal: code, list, allow notes, unlink |
| `frontend/src/components/AlexaLinksPanel.tsx` | Connected-apps panel |
| `docs/alexa/interaction-model.en-GB.json` | Skill interaction model |
| `tests/Feature/VoiceAlexa/*` | Verifier, pairing, adapter, portal endpoints |

---

### Task 1: Verify that a request came from Alexa

**Interfaces — produces:**
`AlexaRequestVerifier::verify(string $rawBody, ?string $certUrl, ?string $signature): array`
returns the decoded payload, or throws `AlexaVerificationException`.

Checks, cheapest first, each one fatal:
1. Certificate URL: `https`, host `s3.amazonaws.com`, port absent or 443, and a path that
   starts with `/echo.api/` (case-sensitive) after dot segments and duplicate slashes are
   removed.
2. Body is JSON with `request.timestamp` within `voice.alexa.timestamp_tolerance_seconds` (150).
3. `context.System.application.applicationId` is in `voice.alexa.skill_ids`; an empty list
   rejects everything.
4. The certificate is downloaded (cached by URL, but re-validated every time). The leaf must be
   inside its validity window by the application clock and carry SAN `DNS:echo-api.amazon.com`.
   It must chain to a root in the CA bundle, with intermediates passed as untrusted.
5. `Signature-256`, base64-decoded, must verify over the raw body with SHA-256.

**Tests** (`tests/Feature/VoiceAlexa/AlexaRequestVerifierTest.php`, fixtures generated with
OpenSSL in `AlexaCertificates`):
- a correctly signed request from a trusted chain is accepted
- a tampered body is rejected
- non-HTTPS, wrong host, wrong path case, port 563 and a missing URL are rejected; a
  dot-segment URL that normalizes into `/echo.api/` is accepted
- a certificate without the echo-api SAN is rejected
- an expired certificate is rejected
- a leaf signed by an untrusted CA is rejected
- a timestamp 151 seconds old is rejected
- an unlisted skill id is rejected, and an empty allowlist rejects everything
- a CA bundle path that does not exist rejects (fails closed)

### Task 2: Build Alexa speech responses

**Produces:** `AlexaResponse::speak(string $text, bool $endSession = false, ?string $reprompt = null): array`
and `AlexaResponse::empty(): array`. PlainText speech is capped at 8,000 characters and cut at
the last sentence boundary.

**Tests** (`tests/Unit/Voice/AlexaResponseTest.php`): shape and version; `shouldEndSession`;
reprompt; capping keeps whole sentences; the empty response for `SessionEndedRequest`.

### Task 3: Pair an Echo with a code

**Produces:** migration and `VoiceAlexaLink` model (`alexa_user_id` unique, `user_id`,
`organization_id`, `can_write` false, `last_used_at`, `revoked_at`);
`AlexaPairing::issue(User $staff): string` (six digits); and
`AlexaPairing::claim(string $alexaUserId, string $spoken): ?VoiceAlexaLink`.

Codes are stored as a hash in cache for 600 seconds, bound to the issuing staff member and
consumed on first use. A claim normalizes the slot value to digits only. Five failed attempts per
Amazon account in fifteen minutes lock claiming. Claiming for an Amazon account that already has
a live link replaces that link, so a re-enabled skill (new `userId`) or a hand-over relinks
cleanly.

**Tests** (`tests/Feature/VoiceAlexa/AlexaPairingTest.php`): issue then claim creates a
read-only link; a code works once; an expired code fails; spoken digits with spaces normalize;
the sixth wrong attempt is locked even with a right code; re-pairing revokes the previous link
for that Amazon account.

### Task 4: Resolve the Echo's account to a staff member

**Produces:** interface `AlexaAccountResolver::resolve(array $payload): ?VoiceAlexaLink`, and
`PairedAlexaAccountResolver`. A link resolves only when it is not revoked and its user passes
`PluginIdentity::active()`. The adapter then binds `auth()` and `current_organization_id`, the
two pieces of context `CustomerBookingAccess` reads.

**Tests** (`tests/Feature/VoiceAlexa/AlexaAccountResolverTest.php`): linked account resolves;
unknown, revoked, deactivated staff and a deactivated organization all resolve to null.

### Task 5: Read-only turns

**Changes:** `VoiceToolCatalogue::definitions(bool $includeWrites = true)` filters on each
tool's own `annotations.readOnlyHint`. `VoiceToolRunner::run($name, $args, bool $allowWrites = true)`
refuses a write tool when writes are off. `VoiceGateway::turn(..., bool $allowWrites = true)`
passes both. Existing callers keep today's behaviour through the defaults.

**Tests:** read-only catalogue omits `voice_propose_note` and `voice_commit_note`; the runner
refuses `voice_propose_note` when writes are off; a read-only gateway turn whose model asks for
`voice_propose_note` writes nothing.

### Task 6: The skill endpoint

**Produces:** `POST /api/v1/voice/alexa` (outside the authenticated groups, throttled), handled
by `AlexaSkillController`:

| Request | Behaviour |
|---|---|
| verification failure | 400 |
| `voice.alexa.enabled` false | spoken "not available", session ends |
| `LaunchRequest`, not linked | spoken pairing instructions, session open |
| `LaunchRequest`, linked | short greeting, session open |
| `PairIntent` (`code`) | claim; speak success or failure |
| `AskIntent` (`query`), linked | subscription check, then `VoiceGateway::turn()` keyed by the Alexa session, read-only unless the link allows notes |
| `AskIntent`, not linked | pairing instructions |
| `AMAZON.HelpIntent` / `FallbackIntent` | help, session open |
| `AMAZON.StopIntent` / `CancelIntent` / `NavigateHomeIntent` | goodbye, session ends |
| `SessionEndedRequest` | forget the turn session, empty response |
| any exception | spoken apology, never a 500 |

**Tests** (`tests/Feature/VoiceAlexa/AlexaSkillEndpointTest.php`, signed requests and a faked
model): unsigned request is 400; unlinked launch speaks pairing; pairing then asking reaches
the gateway; a lapsed subscription is spoken; an organization without voice access is spoken;
a read-only link cannot write; the model failing mid-turn is spoken; `SessionEndedRequest`
returns an empty response.

### Task 7: Portal endpoints

**Produces**, inside the admin group:
`POST voice/alexa/pairing-code` → `{code, expires_in}`; `GET voice/alexa/links` → the caller's
own live links; `PATCH voice/alexa/links/{link}` → `{can_write}`; `DELETE voice/alexa/links/{link}`.
A staff member only ever sees and changes their own links.

**Tests** (`tests/Feature/VoiceAlexa/VoiceAlexaLinkEndpointTest.php`): code issued for
allowlisted organization only; list shows only own links; another person's link is 404 on
PATCH and DELETE; DELETE revokes and the resolver stops resolving it.

### Task 8: Connected-apps panel

**Produces:** `AlexaLinksPanel` on `pages/AccountConnections.tsx`: "Link an Echo" shows the code
with its spoken instruction and expiry; each link shows "Allow notes from this Echo" and
"Unlink". Strings under `voice.alexa.*` in all five locales.

**Tests** (`AlexaLinksPanel.test.tsx`, `renderToStaticMarkup` in the node environment like
`ChatGptConnectionsPanel.test.tsx`): loading, error, empty and linked states; the write toggle
label; no Amazon account identifier is ever rendered.

### Task 9: Interaction model, documentation, verification

- `docs/alexa/interaction-model.en-GB.json`: invocation `hexa tech`; `AskIntent` with an
  `AMAZON.SearchQuery` slot and carrier phrases; `PairIntent` with `AMAZON.FOUR_DIGIT_NUMBER`;
  the required built-ins.
- `docs/voice-assistant.md`: Amazon developer console setup for the pilot, the pairing flow,
  both allowlists, the read-only default, and what changes before public launch.
- Spec: record that phase 2b is superseded and why.
- `.env.example`: `VOICE_ALEXA_*`.
- Run every voice, ChatGPT, Chatbot and Ai suite, plus `tsc -b` and `vitest run`.

## Done when

- A correctly signed Alexa request from a paired FDS Cards staff member produces a spoken answer
  from the gateway; everything else produces a spoken refusal or a 400.
- Nothing in the shipped OAuth, MCP or subscription code has changed.
- The portal lets a staff member link, allow notes on, and unlink their own Echo.

## Manual steps that stay with a person

Creating the skill in the Amazon developer console, pasting the interaction model, setting the
HTTPS endpoint, adding beta testers, and saying the words to a real Echo. None of that can be
done from this repository.

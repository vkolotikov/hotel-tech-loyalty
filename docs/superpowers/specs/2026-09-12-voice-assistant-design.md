# Voice assistant for HexaTech — design

Status: design approved 12 September 2026. No implementation started.
Scope: staff and owner voice control of the HexaTech platform. Read data, add notes, by speech.
Markets at launch: United Kingdom and Latvia (EU).

## 1. Goal

A business owner or staff member operates HexaTech by speaking to it: asks what today looks
like, how many leads came in, who is booked next, finds a customer, and adds a note to a
customer or booking record — without opening the portal.

The voice user is an authenticated staff account. This reuses the identity, brand scoping,
subscription verification and note attribution already built for the ChatGPT plugin. It is not
a public customer-facing assistant; that is a separate product with a different auth model and
is out of scope here (see §13).

## 2. Decisions already settled, with evidence

These were researched on 12 September 2026 and each one closes off an option. They are recorded
so the reasoning does not have to be rediscovered.

**ChatGPT voice mode cannot use custom MCP servers.** MCP connectors work in ChatGPT text chat
only; sessions that work in text fail on switching to voice, consistently across web and
Android. There is also no supported path for Alexa to call a ChatGPT account's connectors.
This eliminates "use GPT voice and connect Alexa to the GPT account" on capability, not
preference.

**Alexa+ adopted MCP on 23 July 2026.** Alexa+ acts as the MCP *client*: it performs natural
language understanding, response generation and UI rendering, and the integrator returns
standard MCP responses. Requirements are OAuth 2.1 with PKCE (S256), a `401` challenge,
Protected Resource Metadata, and Streamable HTTP — all of which `app.hexa-tech.uk/mcp` already
satisfies. The toolkit supports MCP spec version `2025-11-25`.

**But the Alexa+ MCP Toolkit is United States only**, and in preview, while Alexa+ as a consumer
product launched in the UK in March 2026. The devices are in our market; the builder programme
is not.

**Alexa cannot serve Latvia in any form.** Alexa supports nine languages — English, Spanish,
French, German, Italian, Portuguese (Brazil), Japanese, Hindi, Arabic. Latvian is absent, and
so is Russian, which is the second working language of the platform and widely used in Latvia.
Latvia is also absent from the Alexa+ country list (US, UK, Canada, Mexico, Italy, Spain,
Germany, Austria, Brazil, France). No Alexa path — classic skill or Alexa+ add-on — reaches a
Latvian deployment.

**Therefore:** in-app voice is not merely the fastest first phase, it is the only mechanism that
covers both launch markets. Alexa is an additive UK-only channel, built as an adapter later.

### Market reality

| | United Kingdom | Latvia (EU) |
|---|---|---|
| In-app voice (SPA + Expo) | works now | works now |
| Classic Alexa custom skill | works now (`en-GB`) | no locale, not viable |
| Alexa+ MCP add-on | blocked: toolkit is US-only | blocked: country + language |
| Platform languages in use | en | en, ru |

## 3. Architecture

One asymmetry drives the whole design: **in Alexa+ mode Alexa owns the conversation loop**, and
in every other mode **we own it**. The design must serve both without duplicating business
logic.

```
                       ┌─ Alexa+ add-on ────────► hosted brain (Alexa does NLU + TTS)
  /mcp/voice ──────────┤
  (voice-safe tools)   └─ Voice Gateway ────────► own brain (STT → LLM+tools → TTS)
         │                                        ├─ in-app push-to-talk (SPA + Expo)
         │                                        └─ classic Alexa skill (UK Echo)
         ▼
  CustomerBookingAccess   ← shared data + authorization layer, single source of truth
```

The durable asset is the **voice-safe tool surface**, not the gateway. Both brain modes consume
it; only the gateway is bypassed when Alexa+ hosts the loop.

### Components

| Component | Responsibility | Depends on |
|---|---|---|
| `App\Mcp\Servers\HexaTechVoiceServer` | Declares voice tools, mounted at `/mcp/voice` | `HexaTechTool`, `CustomerBookingAccess` |
| `App\Mcp\Support\VoiceTool` | Extends `HexaTechTool`, adds the voice capability check | `VoiceCapability` |
| `App\Mcp\Tools\Voice\*` | Voice-shaped tools returning speakable results | `VoiceTool`, `CustomerBookingAccess`, `SpeakableRenderer` |
| `App\Voice\SpeakableRenderer` | Turns records and counts into spoken sentences | locale, PII policy |
| `App\Voice\NoteProposal` | Server-issued write proposals: id, resolved target, exact text, expiry | cache |
| `App\Voice\VoiceCapability` | Per-organization voice gate, including the MedTech restriction | organization capability |
| `App\Voice\TurnSession` | Own-brain conversation state: last referenced record, so "that booking" resolves | cache |
| `App\Voice\VoiceGateway` | Owns the turn loop in own-brain mode | STT/TTS drivers, MCP tools |
| `App\Voice\Speech\*` | Pluggable STT and TTS drivers behind an interface | provider SDK |

Each is independently testable and none reaches around `CustomerBookingAccess` for data.

## 4. Voice-safe tool surface

The existing tools at `/mcp` are **not** modified. `docs/chatgpt-plugin.md` documents their
pagination and truncation semantics precisely and the ChatGPT pilot depends on that contract;
adding a `response_style` parameter would pollute it and risk the live integration.

Instead a second `Laravel\Mcp\Server` subclass is mounted at `/mcp/voice`. Its tools extend
`App\Mcp\Support\HexaTechTool` through a thin `VoiceTool` subclass that adds the capability
check of §6, and they read through `App\Mcp\Support\CustomerBookingAccess` unchanged — same
OAuth middleware, same subscription verification, same brand scoping. Neither existing class is
modified. This is a second projection of one source, not a mirrored list: the authorization and
data access code has exactly one home.

Voice tools are **verbs an owner actually says**, not a CRUD surface:

| Tool | Utterance it serves | Write? |
|---|---|---|
| `voice_daily_brief` | "What's today?" — leads, bookings, overdue follow-ups in one spoken paragraph | no |
| `voice_lead_count` | "How many leads today / yesterday / this week?" | no |
| `voice_next_bookings` | "What's next?" / "Who's in at two?" | no |
| `voice_find_customer` | "Find Morgan Lee" — speakable summary, disambiguates aloud | no |
| `voice_propose_note` | Resolves the target, returns the exact read-back sentence and a `request_id` | no |
| `voice_commit_note` | Writes the proposed note, only with a `request_id` issued by `voice_propose_note` | yes |

### Speakable output rules

These are enforced by `SpeakableRenderer` and covered by tests:

- Numbers are spoken words in the response text, not digits.
- Dates are relative where unambiguous ("yesterday", "this Thursday"), absolute otherwise.
- Truncation becomes speech. `results_truncated: true` renders as *"I found forty leads — the
  three newest are…"*, never as a flag the caller must interpret.
- Unknown currency stays unknown, exactly as the text tools already require. Never substitute
  the workspace currency.
- A response is at most three sentences unless the user asked for detail. Long note bodies are
  summarised with an explicit *"there's more in the portal"*.
- Ambiguity is resolved by asking, not guessing: two customers named Morgan produce a spoken
  disambiguation question, never a silent pick.

### Write scope for v1

Notes only, matching the current `/mcp` write surface. Creating or cancelling bookings by voice
requires availability checking, conflict handling and payment decisions, and is explicitly
deferred (§13). Lead status changes are also deferred pending a decision on spoken audit
quality.

## 5. Turn loop and confirm-before-write

The existing write tools take a UUID `request_id` for idempotency. Voice extends that into a
two-step protocol, split across **two tools** rather than held in gateway state:

1. User: *"Add a note to Morgan Lee's booking — quiet room."*
2. The brain calls `voice_propose_note`. The **server** resolves the record, mints and stores
   the `request_id` with the exact note text, and returns the read-back sentence: *"I'll add
   'quiet room' to Morgan Lee's booking on the fourteenth. Confirm?"*
3. User: *"Yes."*
4. The brain calls `voice_commit_note` with that `request_id`. The server writes only if the
   id matches a live proposal, and the stored text — not any text supplied at commit time — is
   what gets written.

The split into two tools is deliberate and load-bearing. In Alexa+ mode the gateway is not in
the path at all, so a confirmation held in `TurnSession` would simply not exist; making the
proposal a server-issued token means **the two-step holds identically whichever brain is
driving**, and cannot be skipped by a model that decides to call the write tool directly.

Because the note text is stored at proposal time and the id is single-use, a repeated, echoed
or misheard "yes" cannot produce a second note, and a model cannot quietly alter the text
between read-back and write. Proposals expire after two minutes; expiry is spoken, not silent.

No write is ever executed on the first turn. This is a hard rule, not a heuristic, because
speech recognition errors are silent and a wrong note attributed to the wrong staff member is
not self-correcting.

## 6. Identity, safety and compliance

### Shared-device identity

One Echo, or one shared tablet, means one linked account: everyone speaking through it writes
notes attributed to whoever linked it. The platform's model is per-staff attribution, and a
shared device silently breaks it.

Policy:

- **Personal devices** (the staff member's own phone, their own signed-in browser session) get
  read and write.
- **Shared devices** are registered as shared and are **read-only** by default.
- A shared device may be granted write only behind a spoken per-staff PIN, which re-establishes
  attribution for that turn. PIN-gated writes are recorded with the device identifier alongside
  the staff account.

### Spoken PII

A voice device reads customer data aloud in a room that may contain other customers.

- Full phone numbers and email addresses are **never spoken**. The renderer emits "I have a
  phone number on file" and the value stays in the portal.
- Customers are identified as first name plus last initial.
- Financial amounts are spoken only on explicit request.

### MedTechAI

Patient data spoken aloud is a materially different risk from salon or hotel data, and the
master project description already carries an explicit MedTech safeguard boundary.

**Voice is disabled by default for MedTechAI organizations.** Enabling it is a deliberate
per-organization action, and even when enabled the assistant is read-only and restricted to
non-clinical administrative facts (appointment times, attendance). No diagnosis, triage,
clinical notes or treatment history is ever spoken or written by voice.

This is enforced in code, not by prompt instruction — a spoken instruction to a model is not a
control. The gate lives in a new `App\Voice\VoiceCapability` check invoked by the voice tool
base class, which **composes with** `CustomerBookingAccess` rather than modifying it. That
shared class keeps exactly its current behaviour, because the live ChatGPT integration depends
on it and a voice-driven change there would be an unreviewed change to a shipped product.

### EU and UK data protection

Latvia brings EU GDPR alongside UK GDPR. Consequences for this design:

- Audio is processed for the duration of the turn and **not retained**. Transcripts are retained
  only where they produced a write, as part of that record's existing audit trail.
- The chosen STT and TTS providers must offer EU processing. The driver interface (§8) exists
  partly so a provider can be swapped for a data-residency reason without touching the gateway.
- Voice activity is visible to the staff member and revocable by them through the existing
  `/account/connections` panel, on the same basis as plugin connections.
- The organization is told, in the enablement flow, that voice sends customer data to a speech
  provider — this is a processor disclosure they need for their own records.

## 7. Latency

Alexa+ targets a round-trip under 500 ms. The current subscription verification has a five
second upstream deadline, two attempts, and a lock wait of up to 22 seconds on a cold snapshot.
The warm path is fine: verified snapshots last 300 seconds.

Mitigations:

- Pre-warm the subscription snapshot when a device is linked, and on a schedule for
  voice-enabled organizations, so the cold path is not hit during a spoken turn.
- In own-brain mode, a cold verification speaks a filler acknowledgement rather than leaving
  silence; silence reads as failure to a speaker.
- In Alexa+ mode (§9, phase 3) the pre-warm is mandatory, because there is no opportunity to
  emit a filler.

A failed verification must still say plainly that no tool ran and the count is unknown, matching
the text integration's existing discipline. A spoken "I don't know" is correct; a spoken zero is
a lie.

## 8. Language and speech providers

Platform locales are **en, ru, de, fr, es** (`frontend/src/i18n/locales/`). In Latvia the
working languages will be English and Russian; Russian is unsupported by Alexa, which is one of
the reasons Alexa cannot serve that market.

STT and TTS sit behind `App\Voice\Speech\SpeechToText` and `App\Voice\Speech\TextToSpeech`
interfaces with per-locale driver configuration. Providers are deliberately not named in this
design: the pace of change in speech models is high, the choice interacts with the EU residency
requirement above, and the interface makes the decision reversible. Provider selection is a
task in the implementation plan, with quality on Russian and a documented EU processing region
as the two hard acceptance criteria.

Recognition quality varies by language. The gateway confirms writes by reading back the
transcribed text (§5), which is what makes a lower-accuracy locale safe rather than dangerous.

## 9. Phasing

| Phase | Delivers | Markets | Gated on |
|---|---|---|---|
| 0 | Voice-safe tool surface, renderer, turn session | — | nothing |
| 1 | In-app push-to-talk: SPA and Expo | UK + Latvia | nothing |
| 2 | Classic Alexa custom skill, `en-GB` | UK only | Amazon developer account |
| 3 | Alexa+ MCP add-on | UK when opened | Amazon opening the toolkit outside the US |

Phases 0 and 1 are the committed work. Phases 2 and 3 are adapters onto the same tool surface
and are scoped separately when their gates clear.

### Phase 2 note

A classic skill does not need a rich intent model. A single catch-all intent capturing the raw
utterance and passing it to the gateway keeps the interaction model thin and the intelligence in
our code, where it is already needed for phase 1. Account linking reuses the existing Passport
OAuth client. The classic skill's eight second timeout is far more forgiving than Alexa+'s
budget.

### Phase 3 readiness gap list

Recorded now so the work is short when the gate clears. The server is already close:

- Add a `client_credentials` grant with an `mcp:service` scope for Alexa's tier-1 service
  authentication, on a **separate confidential client** — the existing public client must stay
  public.
- Add `client_secret_basic` to `token_endpoint_auth_methods_supported`; the metadata currently
  advertises `none` only, which is correct for the existing public client.
- Map user-level scopes to `mcp:tools` and `mcp:resources` alongside the existing `mcp:use`.
- Confirm `laravel/mcp` v0.9.4 speaks MCP spec `2025-11-25`; upgrade if not.
- Dynamic Client Registration is not supported by Alexa, so client credentials stay static
  configuration — consistent with current practice.
- Produce media assets: icons 72×72 through 241×241 and carousel images 600×900, HTTPS-hosted
  PNG/JPG/WEBP.
- Pass certification.

## 10. Testing

Per `CLAUDE.md`: always `/c/wamp64/bin/php/php8.4.20/php.exe`, never a bare `php artisan test`,
always scoped by directory, read the `Tests:` summary line directly.

- `tests/Feature/Voice/` — tool authorization, brand scoping, subscription refusal, MedTech
  capability refusal, shared-device read-only enforcement, and the write protocol in full:
  propose-then-commit succeeds; commit without a prior proposal is refused; a replayed commit
  writes once; an expired proposal is refused; and text supplied at commit time is ignored in
  favour of the text stored at proposal time.
- `tests/Unit/Voice/` — `SpeakableRenderer` output rules, PII redaction, truncation phrasing,
  per-locale number and date rendering.
- Frontend: `cd frontend && npx tsc -b && npx vitest run` for the push-to-talk component. Three
  pre-existing `plannerMeta` failures are expected and unrelated.

Two adversarial cases carry over from the text integration and must be covered: a note whose
body contains instruction-shaped text must be treated as record content and never as an
instruction, and a partial page must never be spoken as a complete count.

## 11. Rollout

Mirrors the plugin's proven pattern:

- `VOICE_ENABLED` defaults to `false`.
- A per-organization allowlist, as `CHATGPT_PLUGIN_ORGANIZATION_IDS` does, with broad rollout
  off by default.
- MedTechAI organizations require an additional explicit opt-in (§6).
- Per-staff revocation through the existing `/account/connections` panel.
- Device registration records whether a device is personal or shared (§6).

## 12. What this design deliberately does not do

- Create, modify or cancel bookings by voice.
- Take payments.
- Send customer-facing communications.
- Serve end customers rather than staff.
- Provide general database access.
- Speak clinical information under any configuration.

## 13. Open questions

- **Speech provider selection**, with Russian quality and EU processing region as acceptance
  criteria (§8). Decided during implementation planning.
- **Wake behaviour in-app**: push-to-talk button versus a hands-free wake word. Push-to-talk is
  assumed for v1 — it is cheaper, more private, and avoids always-on microphone consent.
- **Lead status changes by voice**, deferred pending a view on spoken audit quality.
- **Public customer-facing voice** — a separate product, separate auth model, separate spec.

## 14. Sources

- Alexa+ MCP Toolkit overview — https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html
- Alexa+ MCP QuickStart — https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html
- Alexa+ MCP authentication — https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-authentication.html
- Alexa+ builder announcement, 23 July 2026 — https://developer.amazon.com/alexaplus/blogs/2026/07/alexa-plus-new-ways-to-build-experiences
- Alexa+ UK launch, March 2026 — https://www.engadget.com/ai/alexa-launches-in-the-uk-141058988.html
- ChatGPT developer mode and MCP apps — https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt
- MCP in ChatGPT voice mode, community reports — https://community.openai.com/t/chatgpt-support-of-mcp-in-voice-mode-on-web-and-android/1382072
- Internal: `docs/chatgpt-plugin.md`, `app/Mcp/`, `HexaTech_Master_Project_Description_2026.pdf`

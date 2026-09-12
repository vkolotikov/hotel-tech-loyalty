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
is out of scope here (see §14).

## 2. Decisions already settled, with evidence

These were researched on 12 September 2026 and each one closes off an option. They are recorded
so the reasoning does not have to be rediscovered.

**The ChatGPT *app's* voice mode cannot use custom MCP servers — but the OpenAI *API* can be
our brain.** These are two different things and the distinction decides the architecture:

- *Rejected:* linking an Echo to a ChatGPT account so the consumer app's voice mode drives our
  connector. MCP connectors work in ChatGPT text chat only; sessions that work in text fail on
  switching to voice, across web and Android. There is also no supported path for Alexa to call
  a ChatGPT account's connectors. Impossible, not merely awkward.
- *Chosen:* we call the OpenAI (or any) model API ourselves and orchestrate the tool calls in
  our own code. Nothing about that is gated — it is an ordinary server-side API call. The model
  is a component we own, swappable for a different provider.

So "GPT as the brain, Alexa as the speaker" is exactly right, and is what §5 and §6 describe.
What is impossible is routing it *through a ChatGPT account*; what is routine is calling the
model API from our own endpoint.

**Alexa+ adopted MCP on 23 July 2026.** Alexa+ acts as the MCP *client*: it performs natural
language understanding, response generation and UI rendering, and the integrator returns
standard MCP responses. Requirements are OAuth 2.1 with PKCE (S256), a `401` challenge,
Protected Resource Metadata, and Streamable HTTP — all of which `app.hexa-tech.uk/mcp` already
satisfies. The toolkit supports MCP spec version `2025-11-25`.

**But the Alexa+ MCP Toolkit is United States only**, and in preview, while Alexa+ as a consumer
product launched in the UK in March 2026. The devices are in our market; the builder programme
is not.

**Alexa speaks no Latvian and no Russian.** Alexa supports nine languages — English, Spanish,
French, German, Italian, Portuguese (Brazil), Japanese, Hindi, Arabic. Latvian is absent, and
so is Russian, which is the platform's second working language and widely used in Latvia.
Latvia is also absent from the Alexa+ country list (US, UK, Canada, Mexico, Italy, Spain,
Germany, Austria, Brazil, France).

An English-speaking user in Latvia can still use an Echo set to `en-GB` on a UK Amazon account,
so the English skill is usable there — but only in English, on an unofficial footing, and never
for the Russian-speaking staff who are a large part of that market. Alexa is therefore an
English-only channel, and in-app voice remains the only mechanism that covers Russian and the
Latvian market properly.

**Therefore the brain is ours, hosted on our own endpoint**, and every speaking surface — the
app, an Echo, anything later — is an adapter feeding that one loop. This is the only shape that
covers both launch markets and both languages, and it keeps the intelligence in code we control
rather than in a platform whose regional rollout we do not.

### Market reality

| | United Kingdom | Latvia (EU) |
|---|---|---|
| In-app voice (SPA + Expo) | works now, en + ru | works now, en + ru |
| Classic Alexa skill, our brain | works now, `en-GB` | English only, UK Amazon account |
| Alexa+ MCP add-on | blocked: toolkit is US-only | blocked: country + language |
| Platform languages in use | en | en, ru |

## 3. Architecture

**We own the brain.** The Voice Gateway runs one conversation loop — transcript in, model call
with tools, spoken answer out — and every speaking surface is a thin adapter that feeds it. An
Echo is ears and a mouth: Alexa transcribes, posts the text to us, and speaks what we return.

```
  ┌──────────────── adapters (thin, swappable) ────────────────┐
  │  in-app push-to-talk (SPA + Expo)   classic Alexa skill    │
  │  own STT/TTS, en+ru                 Alexa's STT/TTS, en    │
  └───────────────────────┬────────────────────────────────────┘
                          ▼
                   Voice Gateway          ← the one loop: model + tools + turn state
                          ▼
                   /mcp/voice             ← voice-safe tool surface
                          ▼
              CustomerBookingAccess       ← shared data + authz, single source of truth

  Alexa+ add-on (phase 4, optional) ──────► attaches at /mcp/voice, bypassing the gateway,
                                            because Alexa+ brings its own brain.
```

Two consequences worth stating plainly. The gateway is the same code whether the words arrived
from a phone microphone or an Echo, so a second device costs an adapter, not a rebuild. And
because Alexa+ would bypass the gateway entirely, anything that must hold in *both* worlds has
to live at or below `/mcp/voice` — which is why the write protocol in §5 is server-issued
rather than held in gateway state.

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
check of §7, and they read through `App\Mcp\Support\CustomerBookingAccess` unchanged — same
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
deferred (§14). Lead status changes are also deferred pending a decision on spoken audit
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

## 6. The Alexa skill adapter

Alexa is used as a microphone and a loudspeaker. It performs speech recognition, posts the
transcript to our HTTPS endpoint, and speaks the text we return. All understanding, tool use
and wording happen in the Voice Gateway.

```
"Alexa, open Hexa Tech"  →  skill session opens, stays open
  user speaks            →  Alexa STT  →  POST transcript to /voice/alexa
                                            → VoiceGateway: model + /mcp/voice tools
                         ←  Alexa TTS  ←  response text, session kept open
```

Launch locale is `en-GB`. English only, for the reasons in §2.

### Capturing free-form speech

A classic skill matches intents, so the skill defines one custom intent holding a single
`AMAZON.SearchQuery` slot, which is the built-in type for free-form phrases.

Three constraints shape the interaction model, and they are firm:

- **A carrier phrase is mandatory.** A bare `{query}` sample is rejected at build time, because
  `SearchQuery` is greedy enough to swallow every other intent. The model therefore ships a
  broad carrier set covering how owners actually open a sentence — *how many…*, *what…*,
  *who…*, *when…*, *show me…*, *find…*, *tell me…*, *add…* — so that natural phrasings match.
- **One `SearchQuery` slot per intent**, and it cannot be combined with another slot in the same
  sample utterance. This is not a limitation in practice, since the model, not the interaction
  model, does the parsing.
- **Recognition is tuned for general speech**, so customer names will sometimes come back
  wrong. This is precisely why §5 reads the resolved record and note text back before any write.

The session is kept open between turns (`shouldEndSession: false`), so the invocation name is
spoken once and the conversation continues naturally until the user stops or the session times
out.

### The eight-second budget

A skill must return a complete response in roughly eight seconds or Alexa raises
`SKILL_RESPONSE_TIMEOUT_EXCEPTION`. Progressive responses keep the user company but **do not
extend the limit** — the interim and the final response must both land inside it.

This is the tightest real constraint on the Alexa path, and it is a design input, not a tuning
exercise afterwards:

- Pre-warm the subscription snapshot (§8), so verification never runs cold inside a turn.
- Send a progressive response as soon as the model requests a tool, so the user hears
  acknowledgement rather than silence.
- Budget explicitly: transcript in, at most two tool round-trips, one model call, response out.
  A voice tool that cannot answer within its share of the budget is the wrong tool shape —
  `voice_daily_brief` exists precisely so one call answers "what's today" instead of four.
- If the budget is about to be exceeded, speak a partial answer and offer to continue. Never let
  the session die silently; a timeout is indistinguishable from a broken product.

The in-app adapter has no such limit, which is a further reason to build and prove the gateway
there first (§10).

### Distribution

A skill does not have to be published publicly to be used. Beta distribution invites up to 500
named testers by email for 90 days, renewable — which matches how pilot organizations are
already onboarded, and avoids public certification during the pilot. Public certification is a
later, separate step, needed only for open self-serve signup.

Account linking uses OAuth 2.0 authorization code against the existing Passport client, the
same mechanism the ChatGPT plugin already uses. A linked Amazon account maps to exactly one
staff account, which is what makes the shared-device rule in §7 necessary.

## 7. Identity, safety and compliance

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
- The chosen STT and TTS providers must offer EU processing. The driver interface (§9) exists
  partly so a provider can be swapped for a data-residency reason without touching the gateway.
- Voice activity is visible to the staff member and revocable by them through the existing
  `/account/connections` panel, on the same basis as plugin connections.
- The organization is told, in the enablement flow, that voice sends customer data to a speech
  provider — this is a processor disclosure they need for their own records.

## 8. Latency

Alexa+ targets a round-trip under 500 ms. The current subscription verification has a five
second upstream deadline, two attempts, and a lock wait of up to 22 seconds on a cold snapshot.
The warm path is fine: verified snapshots last 300 seconds.

Mitigations:

- Pre-warm the subscription snapshot when a device is linked, and on a schedule for
  voice-enabled organizations, so the cold path is not hit during a spoken turn.
- In own-brain mode, a cold verification speaks a filler acknowledgement rather than leaving
  silence; silence reads as failure to a speaker.
- In Alexa+ mode (§10, phase 4) the pre-warm is mandatory, because there is no opportunity to
  emit a filler.

A failed verification must still say plainly that no tool ran and the count is unknown, matching
the text integration's existing discipline. A spoken "I don't know" is correct; a spoken zero is
a lie.

## 9. Language and speech providers

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

## 10. Phasing

| Phase | Delivers | Markets | Gated on |
|---|---|---|---|
| 1 | Voice-safe tool surface, renderer, write protocol | — | nothing |
| 2 | Voice Gateway loop + in-app push-to-talk (SPA, Expo) | UK + Latvia, en + ru | nothing |
| 3 | **Alexa skill adapter, `en-GB`, our brain** | UK + English users in Latvia | Amazon developer account |
| 4 | Alexa+ MCP add-on | UK when opened | Amazon opening the toolkit outside the US |

Phases 1 to 3 are the committed work. Phase 4 is optional and scoped when its gate clears.

### Why the Alexa skill is phase 3 and not phase 1

The Alexa adapter is deliberately close behind, not far behind — but it cannot come first,
because it is *only* an adapter. The gateway, the tools and the write protocol are the same code
whether the words arrive from an Echo or a phone, and none of it can be exercised on a device
until it exists.

Building the loop against in-app voice first means it can be driven from a laptop, in both
languages, with no Amazon account, no device, no account linking and no eight-second ceiling —
so the tool shapes and the spoken wording get corrected while corrections are cheap. Phase 3 is
then genuinely thin: an HTTPS endpoint that unwraps an Alexa request, calls the gateway, and
wraps the answer back, plus the interaction model and account linking of §6.

Reversing the order would mean debugging prompt wording, tool latency and speech recognition
simultaneously, on hardware, inside an eight-second budget. The same work, in the order that
makes it hardest.

### Phase 4 readiness gap list

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

## 11. Testing

Per `CLAUDE.md`: always `/c/wamp64/bin/php/php8.4.20/php.exe`, never a bare `php artisan test`,
always scoped by directory, read the `Tests:` summary line directly.

- `tests/Feature/Voice/` — tool authorization, brand scoping, subscription refusal, MedTech
  capability refusal, shared-device read-only enforcement, and the write protocol in full:
  propose-then-commit succeeds; commit without a prior proposal is refused; a replayed commit
  writes once; an expired proposal is refused; and text supplied at commit time is ignored in
  favour of the text stored at proposal time.
- `tests/Unit/Voice/` — `SpeakableRenderer` output rules, PII redaction, truncation phrasing,
  per-locale number and date rendering.
- `tests/Feature/VoiceAlexa/` — the adapter endpoint: a valid Alexa request maps to a gateway
  turn; an unlinked account gets a spoken account-linking prompt rather than an error; the
  session stays open across turns; a request signed for another skill is rejected; and a gateway
  call that overruns its budget produces a spoken partial answer, never a silent timeout.
- Frontend: `cd frontend && npx tsc -b && npx vitest run` for the push-to-talk component. Three
  pre-existing `plannerMeta` failures are expected and unrelated.

Two adversarial cases carry over from the text integration and must be covered: a note whose
body contains instruction-shaped text must be treated as record content and never as an
instruction, and a partial page must never be spoken as a complete count.

## 12. Rollout

Mirrors the plugin's proven pattern:

- `VOICE_ENABLED` defaults to `false`.
- A per-organization allowlist, as `CHATGPT_PLUGIN_ORGANIZATION_IDS` does, with broad rollout
  off by default.
- MedTechAI organizations require an additional explicit opt-in (§7).
- Per-staff revocation through the existing `/account/connections` panel, covering linked Alexa
  accounts alongside plugin connections.
- Device registration records whether a device is personal or shared (§7).
- The Alexa skill ships to pilot organizations by beta invitation (up to 500 named testers, 90
  days, renewable), not by public publication. Public certification is deferred until open
  self-serve signup is actually wanted.

## 13. What this design deliberately does not do

- Create, modify or cancel bookings by voice.
- Take payments.
- Send customer-facing communications.
- Serve end customers rather than staff.
- Provide general database access.
- Speak clinical information under any configuration.

## 14. Open questions

- **Speech provider selection**, with Russian quality and EU processing region as acceptance
  criteria (§9). Decided during implementation planning.
- **Wake behaviour in-app**: push-to-talk button versus a hands-free wake word. Push-to-talk is
  assumed for v1 — it is cheaper, more private, and avoids always-on microphone consent.
- **Lead status changes by voice**, deferred pending a view on spoken audit quality.
- **Public customer-facing voice** — a separate product, separate auth model, separate spec.

## 15. Sources

- Alexa+ MCP Toolkit overview — https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html
- Alexa+ MCP QuickStart — https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html
- Alexa+ MCP authentication — https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-authentication.html
- Alexa+ builder announcement, 23 July 2026 — https://developer.amazon.com/alexaplus/blogs/2026/07/alexa-plus-new-ways-to-build-experiences
- Alexa+ UK launch, March 2026 — https://www.engadget.com/ai/alexa-launches-in-the-uk-141058988.html
- ChatGPT developer mode and MCP apps — https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt
- MCP in ChatGPT voice mode, community reports — https://community.openai.com/t/chatgpt-support-of-mcp-in-voice-mode-on-web-and-android/1382072
- `AMAZON.SearchQuery` and phrase slots — https://developer.amazon.com/en-US/blogs/alexa/post/a2716002-0f50-4587-b038-31ce631c0c07/enhance-speech-recognition-of-your-alexa-skills-with-phrase-slots-and-amazon-searchquer
- Progressive responses and the eight-second limit — https://developer.amazon.com/en-GB/docs/alexa/custom-skills/send-the-user-a-progressive-response.html
- Skill beta testing, 500 testers for 90 days — https://developer.amazon.com/en-US/docs/alexa/custom-skills/skills-beta-testing-for-alexa-skills.html
- Internal: `docs/chatgpt-plugin.md`, `app/Mcp/`, `HexaTech_Master_Project_Description_2026.pdf`

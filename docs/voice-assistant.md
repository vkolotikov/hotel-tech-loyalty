# Staff voice assistant

A second, voice-shaped MCP server served at `/mcp/voice`, so a staff member can ask their
HexaTech workspace questions out loud and add notes by speaking. It reuses the ChatGPT plugin's
OAuth, tenancy, throttling, subscription verification and brand scoping unchanged; only the
response shape differs.

Design and roadmap: `docs/superpowers/specs/2026-09-12-voice-assistant-design.md`.
Phase 1 (this document) is the tool surface. The Voice Gateway, in-app push-to-talk and the
Alexa skill adapter are later phases.

## What it does

| Tool | Utterance it serves | Writes? |
| --- | --- | --- |
| `voice_daily_brief` | "What does today look like?" | no |
| `voice_lead_count` | "How many leads today?" | no |
| `voice_next_bookings` | "What's next?" / "Who's in at two?" | no |
| `voice_find_customer` | "Find Morgan Lee" | no |
| `voice_propose_note` | Prepares a note and reads it back | no |
| `voice_commit_note` | Saves the proposed note | yes |

The tools at `/mcp` are unchanged and keep their documented behaviour; see
`docs/chatgpt-plugin.md`. Nothing here creates or cancels bookings, takes payments, sends
customer communications, or provides general database access.

## How a spoken answer differs from a text one

Responses are written to be read aloud, not parsed:

- Counts are words in the `spoken_*` fields — "twelve leads", not `12`. They are produced by
  ICU in the staff member's own language, so a Russian-speaking user hears "двенадцать".
- Days are relative where that is unambiguous: "today", "yesterday", "Friday the fourth of
  September".
- Customers are named by first name and last initial. **Full phone numbers, email addresses and
  document numbers never appear in a voice response at all**, so they cannot be read out in a
  room with other customers in it.
- Amounts, currency and payment status are absent. Voice tools select the fields they speak
  rather than subtracting the ones they must not, so a field added to a booking payload later
  cannot leak into speech by default.
- `voice_daily_brief` answers "what's today" in one call instead of four, because the Alexa
  adapter has roughly eight seconds for a whole turn.

### Partial results are never spoken as totals

`CustomerBookingAccess::listBookings()` returns a page and no total. The voice tools therefore
count what they actually received and say `at least fifty appointments` when more exist,
setting `booking_count_is_partial` / `count_is_partial`. A failed tool means the count is
unknown; it never means zero.

### Ambiguity is asked about, not guessed

Two customers can share a first name and last initial. `voice_find_customer` separates them by
company — "Morgan L. at Northside, Morgan L. at Riverside. Which one do you mean?" — and when
even that cannot separate them it asks for the full surname rather than offering a choice
nobody can answer aloud.

## Writing a note takes two calls

This is the safety property of the whole feature, because speech recognition fails silently and
a note attributed to the wrong person does not correct itself.

1. `voice_propose_note` resolves the record, stores the exact text server-side, and returns a
   `read_back` sentence with a `request_id`. **Nothing is saved.**
2. The assistant reads `read_back` to the user.
3. `voice_commit_note` saves that stored text against the same `request_id`.

The proposal is a server-issued single-use token rather than conversation state, which matters
for two reasons: a model cannot skip the read-back by calling the write tool directly, and the
step still holds if a hosted assistant such as Alexa+ ever drives the tools without our gateway
in the path. Text supplied at commit time is ignored, so the sentence read to the user is the
sentence that is saved. A replayed or misheard "yes" writes nothing further. Proposals expire
after `voice.proposal_ttl_seconds` (120).

## Configuration

```
VOICE_ENABLED=false
VOICE_ORGANIZATION_IDS=
VOICE_MEDICAL_ORGANIZATION_IDS=
```

`VOICE_ENABLED` defaults to `false` and an empty `VOICE_ORGANIZATION_IDS` denies every
organization, matching how `CHATGPT_PLUGIN_*` behaves. Organization IDs are **local** IDs and
differ per environment; resolve them in the target deployment rather than copying them between
environments.

Voice still requires everything the plugin requires: an active staff account in the connected
organization, an active subscription or unexpired trial, and the `mcp:use` OAuth scope. Voice
adds a gate; it never bypasses one. Staff withdraw access from **Connected apps**
(`/account/connections`) exactly as they do for the plugin.

### MedTechAI

A `medical` organization is **denied even when it appears in `VOICE_ORGANIZATION_IDS`**, until
it is also listed in `VOICE_MEDICAL_ORGANIZATION_IDS`. Once listed it is read-only: proposing
or committing a note is refused while reads continue to work. This is enforced in
`App\Voice\VoiceCapability`, not by instructing the model, because an instruction to a model is
not an access control. Speaking patient data aloud in a shared room is a different risk from
speaking salon or hotel data, and the platform's MedTech boundary already forbids clinical use.

### Current internal pilot

Voice is enabled for **FDS Cards UK only**, for internal testing before any public option. The
local development value is `VOICE_ORGANIZATION_IDS=2`; confirm the organization ID separately in
each deployment before enabling it there.

## Known limitation

Notes written by voice are stamped `via ChatGPT` in the booking note body, because
`CustomerBookingAccess::addBookingNote()` is shared with the live plugin and was deliberately
left unmodified. The attribution (which staff account saved it) is correct; only the channel
label is wrong. Changing it means touching shared code that the shipped integration depends on,
so it is a separate change with its own regression run.

## Testing

Per `CLAUDE.md`: always `/c/wamp64/bin/php/php8.4.20/php.exe`, never a bare `php artisan test`,
always scoped by directory.

```powershell
& 'C:\wamp64\bin\php\php8.4.20\php.exe' artisan test tests/Feature/Voice/
& 'C:\wamp64\bin\php\php8.4.20\php.exe' artisan test tests/Unit/Voice/
```

Any change to the voice server also needs the plugin suites re-run, because both mount in
`routes/ai.php` and share `CustomerBookingAccess`:

```powershell
& 'C:\wamp64\bin\php\php8.4.20\php.exe' artisan test tests/Feature/ChatGptTools/
& 'C:\wamp64\bin\php\php8.4.20\php.exe' artisan test tests/Feature/ChatGptAuth/
```

`tests/Feature/Voice/VoiceTestCase.php` holds the shared fixtures. Two adversarial cases carry
over from the text integration and must keep passing: note text that reads like an instruction
is stored as data and never followed, and records belonging to another organization stay
unreachable.

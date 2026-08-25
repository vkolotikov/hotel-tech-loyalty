# Landing Pages Phase 3a — Correctness and Reachability — Design

Live-use feedback from the first real tenant walkthrough (an AI education
business, org "Hexa Academy"), each item verified against the deployed code
before this spec was written.

## 1. The problems, as verified

1. **The wizard sends people to a dead end.** Step 2's empty-field hints say
   "Add a phone number in Settings" and link "Edit in Settings" — but phone,
   email and address live on `Property`, edited at `/properties`, not in
   Settings. Verified: `SettingsController` exposes no such fields;
   `PropertyAdminController` validates all three. A non-technical tenant
   follows the link, finds nothing, and stops.
2. **Every industry gets beauty vocabulary.** `IndustryProfile::all()` authors
   exactly one profile (`beauty`) and `for()` falls back to it for every other
   id. The education tenant was offered "Treatments" and "Therapists".
   `Organization::INDUSTRIES` lists nine industries; eight have no profile.
3. **The hotel booking widget renders on non-hotel pages.** The landing page
   iframes `/booking-widget`, which asks Check-in / Check-out / Adults /
   Children / "Search Rooms" — on an education page, and it would on a salon
   page too. The widget itself is hotel-shaped; that is a booking-module
   limitation, not a landing bug.
4. **Landing Pages is a single nav item** while comparable features (CRM, AI
   chat) are groups with sub-items.
5. Smaller, folded in: the `reviews.*` toast keys added in Phase 2 exist in no
   locale file (English toasts in all five languages), and step 2's hint copy
   is wrong even where the link goes somewhere.

## 2. Decisions already made by the user

- Imagery: repair the media pipeline first, then build upload (Phase 3b).
- Design control: curated choices — palette/type/order, every combination
  designed to look good (Phase 3c).
- Sequencing: correctness first. This spec is that round only.

## 3. Scope

**In:** contact details editable in the wizard and editor with Property
fallback; eight authored industry profiles; booking section gated to the one
industry its widget fits; Landing Pages nav group; the folded copy/locale
fixes.

**Out (deliberately):** media pipeline and upload (3b); template rebuild,
design controls, real type-style previews, sticky nav, manual services/team/
reviews entry (3c — needs the template and list storage); making the booking
widget industry-aware (its own project in the booking module); backend section
copy i18n (architectural, tracked separately).

## 4. Design

### 4.1 Contact details: editable where they are needed

**Storage.** Per-page overrides in the existing `landing_pages.content` JSON
under `contact`: `{phone, email, address}` — scalar leaves at depth 2, which
`ScalarLeaves(depth: 2)` already validates. No migration.

**Resolution.** A small value object, `App\Landing\ContactDetails`, replaces
the raw `?Property` on `PageContent`:

```php
final class ContactDetails
{
    public function __construct(
        public readonly ?string $name,     // business name: Property only
        public readonly ?string $phone,    // override ?? Property
        public readonly ?string $email,    // override ?? Property
        public readonly ?string $address,  // override ?? Property
    ) {}
}
```

Field-by-field precedence: a stored override wins for its field; blank-string
overrides are treated as absent (`filled()`), so clearing a field falls back
to Property rather than blanking the page. Consumers — the contact section,
footer, and JSON-LD (`telephone`, `email`, `address`) — read `ContactDetails`.
`has('contact')` becomes "any of phone/email/address resolves non-empty".

**Renderer safety.** This touches `PageContent` (live). Requirement carried
from Phase 2: a page with **no** overrides must render byte-identically to
today (nonce-normalised), proven by execution, and hostile override shapes
written directly to the DB must degrade, never 500 (ScalarTree already prunes;
tests must cover the new leaves).

**Wizard step 2.** Phone, email and address become inline inputs, prefilled
with effective values, saved through `apply()` into `content.contact` (only
fields the tenant actually edited — untouched fields store nothing, so
Property remains the source of truth for them). The dead-end hints are
replaced: fields are simply editable here, and the secondary link is renamed
"Open Properties" and points at `/properties`.

**Editor.** The Contact section gains the same three inputs with the same
semantics, plus one caption: "Filled from your Properties screen — edit here
to override for this page."

### 4.2 Industry profiles: authored, all nine

Same shape as `beauty`. Values are final copy, not placeholders:

| id | servicesLabel | peopleLabel | primaryCta | accent |
|---|---|---|---|---|
| beauty (as shipped) | Treatments | Therapists | Book appointment | #9B5C8F |
| hotel | Rooms & Suites | At your service | Book your stay | #1B3A5C |
| medical | Services | Practitioners | Book a consultation | #1D6F6B |
| restaurant | The menu | The kitchen | Reserve a table | #8C3B2E |
| legal | Practice areas | Attorneys | Request a consultation | #3B4B74 |
| real_estate | Services | Agents | Arrange a viewing | #7A5C2E |
| education | Courses | Instructors | Book a lesson | #35509E |
| fitness | Classes | Trainers | Book a class | #C25A2B |
| other | Services | Our team | Get in touch | #2D6A4F |

Kickers per profile (services / about / team / reviews / booking / contact):

- hotel: Stay with us / The hotel / At your service / Guest words / Reserve /
  Getting here
- medical: What we treat / The clinic / Your care team / Patient words / — /
  Visit us
- restaurant: On the table / The house / The kitchen / Word of mouth / — /
  Find us
- legal: How we help / The firm / Who represents you / Client words / — /
  Reach us
- real_estate: What we do / The agency / Your agents / From our clients / — /
  Talk to us
- education: What you'll learn / The academy / Who teaches / From our
  students / — / Get in touch
- fitness: Train with us / The studio / Your coaches / Member words / — /
  Find the gym
- other: What we offer / About us / The people / Kind words / — / Contact

`defaultSections`: the eight new profiles list hero, services, about, team,
reviews, contact; **only hotel additionally lists booking** (see 4.3). Beauty
keeps its shipped list unchanged — booking included — because the 4.3 gate,
not the seeded row, decides what renders; the row sits inert and reactivates
the moment the gate widens. Profiles without booking in `defaultSections`
omit the booking kicker, and the renderer must not assume that key exists
(the band cannot render for them, but a legacy row must not fatal on a
missing kicker). Accents are
fallbacks only — `Accent` still resolves the tenant's own brand colour with
its contrast machinery; every value above must pass the existing 262k-sample
contrast property test.

`INDUSTRY_ALIASES` must resolve before profile lookup (e.g. `hospitality` →
`restaurant`), and the existing "unknown falls back to beauty" behaviour
changes to **fall back to `other`** — falling back to a named industry is how
problem 2 happened.

### 4.3 Booking: only where its widget makes sense

Until the booking module grows an appointment mode, its widget fits exactly
one industry. `PageContent::count('booking')` — today hardcoded 1 — becomes
1 only when the page's industry is `hotel`, else 0. That flows through the
one shared switch (`has()` → wizard offerability, editor row, rendered band,
hero CTA target), so:

- non-hotel pages stop rendering the embed, **including already-published
  ones** (our education demo fixes itself on next request);
- the wizard/editor show the row disabled with the reason: "Online booking
  currently supports hotel stays. Your '{primaryCta}' button will point
  visitors at your contact details instead."
- the hero CTA anchors to `#contact` when the booking band is absent (it
  already anchors to the booking band when present); if contact is also
  absent, the button is dropped rather than dead.

Beauty loses the booking band too — deliberately. A salon's visitors being
asked "Check-in / Check-out / Children" is worse than a "Book appointment"
button that opens the contact section. When the booking module becomes
industry-aware, this gate widens per-industry — one predicate to change.

### 4.4 Navigation group

`Layout.tsx`'s existing group mechanism, group label "Landing pages", two
items: **Your page** (`/landing-pages`, existing gates unchanged, including
the `_lapsed` teardown treatment) and **Featured reviews** (`/reviews`,
`feature: reviews` — the one cross-screen step a tenant must take, surfaced
where they will look for it). Phase 3c adds "Design" here.

### 4.5 Folded fixes

- Add the missing `reviews.*` keys (`featured_on`, `featured_off`,
  `featured_on_section_off`, `featured_on_no_page`, `feature`, `featured`,
  `feature_hint`) to all five locale files.
- Wizard/editor "source" hints that say "in Settings" for contact/footer
  change to name the real screen or none (they become editable per 4.1).

## 5. Compatibility

No migration. Existing pages: no `content.contact` key → pure Property
fallback → byte-identical render. Existing non-hotel pages with a `booking`
section row: row remains, `has()` now gates the band off — the row is inert,
not deleted, so widening the gate later restores it. The education demo page
is the only known affected live page.

## 6. Testing

- ContactDetails precedence: unit-complete (override / property / blank-
  override / both-absent, per field). Mutation: swap precedence order — a
  test must go red.
- Byte-parity: no-override page renders identically pre/post (the Phase 2
  `view:clear` + nonce-normalise harness).
- Hostile `content.contact` shapes written via `DB::table()` (arrays, objects,
  200k strings): public page and preview stay 200.
- Profiles: every id in `Organization::INDUSTRIES` has a profile; aliases
  resolve; unknown → `other`; every accent passes the contrast property test.
  Mutation: point `education` back at beauty's labels — a test must go red.
- Booking gate: hotel page renders the band; education page does not, over
  real response bytes; hero CTA anchors correctly in both; wizard reports the
  row unavailable with the reason for non-hotel. Mutation: hardcode
  `count('booking')` to 1 — tests must go red.
- Nav: the SSR harness from Phase 2 (`Layout.landingSidebar.test.tsx`)
  extends to assert the group renders both links for an entitled org.
- i18n: a locale-completeness check that every `reviews.*` and
  `landing_pages.*` key used in code resolves in all five locales.

## 7. Rollout

Same discipline as Phase 2: feature branch, subagent-driven with per-task
review, patch onto `origin/main` for deploy (local main still carries ~80
unrelated commits), rebuild committed separately, verify by discriminating
probe on the live host — the education demo page losing its booking band is
the natural smoke test.

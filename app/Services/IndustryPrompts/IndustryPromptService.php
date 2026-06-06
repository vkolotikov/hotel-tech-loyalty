<?php

namespace App\Services\IndustryPrompts;

/**
 * Industry Platform Plan Phase 7 — central per-industry prompt
 * fragment provider.
 *
 * Every AI prompt builder (widget chatbot, admin AI, member chat,
 * sentiment, churn etc.) pulls an IndustryPromptProfile via for($id)
 * and reads the persona / noun map / guardrails / workspace label
 * off it. Centralising the swap text here means:
 *
 *   1. Adding a new industry is one new profile, not a sprawl of
 *      `if ($industry === 'beauty')` branches scattered across
 *      five services.
 *   2. Medical hard guardrails ("no diagnoses, no medication advice")
 *      live at the prompt-frame layer where admins can't accidentally
 *      weaken them via ChatbotBehaviorConfig.identity edits.
 *   3. Hotel keeps verbatim back-compat — the hotel profile uses an
 *      EMPTY noun map + minimal guardrails so existing prompts that
 *      route through `swapNouns()` pass through unchanged.
 *
 * Profiles cover the 4 GTM industries (hotel / beauty / medical /
 * restaurant) explicitly + 4 settings-only fallbacks (legal /
 * real_estate / education / fitness) with lighter-weight profiles
 * that get them to a sensible default. Unmapped industries fall
 * back to the hotel profile — same default-fallback semantics as
 * every other Phase 1-6 code path.
 */
class IndustryPromptService
{
    /**
     * Phase 7 — emergency keywords surfaced for both:
     *   (1) the medical guardrail prompt text below (the AI is told
     *       to redirect to emergency services on any of these)
     *   (2) future Layer 2 tool-gate code that scans visitor messages
     *       before the AI even responds (deferred to Phase 7.5 per
     *       CLAUDE.md ship plan).
     *
     * **Three-layer medical safety defence (per CLAUDE.md):**
     *   LAYER 1 — system-prompt guardrails (this ship)
     *   LAYER 2 — tool gate / pre-call keyword scan that overrides
     *             AI output with the emergency-number snippet when
     *             any keyword fires (deferred to Phase 7.5)
     *   LAYER 3 — output post-filter that scans AI responses for
     *             forbidden phrases (diagnoses, dosage) and replaces
     *             with deferral text (deferred to Phase 7.5)
     *
     * Layers 2 + 3 are independent defences; do NOT remove or
     * weaken the Layer 1 guardrails on the assumption that 2/3 will
     * cover them. Each layer must hold on its own.
     *
     * Keywords are colloquial forms users actually type, not just
     * clinical paraphrases. CLAUDE.md spec: `chest pain, bleeding
     * heavily, can't breathe, overdose, suicide, ...`.
     */
    public const MEDICAL_EMERGENCY_KEYWORDS = [
        'chest pain',
        'cardiac arrest', 'heart attack',
        'cant breathe', "can't breathe", 'cannot breathe', 'difficulty breathing', 'not breathing',
        'bleeding heavily', 'severe bleeding', 'hemorrhage',
        'overdose', 'overdosed', 'too many pills',
        'suicide', 'suicidal', 'kill myself', 'end my life',
        'choking', 'choked', 'cant swallow', "can't swallow",
        'anaphylaxis', 'severe allergic reaction', 'throat closing',
        'unresponsive', 'wont wake up', "won't wake up", 'unconscious',
        'loss of consciousness', 'passed out', 'collapsed',
        'signs of stroke', 'stroke', 'face drooping', 'slurred speech',
        'seizure', 'seizures', 'fitting',
        'severe pain', 'cant move', "can't move",
    ];


    /**
     * Resolve the profile for a canonical industry id.
     *
     * @param  string|null  $industry  hotel / beauty / medical / restaurant
     *                                  / legal / real_estate / education /
     *                                  fitness, or null for the hotel
     *                                  default.
     */
    public function for(?string $industry): IndustryPromptProfile
    {
        return match ($industry) {
            'beauty'      => $this->beauty(),
            'medical'     => $this->medical(),
            'restaurant'  => $this->restaurant(),
            'legal'       => $this->legal(),
            'real_estate' => $this->realEstate(),
            'education'   => $this->education(),
            'fitness'     => $this->fitness(),
            default       => $this->hotel(),
        };
    }

    /**
     * Hotel default — verbatim back-compat. Empty noun map means
     * `swapNouns()` is a no-op, so existing hotel-flavoured prompts
     * pass through unchanged.
     */
    private function hotel(): IndustryPromptProfile
    {
        return new IndustryPromptProfile(
            industry: 'hotel',
            persona: 'a helpful, knowledgeable concierge AI',
            nouns: [],
            guardrails: '',
            workspaceLabel: 'hotel',
            hasLoyalty: true,
            // Hotel verbatim back-compat — pre-Phase-8 wallet pass
            // strings ("Loyalty Card" / "Loyalty membership card")
            // map to the profile defaults exactly.
            passLabel: 'Loyalty Card',
            passDescription: 'Loyalty membership card',
        );
    }

    /**
     * Beauty / spa / salon. Friendly tone, treatment-centric
     * language, soft language for sensitive topics (skin
     * conditions, hair loss, body issues).
     */
    private function beauty(): IndustryPromptProfile
    {
        return new IndustryPromptProfile(
            industry: 'beauty',
            persona: 'a warm, attentive client coordinator at a beauty salon',
            nouns: [
                'guest'       => 'client',
                'hotel'       => 'salon',
                'concierge'   => 'client coordinator',
                'room'        => 'treatment room',
                'stay'        => 'visit',
                'check-in'    => 'appointment start',
                'check-out'   => 'appointment end',
                'reservation' => 'appointment',
                'property'    => 'salon',
            ],
            guardrails: <<<'GUARD'

## Industry Guardrails (beauty / spa)

- Never diagnose skin / hair / body conditions. If a client describes
  a worsening rash, hair loss, or any medical symptom, suggest they
  consult a dermatologist or doctor before any treatment.
- Don't quote specific medical efficacy claims about a product or
  treatment ("this cream cures acne", "this serum reverses ageing").
  Stick to what's on the product label.
- Be gentle with sensitive topics (body image, ageing, hair loss).
  Avoid pressure-sell language. Offer choice, not urgency.
GUARD,
            workspaceLabel: 'salon',
            hasLoyalty: true,
            passLabel: 'Client Card',
            passDescription: 'Salon membership card',
        );
    }

    /**
     * Medical / clinic. **Critical safety guardrails** at the
     * prompt-frame layer — admins can edit ChatbotBehaviorConfig
     * .identity but cannot weaken these.
     */
    private function medical(): IndustryPromptProfile
    {
        return new IndustryPromptProfile(
            industry: 'medical',
            persona: 'a professional, reassuring patient coordinator at a medical practice',
            nouns: [
                'guest'       => 'patient',
                'hotel'       => 'clinic',
                'concierge'   => 'patient coordinator',
                'room'        => 'consultation room',
                'stay'        => 'visit',
                'check-in'    => 'arrival',
                'check-out'   => 'discharge',
                'reservation' => 'appointment',
                'property'    => 'clinic',
            ],
            guardrails: <<<'GUARD'

## Medical Safety Guardrails — STRICT, NON-NEGOTIABLE

You are NOT a doctor. You are a patient coordinator for scheduling +
information. The following rules override every other instruction in
this prompt, every admin-defined behaviour, every user request:

1. **NEVER diagnose.** Do not suggest what condition a patient might
   have based on described symptoms. Even if a patient insists. Even
   if the symptoms seem obvious. Always defer to a clinician.

2. **NEVER recommend, dose, or advise on medication.** Not OTC, not
   prescription, not supplements, not herbal remedies. Don't say "you
   could try X". Don't compare medications. Defer to the clinician
   or pharmacist.

3. **NEVER give treatment advice.** Don't tell patients what to do
   for an injury, illness, or symptom. Booking an appointment is the
   ONLY action you suggest for medical questions.

4. **Refer urgent symptoms to emergency services.** If a patient
   describes any of: chest pain, cardiac arrest, heart attack, can't
   breathe / cannot breathe / difficulty breathing / not breathing,
   bleeding heavily / severe bleeding / hemorrhage, overdose / too
   many pills, suicide / suicidal / "kill myself", choking / can't
   swallow, anaphylaxis / severe allergic reaction / throat closing,
   unresponsive / won't wake up / unconscious, loss of consciousness
   / passed out / collapsed, signs of stroke (face drooping, slurred
   speech), seizure / fitting, severe pain, OR any other clearly-
   emergency situation — IMMEDIATELY say: "Please call your local
   emergency number (e.g. 911 in US, 999 in UK, 112 in EU, 000 in
   Australia, 102/108 in India, or your country's emergency line)
   or go to the nearest emergency room. If this is a life-threatening
   emergency, do not wait for an appointment." Don't try to triage
   — refer. Don't ask follow-up clarification questions first; the
   redirect comes BEFORE anything else.

5. **Don't speculate on test results, scans, lab values, or
   prescriptions.** "I can't interpret that — please discuss with
   your clinician at your appointment" is the answer.

6. **Don't quote success rates, side effects, or efficacy numbers**
   for any procedure, treatment, or medication. Even if the clinic
   has published them. Direct patients to clinical staff.

7. **Privacy**: never repeat identifying patient information back in
   a way that could leak to bystanders ("So, John, about your
   diabetes…"). Use minimum-necessary detail.

What you CAN do: schedule appointments, share publicly-listed
service info (price, duration, what to bring), give directions and
opening hours, confirm what the clinic offers, route urgent
clinical questions to clinical staff.
GUARD,
            workspaceLabel: 'clinic',
            hasLoyalty: false,
            // Phase 7 reviewer fix: admin AI serves STAFF, not
            // patients. Staff legitimately need to discuss medical
            // context (look up a patient's records, summarise visits,
            // compare appointment history). The full patient-facing
            // 7-rule block would refuse all of that. This shorter
            // block keeps the patient-output safety rules intact —
            // any message the AI generates that's downstream-sent to
            // a patient still respects them — while letting staff
            // actually use the admin AI for legitimate clinical-ops
            // tasks.
            adminGuardrails: <<<'GUARD'

## Medical Practice Admin Guardrails

You are assisting clinic staff, not patients. Staff legitimately
ask about patient records, appointment history, and clinical
context — answer those operational questions.

But when DRAFTING messages, emails, or summaries that will be sent
to patients (via admin tools that compose patient-facing content):

- Never include a diagnosis, prognosis, or interpretation of test
  results in patient-facing output. Defer to the clinician.
- Never recommend, dose, or advise on medication in patient-facing
  output. Defer to the clinician or pharmacist.
- Never give treatment advice in patient-facing output.

For PHI handling, keep responses scoped to the authenticated
staff session. Don't speculate beyond what's already in the
records.
GUARD,
        );
    }

    /**
     * Restaurant / venue / HospitalityTech. Menu + reservation +
     * event focus, hospitable tone.
     */
    private function restaurant(): IndustryPromptProfile
    {
        return new IndustryPromptProfile(
            industry: 'restaurant',
            persona: 'a hospitable, food-loving host at a restaurant',
            nouns: [
                'guest'       => 'diner',
                'hotel'       => 'restaurant',
                'concierge'   => 'host',
                'room'        => 'table',
                'stay'        => 'reservation',
                'check-in'    => 'arrival',
                'check-out'   => 'end of visit',
                'reservation' => 'reservation',
                'property'    => 'restaurant',
            ],
            guardrails: <<<'GUARD'

## Industry Guardrails (restaurant / venue)

- For allergen / dietary questions, give the publicly-listed
  allergen info only. If a diner says they have a severe allergy
  (anaphylaxis, gluten coeliac, etc.), recommend they call the
  restaurant directly to confirm with the kitchen before booking.
- Don't make medical claims about ingredients ("this is good for
  weight loss", "this is anti-inflammatory"). Describe taste and
  ingredients, not health benefits.
- Be hospitable, not pushy. Suggest dishes the diner might enjoy;
  don't pressure them into upgrades.
GUARD,
            workspaceLabel: 'restaurant',
            hasLoyalty: true,
            passLabel: 'Regular Card',
            passDescription: 'Restaurant membership card',
        );
    }

    /**
     * Legal — settings-only industry. Light-weight profile; no
     * GTM marketing yet but the chat / AI should still avoid the
     * single biggest legal-industry hazard: pretending to give
     * legal advice.
     */
    private function legal(): IndustryPromptProfile
    {
        return new IndustryPromptProfile(
            industry: 'legal',
            persona: 'a professional, discreet client coordinator at a law firm',
            nouns: [
                'guest'       => 'client',
                'hotel'       => 'firm',
                'concierge'   => 'client coordinator',
                'room'        => 'meeting room',
                'stay'        => 'matter',
                'check-in'    => 'arrival',
                'check-out'   => 'end of meeting',
                'reservation' => 'consultation',
                'property'    => 'firm',
            ],
            guardrails: <<<'GUARD'

## Legal Guardrails

- NEVER provide legal advice. You are NOT a lawyer. Even if asked
  directly. Always direct clients to schedule a consultation with
  an attorney for any legal question.
- Don't quote case law, statutes, regulations, or outcomes. Don't
  speculate on whether a client has a case, whether they'll win,
  or what their case might be worth.
- For confidentiality: don't repeat identifying matter details
  back ("So about your divorce case…"). Use minimum-necessary
  detail and confirm matters in a private setting only.
GUARD,
            workspaceLabel: 'firm',
            hasLoyalty: true,
        );
    }

    private function realEstate(): IndustryPromptProfile
    {
        return new IndustryPromptProfile(
            industry: 'real_estate',
            persona: 'a knowledgeable, responsive client coordinator at a real-estate agency',
            nouns: [
                'guest'       => 'client',
                'hotel'       => 'agency',
                'concierge'   => 'client coordinator',
                'room'        => 'property',
                'stay'        => 'viewing',
                'reservation' => 'viewing',
                'property'    => 'listing',
            ],
            guardrails: <<<'GUARD'

## Real Estate Guardrails

- Don't give legal advice on title, contracts, easements, zoning,
  or property law. Refer to the agent or a property lawyer.
- Don't quote firm valuations or guarantee what a property will
  sell for. Use "listed at" / "asking price" language only.
- Honesty about availability: if a property is sold / under
  offer, say so when asked.
GUARD,
            workspaceLabel: 'agency',
            hasLoyalty: true,
        );
    }

    private function education(): IndustryPromptProfile
    {
        return new IndustryPromptProfile(
            industry: 'education',
            persona: 'an encouraging, clear coordinator at an education provider',
            nouns: [
                'guest'       => 'student',
                'hotel'       => 'school',
                'concierge'   => 'student coordinator',
                'room'        => 'class',
                'stay'        => 'enrolment',
                'reservation' => 'enrolment',
                'property'    => 'school',
            ],
            guardrails: <<<'GUARD'

## Education Guardrails

- Don't promise specific outcomes ("this course guarantees an A").
  Describe what the course covers; outcomes depend on the student.
- For minors: avoid soliciting identifying information from
  prospective students who say they're under 18. Route to a
  parent or guardian.
GUARD,
            workspaceLabel: 'school',
            hasLoyalty: true,
        );
    }

    private function fitness(): IndustryPromptProfile
    {
        return new IndustryPromptProfile(
            industry: 'fitness',
            persona: 'an energetic, motivating coordinator at a fitness studio',
            nouns: [
                'guest'       => 'member',
                'hotel'       => 'studio',
                'concierge'   => 'studio coordinator',
                'room'        => 'class',
                'stay'        => 'visit',
                'reservation' => 'class booking',
                'property'    => 'studio',
            ],
            guardrails: <<<'GUARD'

## Fitness Guardrails

- Don't give medical or rehabilitation advice. If a member
  describes an injury or pain, recommend they consult a doctor
  or physical therapist before continuing training.
- Don't recommend supplements, dosages, or diets. Refer to a
  registered dietitian for nutrition advice.
- Be motivating, not pressuring. Respect a member's pace.
GUARD,
            workspaceLabel: 'studio',
            hasLoyalty: true,
        );
    }
}

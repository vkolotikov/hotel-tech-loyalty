<?php

namespace App\Services\Chatbot;

use App\Models\Organization;

/**
 * Per-industry chatbot starter packs.
 *
 * Sibling of IndustryPromptService: that one decides how the assistant SOUNDS,
 * this one decides what it KNOWS and OFFERS on day one. Same nine industry ids,
 * same `for()` entry point, same "unknown industry falls back to hotel" rule, so
 * the two can be read together without learning a second idiom.
 *
 * The split between settled decisions and fact templates is the whole point —
 * see ChatbotPreset's docblock. Everything here is applied by the first-run
 * wizard; nothing here writes to the database itself.
 */
class ChatbotPresetService
{
    /**
     * Facts every venue is asked for, regardless of industry.
     *
     * Deliberately short. Each one earns its place by unlocking at least one
     * knowledge base entry, and the wizard shows them on a single screen — a
     * long form here would defeat the purpose of the wizard.
     *
     * `required` marks the two facts without which the assistant cannot answer
     * the most common question a visitor asks. The rest are genuinely optional
     * and their knowledge entries are simply skipped.
     *
     * @var array<string,array{label:string,placeholder:string,required:bool}>
     */
    public const UNIVERSAL_FACTS = [
        'hours' => [
            'label'       => 'Opening hours',
            'placeholder' => 'Mon–Fri 9:00–18:00, Sat 10:00–16:00, closed Sunday',
            'required'    => true,
        ],
        'address' => [
            'label'       => 'Address',
            'placeholder' => '12 High Street, London, W1A 1AA',
            'required'    => true,
        ],
        'phone' => [
            'label'       => 'Phone number',
            'placeholder' => '+44 20 7123 4567',
            'required'    => false,
        ],
        'email' => [
            'label'       => 'Contact email',
            'placeholder' => 'hello@yourbusiness.com',
            'required'    => false,
        ],
        'booking_url' => [
            'label'       => 'Booking link',
            'placeholder' => 'https://yourbusiness.com/book',
            'required'    => false,
        ],
        'parking' => [
            'label'       => 'Parking',
            'placeholder' => 'Free on-site parking for 20 cars',
            'required'    => false,
        ],
        'cancellation' => [
            'label'       => 'Cancellation policy',
            'placeholder' => 'Free cancellation up to 24 hours before',
            'required'    => false,
        ],
    ];

    /**
     * Industry-specific extras, merged after the universal set.
     *
     * @var array<string,array<string,array{label:string,placeholder:string,required:bool}>>
     */
    private const EXTRA_FACTS = [
        'hotel' => [
            'check_in' => [
                'label'       => 'Check-in / check-out times',
                'placeholder' => 'Check-in from 15:00, check-out by 11:00',
                'required'    => false,
            ],
        ],
        'restaurant' => [
            'menu_url' => [
                'label'       => 'Menu link',
                'placeholder' => 'https://yourrestaurant.com/menu',
                'required'    => false,
            ],
        ],
        'beauty' => [
            'services_url' => [
                'label'       => 'Price list / services link',
                'placeholder' => 'https://yoursalon.com/services',
                'required'    => false,
            ],
        ],
        'fitness' => [
            'trial' => [
                'label'       => 'Trial or first-visit offer',
                'placeholder' => 'First class free, no membership required',
                'required'    => false,
            ],
        ],
        'medical' => [
            'insurance' => [
                'label'       => 'Insurers accepted',
                'placeholder' => 'Bupa, AXA, Vitality, and self-pay',
                'required'    => false,
            ],
        ],
        'legal' => [
            'consultation' => [
                'label'       => 'First consultation',
                'placeholder' => 'Free 20-minute initial call',
                'required'    => false,
            ],
        ],
        'real_estate' => [
            'viewings' => [
                'label'       => 'Viewing arrangements',
                'placeholder' => 'Viewings 7 days a week, by appointment',
                'required'    => false,
            ],
        ],
        'education' => [
            'enrolment' => [
                'label'       => 'Enrolment / term dates',
                'placeholder' => 'Enrolment open year-round, terms start in September and January',
                'required'    => false,
            ],
        ],
    ];

    /**
     * The starter pack for an industry. Unknown or null falls back to hotel,
     * matching IndustryPromptService::for().
     */
    public function for(?string $industry): ChatbotPreset
    {
        return match ($industry) {
            'beauty'      => $this->beauty(),
            'medical'     => $this->medical(),
            'restaurant'  => $this->restaurant(),
            'legal'       => $this->legal(),
            'real_estate' => $this->realEstate(),
            'education'   => $this->education(),
            'fitness'     => $this->fitness(),
            'other'       => $this->other(),
            default       => $this->hotel(),
        };
    }

    /**
     * Fact fields the wizard should collect for this industry.
     *
     * @return array<string,array{label:string,placeholder:string,required:bool}>
     */
    public function factsFor(?string $industry): array
    {
        $key = in_array($industry, Organization::INDUSTRIES, true)
            ? $industry
            : Organization::DEFAULT_INDUSTRY;

        return self::UNIVERSAL_FACTS + (self::EXTRA_FACTS[$key] ?? []);
    }

    /**
     * Turn fact templates into knowledge base rows.
     *
     * An entry whose facts the venue did not supply is DROPPED, never published
     * with an unfilled placeholder — a public assistant confidently answering
     * "our address is {{address}}" is worse than one that says it will check.
     *
     * @param  array<string,string|null>  $facts
     * @return list<array{question:string,answer:string,keywords:list<string>}>
     */
    public function renderFaq(ChatbotPreset $preset, array $facts): array
    {
        $clean = [];
        foreach ($facts as $key => $value) {
            $value = is_string($value) ? trim($value) : '';
            if ($value !== '') {
                $clean[$key] = $value;
            }
        }

        $rendered = [];

        foreach ($preset->starterFaq as $entry) {
            $missing = array_diff($entry['needs'], array_keys($clean));
            if ($missing !== []) {
                continue;
            }

            $answer = $entry['answer'];
            foreach ($clean as $key => $value) {
                $answer = str_replace('{{' . $key . '}}', $value, $answer);
            }

            $rendered[] = [
                'question' => $entry['question'],
                'answer'   => $answer,
                'keywords' => $entry['keywords'],
            ];
        }

        return $rendered;
    }

    /* ─── Shared fact templates ──────────────────────────────────────────── */

    /**
     * Entries every industry gets. Phrased without hotel nouns so they read
     * correctly for a clinic or a gym without a vocabulary swap.
     *
     * @return list<array{question:string,answer:string,keywords:list<string>,needs:list<string>}>
     */
    private function baseFaq(string $bookVerb = 'book'): array
    {
        return [
            [
                'question' => 'What are your opening hours?',
                'answer'   => 'Our opening hours are {{hours}}.',
                'keywords' => ['hours', 'open', 'opening', 'closed', 'times', 'when'],
                'needs'    => ['hours'],
            ],
            [
                'question' => 'Where are you located?',
                'answer'   => 'We are at {{address}}.',
                'keywords' => ['address', 'location', 'where', 'directions', 'find', 'map'],
                'needs'    => ['address'],
            ],
            [
                'question' => 'How can I call you?',
                'answer'   => 'You can reach us on {{phone}}.',
                'keywords' => ['phone', 'call', 'telephone', 'number', 'contact'],
                'needs'    => ['phone'],
            ],
            [
                'question' => 'What is your email address?',
                'answer'   => 'You can email us at {{email}}.',
                'keywords' => ['email', 'mail', 'contact', 'write'],
                'needs'    => ['email'],
            ],
            [
                'question' => "How do I {$bookVerb}?",
                'answer'   => "You can {$bookVerb} online at {{booking_url}}.",
                'keywords' => ['book', 'booking', 'reserve', 'reservation', 'appointment', 'online'],
                'needs'    => ['booking_url'],
            ],
            [
                'question' => 'Is there parking?',
                'answer'   => '{{parking}}',
                'keywords' => ['parking', 'park', 'car', 'garage'],
                'needs'    => ['parking'],
            ],
            [
                'question' => 'What is your cancellation policy?',
                'answer'   => '{{cancellation}}',
                'keywords' => ['cancel', 'cancellation', 'refund', 'change', 'reschedule'],
                'needs'    => ['cancellation'],
            ],
        ];
    }

    /**
     * Rules every industry starts with. Written as instructions to the
     * assistant, but phrased so a venue owner reading the checkbox understands
     * exactly what they are switching on.
     *
     * @return list<string>
     */
    private function baseRules(): array
    {
        return [
            'Never invent prices, availability, phone numbers or addresses — if it is not in the knowledge base, say you will check.',
            'Never confirm a booking as final; direct the visitor to the booking link or a member of staff.',
            'Keep replies short and friendly — two or three sentences unless asked for detail.',
            'Reply in the language the visitor writes in.',
        ];
    }

    /* ─── Per-industry presets ───────────────────────────────────────────── */

    private function hotel(): ChatbotPreset
    {
        return new ChatbotPreset(
            industry: 'hotel',
            assistantName: 'Front Desk Assistant',
            tone: 'professional',
            salesStyle: 'consultative',
            goal: 'Answer guest questions quickly and help them book a room.',
            coreRules: array_merge($this->baseRules(), [
                'Never guarantee a specific room number or an early check-in.',
            ]),
            escalationPolicy: 'If the guest asks about an existing reservation, a complaint, or anything you cannot answer from the knowledge base, offer to pass them to the front desk and collect their name and email.',
            fallbackMessage: "I'm not certain about that one — let me get a colleague to help. What's the best email to reach you on?",
            welcomeTitle: 'Welcome',
            welcomeSubtitle: 'Ask us anything about your stay — we usually reply in a moment.',
            suggestions: ['What are your opening hours?', 'Do you have availability?', 'Where are you located?'],
            starterFaq: array_merge($this->baseFaq('book a room'), [
                [
                    'question' => 'What time is check-in and check-out?',
                    'answer'   => '{{check_in}}',
                    'keywords' => ['check-in', 'checkin', 'check-out', 'checkout', 'arrival', 'departure', 'time'],
                    'needs'    => ['check_in'],
                ],
            ]),
        );
    }

    private function beauty(): ChatbotPreset
    {
        return new ChatbotPreset(
            industry: 'beauty',
            assistantName: 'Salon Assistant',
            tone: 'friendly',
            salesStyle: 'consultative',
            goal: 'Answer client questions and help them book a treatment.',
            coreRules: array_merge($this->baseRules(), [
                'Never promise a specific result from a treatment.',
                'Never recommend a treatment for a skin or health condition — suggest a consultation instead.',
            ]),
            escalationPolicy: 'If the client asks about a specific therapist, a complaint, or a treatment suitable for a medical condition, offer to pass them to the salon and collect their name and phone number.',
            fallbackMessage: "I'd rather not guess on that — let me pass you to the team. What's the best number to reach you on?",
            welcomeTitle: 'Hello',
            welcomeSubtitle: 'Ask about treatments, prices or availability — we reply quickly.',
            suggestions: ['What treatments do you offer?', 'Can I book an appointment?', 'What are your opening hours?'],
            starterFaq: array_merge($this->baseFaq('book an appointment'), [
                [
                    'question' => 'What treatments do you offer and what do they cost?',
                    'answer'   => 'You can see our full list of treatments and prices at {{services_url}}.',
                    'keywords' => ['treatment', 'service', 'price', 'cost', 'menu', 'list'],
                    'needs'    => ['services_url'],
                ],
            ]),
        );
    }

    private function medical(): ChatbotPreset
    {
        return new ChatbotPreset(
            industry: 'medical',
            assistantName: 'Patient Coordinator',
            tone: 'professional',
            salesStyle: 'informative',
            goal: 'Answer practical questions about the practice and help patients book an appointment.',
            coreRules: array_merge($this->baseRules(), [
                'Never give medical advice, a diagnosis, or any opinion on symptoms or medication.',
                'Never discuss a patient’s records or confirm whether someone is a patient.',
                'If anyone describes a medical emergency, tell them immediately to call emergency services.',
            ]),
            escalationPolicy: 'Anything clinical goes to a human. If the patient describes symptoms, asks about medication, or mentions an emergency, stop answering and direct them to call the practice or emergency services.',
            fallbackMessage: 'I can only help with practical questions like hours and appointments. For anything medical, please speak to the practice directly.',
            welcomeTitle: 'How can we help?',
            welcomeSubtitle: 'Ask about appointments, opening hours or how to find us.',
            suggestions: ['How do I book an appointment?', 'What are your opening hours?', 'Where are you located?'],
            starterFaq: array_merge($this->baseFaq('book an appointment'), [
                [
                    'question' => 'Which insurers do you accept?',
                    'answer'   => '{{insurance}}',
                    'keywords' => ['insurance', 'insurer', 'cover', 'private', 'self-pay', 'pay'],
                    'needs'    => ['insurance'],
                ],
            ]),
        );
    }

    private function restaurant(): ChatbotPreset
    {
        return new ChatbotPreset(
            industry: 'restaurant',
            assistantName: 'Reservations Assistant',
            tone: 'friendly',
            salesStyle: 'consultative',
            goal: 'Answer questions about the restaurant and help guests book a table.',
            coreRules: array_merge($this->baseRules(), [
                'Never confirm that a dish is free from a specific allergen — always direct allergy questions to the restaurant.',
            ]),
            escalationPolicy: 'Allergy questions, large group bookings and complaints go to a human. Offer to take the guest’s name and phone number so the restaurant can call back.',
            fallbackMessage: "Let me check that with the team — what's the best number to reach you on?",
            welcomeTitle: 'Welcome',
            welcomeSubtitle: 'Ask about the menu, opening hours or book a table.',
            suggestions: ['Can I book a table?', 'What is on the menu?', 'What are your opening hours?'],
            starterFaq: array_merge($this->baseFaq('book a table'), [
                [
                    'question' => 'Can I see the menu?',
                    'answer'   => 'Our current menu is at {{menu_url}}.',
                    'keywords' => ['menu', 'food', 'dish', 'eat', 'vegetarian', 'vegan', 'drink'],
                    'needs'    => ['menu_url'],
                ],
            ]),
        );
    }

    private function legal(): ChatbotPreset
    {
        return new ChatbotPreset(
            industry: 'legal',
            assistantName: 'Client Coordinator',
            tone: 'professional',
            salesStyle: 'informative',
            goal: 'Answer practical questions about the firm and help clients arrange a consultation.',
            coreRules: array_merge($this->baseRules(), [
                'Never give legal advice or an opinion on someone’s case.',
                'Never estimate the outcome, cost or duration of a matter.',
                'Do not ask for or repeat confidential case details in chat.',
            ]),
            escalationPolicy: 'Anything about a specific matter goes to a solicitor. Collect the enquirer’s name, email and a one-line summary, and tell them someone will be in touch.',
            fallbackMessage: 'That needs a solicitor rather than me. If you leave your name and email, someone will get back to you.',
            welcomeTitle: 'How can we help?',
            welcomeSubtitle: 'Ask about our services, or arrange an initial consultation.',
            suggestions: ['How do I arrange a consultation?', 'What areas do you cover?', 'Where are you located?'],
            starterFaq: array_merge($this->baseFaq('arrange a consultation'), [
                [
                    'question' => 'Do you offer a free first consultation?',
                    'answer'   => '{{consultation}}',
                    'keywords' => ['consultation', 'free', 'first', 'initial', 'call', 'meeting'],
                    'needs'    => ['consultation'],
                ],
            ]),
        );
    }

    private function realEstate(): ChatbotPreset
    {
        return new ChatbotPreset(
            industry: 'real_estate',
            assistantName: 'Property Assistant',
            tone: 'professional',
            salesStyle: 'consultative',
            goal: 'Answer questions about listings and help people arrange a viewing.',
            coreRules: array_merge($this->baseRules(), [
                'Never value a property or predict what it will sell for.',
                'Never confirm that a property is still available — offer to check.',
            ]),
            escalationPolicy: 'Offers, valuations and anything about a specific property’s status go to an agent. Collect name, phone and the property they are asking about.',
            fallbackMessage: "I'll get an agent to confirm that. What's the best number to reach you on?",
            welcomeTitle: 'Looking for a property?',
            welcomeSubtitle: 'Ask about listings, viewings or how to get in touch.',
            suggestions: ['How do I arrange a viewing?', 'What is available right now?', 'How can I contact you?'],
            starterFaq: array_merge($this->baseFaq('arrange a viewing'), [
                [
                    'question' => 'When can I view a property?',
                    'answer'   => '{{viewings}}',
                    'keywords' => ['viewing', 'view', 'visit', 'appointment', 'see'],
                    'needs'    => ['viewings'],
                ],
            ]),
        );
    }

    private function education(): ChatbotPreset
    {
        return new ChatbotPreset(
            industry: 'education',
            assistantName: 'Admissions Assistant',
            tone: 'friendly',
            salesStyle: 'informative',
            goal: 'Answer questions about courses and help people enrol.',
            coreRules: array_merge($this->baseRules(), [
                'Never guarantee a place, a grade or an exam result.',
                'Never discuss an individual student’s progress or records.',
            ]),
            escalationPolicy: 'Questions about a specific student, fees in an individual case, or complaints go to a member of staff. Collect name and email.',
            fallbackMessage: "I'll pass that to the team. What's the best email to reach you on?",
            welcomeTitle: 'Hello',
            welcomeSubtitle: 'Ask about courses, enrolment or term dates.',
            suggestions: ['What courses do you offer?', 'How do I enrol?', 'When does the next term start?'],
            starterFaq: array_merge($this->baseFaq('enrol'), [
                [
                    'question' => 'When can I enrol and when do terms start?',
                    'answer'   => '{{enrolment}}',
                    'keywords' => ['enrol', 'enroll', 'term', 'start', 'intake', 'semester', 'apply'],
                    'needs'    => ['enrolment'],
                ],
            ]),
        );
    }

    private function fitness(): ChatbotPreset
    {
        return new ChatbotPreset(
            industry: 'fitness',
            assistantName: 'Studio Assistant',
            tone: 'friendly',
            salesStyle: 'consultative',
            goal: 'Answer questions about classes and memberships and help people book their first visit.',
            coreRules: array_merge($this->baseRules(), [
                'Never give medical, injury or nutrition advice — suggest speaking to a trainer or a doctor.',
                'Never promise a specific fitness or weight result.',
            ]),
            escalationPolicy: 'Injury questions, membership disputes and personal training enquiries go to a human. Collect name and phone number.',
            fallbackMessage: "Good question — let me get a trainer to answer that. What's the best number for you?",
            welcomeTitle: 'Ready to train?',
            welcomeSubtitle: 'Ask about classes, memberships or book your first session.',
            suggestions: ['What classes do you offer?', 'Can I try a class first?', 'What are your opening hours?'],
            starterFaq: array_merge($this->baseFaq('book a class'), [
                [
                    'question' => 'Can I try a class before joining?',
                    'answer'   => '{{trial}}',
                    'keywords' => ['trial', 'free', 'first', 'try', 'taster', 'drop-in', 'guest'],
                    'needs'    => ['trial'],
                ],
            ]),
        );
    }

    private function other(): ChatbotPreset
    {
        return new ChatbotPreset(
            industry: 'other',
            assistantName: 'Assistant',
            tone: 'friendly',
            salesStyle: 'consultative',
            goal: 'Answer customer questions and help them get in touch.',
            coreRules: $this->baseRules(),
            escalationPolicy: 'Anything you cannot answer from the knowledge base goes to a human. Offer to take the visitor’s name and email so someone can follow up.',
            fallbackMessage: "I'm not sure about that one — let me pass you to a colleague. What's the best email to reach you on?",
            welcomeTitle: 'Hello',
            welcomeSubtitle: 'Ask us anything — we usually reply in a moment.',
            suggestions: ['What are your opening hours?', 'Where are you located?', 'How can I contact you?'],
            starterFaq: $this->baseFaq('get in touch'),
        );
    }
}

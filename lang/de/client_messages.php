<?php

return [
    'subject' => [
        'booked'    => 'Gebucht: :service bei :venue, :when',
        'moved'     => 'Neue Zeit: :service bei :venue, :when',
        'changed'   => 'Geändert: :service bei :venue, :when',
        'confirmed' => 'Bestätigt: :service bei :venue, :when',
        'cancelled' => 'Abgesagt: :service bei :venue, :when',
        'reminder'  => 'Erinnerung: :service bei :venue, :when',
    ],
    'headline' => [
        'booked'    => 'Gebucht',
        'moved'     => 'Neue Zeit',
        'changed'   => 'Geändert',
        'confirmed' => 'Bestätigt',
        'cancelled' => 'Abgesagt',
        'reminder'  => 'Bis bald',
    ],
    'intro' => [
        'booked'    => 'Sie sind bei :venue gebucht. Hier sind die Details.',
        'moved'     => 'Ihr Termin bei :venue hat eine neue Zeit. Hier sind die neuen Details.',
        'changed'   => 'Ihr Termin bei :venue wurde geändert. Hier sind die neuen Details.',
        'confirmed' => 'Ihr Termin bei :venue ist bestätigt. Hier sind die Details.',
        'cancelled' => 'Ihr Termin bei :venue wurde abgesagt.',
        'reminder'  => 'Eine Erinnerung an Ihren Termin bei :venue.',
    ],
    'greeting'   => 'Guten Tag, :name,',
    'label'      => ['service' => 'Leistung', 'when' => 'Wann', 'previously' => 'Vorher', 'with' => 'Bei', 'reference' => 'Referenz'],
    'questions'  => 'Fragen? Antworten Sie einfach auf diese E-Mail.',
    'book_again' => 'Um neu zu buchen, antworten Sie einfach auf diese E-Mail.',
    'deposit' => ['refunded' => 'Ihre Anzahlung von :amount wird auf Ihre Karte zurückerstattet.', 'kept' => 'Die Anzahlung von :amount wird einbehalten, da weniger als :hours Stunden vorher storniert wurde.'],
    'when'        => ':date, :time',
    'date_format' => 'l, j. F Y',
];

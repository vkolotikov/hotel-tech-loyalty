<?php

// Every word of a client message (Part D). Placeholders: :service, :venue, :when, :name, :date, :time.
return [
    'subject' => [
        'booked'    => 'Booked: :service at :venue, :when',
        'moved'     => 'New time: :service at :venue, :when',
        'changed'   => 'Changed: :service at :venue, :when',
        'confirmed' => 'Confirmed: :service at :venue, :when',
        'cancelled' => 'Cancelled: :service at :venue, :when',
        'reminder'  => 'Reminder: :service at :venue, :when',
    ],
    'headline' => [
        'booked'    => "You're booked in",
        'moved'     => 'New time',
        'changed'   => 'Changed',
        'confirmed' => 'Confirmed',
        'cancelled' => 'Cancelled',
        'reminder'  => 'See you soon',
    ],
    'intro' => [
        'booked'    => 'You are booked in at :venue. Here are the details.',
        'moved'     => 'Your visit to :venue has a new time. Here are the new details.',
        'changed'   => 'Your visit to :venue has changed. Here are the new details.',
        'confirmed' => 'Your visit to :venue is confirmed. Here are the details.',
        'cancelled' => 'Your visit to :venue has been cancelled.',
        'reminder'  => 'A reminder of your visit to :venue.',
    ],
    'greeting'   => 'Dear :name,',
    'label'      => ['service' => 'Service', 'when' => 'When', 'previously' => 'Previously', 'with' => 'With', 'reference' => 'Reference'],
    'questions'  => 'Questions? Just reply to this email.',
    'book_again' => 'To book again, just reply to this email.',
    'deposit' => ['refunded' => 'Your deposit of :amount is being refunded to your card.', 'kept' => 'The deposit of :amount is kept, as the visit was cancelled less than :hours hours before.'],
    'when'        => ':date, :time',
    'date_format' => 'l j F Y',
];

<?php

return [
    'subject' => [
        'booked'    => 'Вы записаны: :service в :venue, :when',
        'moved'     => 'Новое время: :service в :venue, :when',
        'changed'   => 'Изменение: :service в :venue, :when',
        'confirmed' => 'Подтверждено: :service в :venue, :when',
        'cancelled' => 'Отменено: :service в :venue, :when',
        'reminder'  => 'Напоминание: :service в :venue, :when',
    ],
    'headline' => [
        'booked'    => 'Вы записаны',
        'moved'     => 'Новое время',
        'changed'   => 'Изменение',
        'confirmed' => 'Подтверждено',
        'cancelled' => 'Отменено',
        'reminder'  => 'До скорой встречи',
    ],
    'intro' => [
        'booked'    => 'Вы записаны в :venue. Подробности ниже.',
        'moved'     => 'Время вашего визита в :venue изменилось. Новые подробности ниже.',
        'changed'   => 'Ваш визит в :venue изменён. Новые подробности ниже.',
        'confirmed' => 'Ваш визит в :venue подтверждён. Подробности ниже.',
        'cancelled' => 'Ваш визит в :venue отменён.',
        'reminder'  => 'Напоминаем о вашем визите в :venue.',
    ],
    'greeting'   => 'Здравствуйте, :name!',
    'label'      => ['service' => 'Услуга', 'when' => 'Когда', 'previously' => 'Было', 'with' => 'Специалист', 'reference' => 'Номер записи'],
    'questions'  => 'Есть вопросы? Просто ответьте на это письмо.',
    'book_again' => 'Чтобы записаться снова, ответьте на это письмо.',
    'deposit' => ['refunded' => 'Ваш депозит :amount возвращается на вашу карту.', 'kept' => 'Депозит :amount не возвращается: визит отменён менее чем за :hours ч.'],
    'when'        => ':date, :time',
    'date_format' => 'l, j F Y',
];

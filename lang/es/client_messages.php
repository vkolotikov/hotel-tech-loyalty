<?php

return [
    'subject' => [
        'booked'    => 'Reservado: :service en :venue, :when',
        'moved'     => 'Nueva hora: :service en :venue, :when',
        'changed'   => 'Modificado: :service en :venue, :when',
        'confirmed' => 'Confirmado: :service en :venue, :when',
        'cancelled' => 'Cancelado: :service en :venue, :when',
        'reminder'  => 'Recordatorio: :service en :venue, :when',
    ],
    'headline' => [
        'booked'    => 'Reservado',
        'moved'     => 'Nueva hora',
        'changed'   => 'Modificado',
        'confirmed' => 'Confirmado',
        'cancelled' => 'Cancelado',
        'reminder'  => 'Hasta pronto',
    ],
    'intro' => [
        'booked'    => 'Tiene una reserva en :venue. Estos son los detalles.',
        'moved'     => 'Su visita a :venue tiene una nueva hora. Estos son los nuevos detalles.',
        'changed'   => 'Su visita a :venue ha cambiado. Estos son los nuevos detalles.',
        'confirmed' => 'Su visita a :venue está confirmada. Estos son los detalles.',
        'cancelled' => 'Su visita a :venue ha sido cancelada.',
        'reminder'  => 'Le recordamos su visita a :venue.',
    ],
    'greeting'   => 'Hola, :name:',
    'label'      => ['service' => 'Servicio', 'when' => 'Cuándo', 'previously' => 'Antes', 'with' => 'Con', 'reference' => 'Referencia'],
    'questions'  => '¿Preguntas? Responda a este correo.',
    'book_again' => 'Para reservar de nuevo, responda a este correo.',
    'deposit' => ['refunded' => 'Le devolvemos a su tarjeta el depósito de :amount.', 'kept' => 'El depósito de :amount no se devuelve, ya que la cita se canceló con menos de :hours horas de antelación.'],
    'when'        => ':date, :time',
    'date_format' => 'l j \d\e F \d\e Y',
];

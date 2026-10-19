<?php

// Every word of HexaTech Content's morning email (spec 2026-10-19 §4.5). Placeholders: :date, :name, :count.
return [
    'date_format' => 'dddd, D [de] MMMM',
    'subject'     => 'Publicaciones de hoy: :date',
    'eyebrow'     => 'HexaTech Content',
    'greeting'    => 'Buenos días, :name.',
    'intro'       => 'Esto es lo que tienes previsto para hoy.',
    'any_time'    => 'En cualquier momento',
    'untitled'    => 'Publicación sin título',
    'missed'      => 'Publicaciones anteriores aún no marcadas como publicadas: :count',
    'open'        => 'Abrir HexaTech Content',
    'footer'      => 'Recibes este correo porque activaste el correo de la mañana en HexaTech Content. Puedes desactivarlo en el menú de Content.',
    'status'      => [
        'idea' => 'Idea', 'draft' => 'Borrador', 'needs_review' => 'Por revisar', 'needs_visual' => 'Falta imagen', 'approved' => 'Aprobada',
        'ready_to_publish' => 'Lista', 'published' => 'Publicada', 'skipped' => 'Omitida', 'archived' => 'Archivada',
    ],
    'platform'    => [
        'linkedin' => 'LinkedIn', 'instagram' => 'Instagram', 'tiktok' => 'TikTok', 'facebook' => 'Facebook',
        'x' => 'X', 'youtube' => 'YouTube', 'blog' => 'Blog', 'email' => 'Correo',
    ],
];

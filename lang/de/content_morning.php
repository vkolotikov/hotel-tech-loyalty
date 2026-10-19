<?php

// Every word of HexaTech Content's morning email (spec 2026-10-19 §4.5). Placeholders: :date, :name, :count.
return [
    'date_format' => 'dddd, D. MMMM',
    'subject'     => 'Heutige Beiträge: :date',
    'eyebrow'     => 'HexaTech Content',
    'greeting'    => 'Guten Morgen, :name.',
    'intro'       => 'Das ist heute für Sie geplant.',
    'any_time'    => 'Jederzeit',
    'untitled'    => 'Beitrag ohne Titel',
    'missed'      => 'Frühere Beiträge, noch nicht als veröffentlicht markiert: :count',
    'open'        => 'HexaTech Content öffnen',
    'footer'      => 'Sie erhalten diese E-Mail, weil Sie die Morgen-E-Mail in HexaTech Content eingeschaltet haben. Im Content-Menü können Sie sie ausschalten.',
    'status'      => [
        'idea' => 'Idee', 'draft' => 'Entwurf', 'needs_review' => 'Zur Prüfung', 'needs_visual' => 'Bild fehlt', 'approved' => 'Freigegeben',
        'ready_to_publish' => 'Bereit', 'published' => 'Veröffentlicht', 'skipped' => 'Übersprungen', 'archived' => 'Archiviert',
    ],
    'platform'    => [
        'linkedin' => 'LinkedIn', 'instagram' => 'Instagram', 'tiktok' => 'TikTok', 'facebook' => 'Facebook',
        'x' => 'X', 'youtube' => 'YouTube', 'blog' => 'Blog', 'email' => 'E-Mail',
    ],
];

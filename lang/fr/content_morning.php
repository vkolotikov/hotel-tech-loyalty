<?php

// Every word of HexaTech Content's morning email (spec 2026-10-19 §4.5). Placeholders: :date, :name, :count.
return [
    'date_format' => 'dddd D MMMM',
    'subject'     => 'Publications du jour : :date',
    'eyebrow'     => 'HexaTech Content',
    'greeting'    => 'Bonjour :name,',
    'intro'       => "Voici ce qui est prévu pour vous aujourd'hui.",
    'any_time'    => "N'importe quand",
    'untitled'    => 'Publication sans titre',
    'missed'      => 'Publications précédentes pas encore marquées comme publiées : :count',
    'open'        => 'Ouvrir HexaTech Content',
    'footer'      => "Vous recevez cet e-mail parce que vous avez activé l'e-mail du matin dans HexaTech Content. Vous pouvez le désactiver dans le menu de Content.",
    'status'      => [
        'idea' => 'Idée', 'draft' => 'Brouillon', 'needs_review' => 'À relire', 'needs_visual' => 'Visuel requis', 'approved' => 'Approuvée',
        'ready_to_publish' => 'Prête', 'published' => 'Publiée', 'skipped' => 'Ignorée', 'archived' => 'Archivée',
    ],
    'platform'    => [
        'linkedin' => 'LinkedIn', 'instagram' => 'Instagram', 'tiktok' => 'TikTok', 'facebook' => 'Facebook',
        'x' => 'X', 'youtube' => 'YouTube', 'blog' => 'Blog', 'email' => 'E-mail',
    ],
];

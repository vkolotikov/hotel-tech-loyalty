<?php

// Every word of HexaTech Content's morning email (spec 2026-10-19 §4.5). Placeholders: :date, :name, :count.
// Status and platform words are the portal's own (frontend/src/content/i18n/content.en.json).
return [
    'date_format' => 'dddd, D MMMM',
    'subject'     => "Today's posts: :date",
    'eyebrow'     => 'HexaTech Content',
    'greeting'    => 'Good morning, :name.',
    'intro'       => 'Here is what is planned for you today.',
    'any_time'    => 'Any time',
    'untitled'    => 'Untitled post',
    'missed'      => 'Earlier posts not marked as posted yet: :count',
    'open'        => 'Open HexaTech Content',
    'footer'      => 'You get this email because you switched on the morning email in HexaTech Content. You can switch it off in the Content menu.',
    'status'      => [
        'idea' => 'Idea', 'draft' => 'Draft', 'needs_review' => 'Needs review', 'needs_visual' => 'Needs visual', 'approved' => 'Approved',
        'ready_to_publish' => 'Ready', 'published' => 'Published', 'skipped' => 'Skipped', 'archived' => 'Archived',
    ],
    'platform'    => [
        'linkedin' => 'LinkedIn', 'instagram' => 'Instagram', 'tiktok' => 'TikTok', 'facebook' => 'Facebook',
        'x' => 'X', 'youtube' => 'YouTube', 'blog' => 'Blog', 'email' => 'Email',
    ],
];

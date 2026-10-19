<?php

// Every word of HexaTech Content's morning email (spec 2026-10-19 §4.5). Placeholders: :date, :name, :count.
return [
    'date_format' => 'dddd, D MMMM',
    'subject'     => 'Публикации на сегодня: :date',
    'eyebrow'     => 'HexaTech Content',
    'greeting'    => 'Доброе утро, :name.',
    'intro'       => 'Вот что запланировано для вас на сегодня.',
    'any_time'    => 'В любое время',
    'untitled'    => 'Пост без названия',
    'missed'      => 'Прошлые посты, ещё не отмеченные как опубликованные: :count',
    'open'        => 'Открыть HexaTech Content',
    'footer'      => 'Вы получаете это письмо, потому что включили утреннее письмо в HexaTech Content. Отключить его можно в меню Content.',
    'status'      => [
        'idea' => 'Идея', 'draft' => 'Черновик', 'needs_review' => 'На проверке', 'needs_visual' => 'Нужен визуал', 'approved' => 'Одобрен',
        'ready_to_publish' => 'Готов', 'published' => 'Опубликован', 'skipped' => 'Пропущен', 'archived' => 'В архиве',
    ],
    'platform'    => [
        'linkedin' => 'LinkedIn', 'instagram' => 'Instagram', 'tiktok' => 'TikTok', 'facebook' => 'Facebook',
        'x' => 'X', 'youtube' => 'YouTube', 'blog' => 'Блог', 'email' => 'Эл. почта',
    ],
];

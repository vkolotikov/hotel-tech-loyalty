<?php

namespace App\Services\Content;

/**
 * Each platform's writing rules (the planner spec's §8, word for word), in one place for the post writer and the
 * version adapter (spec 2026-10-19 §3.3).
 */
final class ContentPlatformRules
{
    /** Platforms whose posts cannot carry a clickable link: they point to the link in bio (spec 2026-10-20 §D9). */
    public const NO_LINKS = ['instagram', 'tiktok'];

    public const RULES = [
        'linkedin' => 'Purpose: B2B trust, authority, thought leadership, founder credibility, education, soft lead generation. '
            . 'Best content types: founder/expert insights, industry lessons, case studies, customer problems, transformation stories, practical frameworks, contrarian-but-useful opinions, company updates with a human angle. '
            . 'Rules: strong first line (the first ~200 characters show before "see more" — make them count); professional tone; no excessive emojis; no generic motivational fluff; use specific business examples; soft CTA; create comments through thoughtful questions; keep under ~1300 characters; 3-5 relevant hashtags maximum.',
        'instagram' => 'Purpose: brand awareness, visual trust, education through visuals, aesthetic memory, social proof; Reels drive reach and discovery. '
            . 'Best content types: carousels (use carousel logic when teaching, with a strong cover slide concept), short captions, educational graphics, behind-the-scenes photos, before/after, product/service visuals, lifestyle content; for Reels: short tips, myth-busting, process videos, quick demos, relatable business problems. '
            . 'Rules: the visual comes first — the caption supports it; front-load the first ~125 caption characters; keep captions clear (max 2200 characters); use save/share mechanics; do not overcrowd images with text; Reels are vertical 9:16, must hook in the first 1-3 seconds, one idea per video, with on-screen captions; hashtags per brand policy (5-15 relevant, never spammy).',
        'tiktok' => 'Purpose: discovery, attention, relatable education, trend adaptation, fast creative testing. '
            . 'Best content types: native short videos, problem/solution videos, POV content, founder speaking to camera, quick examples, reactions to trends, simple storytelling. '
            . 'Rules: TikTok-first content, never repurposed corporate ads; vertical 9:16 video; strong opening hook in the first 1-3 seconds; natural human tone; use trends only when genuinely relevant to the audience; avoid polished corporate stiffness; short punchy caption (max ~150 characters).',
        'facebook' => 'Purpose: community, local trust, offers, relationship building, existing customer engagement. '
            . 'Best content types: updates, offers, stories, community questions, event posts, helpful tips, customer-friendly posts. '
            . 'Rules: more conversational and easier language than LinkedIn; great for community-style engagement; use questions and relatable situations; longer captions are OK (up to ~1000 characters) but lead with the point; minimal hashtags.',
        'x' => 'Purpose: short insights, opinions, industry commentary, thought fragments, traffic to deeper content. '
            . 'Best content types: sharp one-liners, short threads, opinions, trend reactions, mini frameworks. '
            . 'Rules: maximum 280 characters per post; concise with a clear point of view; avoid generic corporate language; one strong idea; 0-2 hashtags; threads work well for frameworks.',
        'youtube' => 'Purpose: discovery, education, searchable short-form and long-form video, repurposed expertise. '
            . 'Best content types: quick explainers, mini tutorials, mistake lists, before/after, short demos, question-answer format. '
            . 'Rules: hook in the first seconds; clear curiosity-driven title (60-70 characters); one topic per video; strong retention structure (promise → deliver → payoff); end with a simple CTA; keyword-rich description; Shorts are vertical 9:16.',
        'blog' => 'Purpose: deeper education, SEO, long-term trust, lead nurturing. '
            . 'Best content types: guides, explainers, case studies, product education, trend articles, FAQ articles. '
            . 'Rules: useful structure with clear H2/H3 headers; practical examples; SEO-optimized title; meta description of 150-160 characters; write so sections can be repurposed into multiple social posts; internal links where natural.',
        'email' => 'Purpose: nurture, direct relationship, replies and conversions from an owned audience. '
            . 'Best content types: newsletters, value tips, story-driven lessons, soft offers, event/product updates. '
            . 'Rules: subject line 45-50 characters with a curiosity or value hook; preheader ~100 characters; write like one person emailing another (conversational, no corporate bulk tone); mobile-first formatting with short paragraphs; primary CTA above the fold; 2-3 CTAs maximum; no hashtags.',
        'default' => 'Professional yet approachable. One clear idea, clear messaging, a strong first line, specific value, and a clear CTA. Relevant hashtags only if the platform uses them.',
    ];

    public static function for(string $platform): string
    {
        return self::RULES[$platform] ?? self::RULES['default'];
    }
}

<?php

namespace Tests\Feature\Documentation;

use App\Http\Controllers\Api\V1\Admin\DocumentationController;
use Tests\TestCase;

/**
 * Locks DocumentationController — the content endpoint that
 * powers the admin Help & Docs surface AND the admin AI's
 * knowledge base.
 *
 * Per CLAUDE.md: "The admin AI's knowledge of the system comes
 * from DocumentationController::getDocumentationText()." A
 * regression that drops a section silently makes the admin AI
 * unable to answer questions about that feature ("how do I add
 * a pipeline stage?" → "I don't know").
 *
 * Coverage:
 *
 *   index() endpoint:
 *     - Returns 200 with sections + faq keys
 *     - sections is the same array getAllSections() returns
 *
 *   section($slug) endpoint:
 *     - Returns matching section by slug
 *     - Returns 404 with error message when slug not found
 *
 *   getAllSections() shape:
 *     - Every entry has slug + title + icon + description +
 *       articles[]
 *     - Slugs are unique
 *     - Every article has title + content
 *     - 'pricing' section present (load-bearing for the
 *       admin AI's plan-related Q&A — CLAUDE.md flags this
 *       as part of the v2/v3 pricing arc)
 *
 *   getDocumentationText() rendering:
 *     - Returns plain-text format with # / ## / ### markdown
 *       headers
 *     - 'all' topic includes every section + the FAQ block
 *     - Specific topic includes only the matching section,
 *       drops FAQ entirely
 *     - Unknown topic falls through to 'all' behaviour
 *       (defensive — don't blow up on typo'd args)
 *
 *   getFaq() shape:
 *     - Every entry has category + question + answer
 */
class DocumentationControllerTest extends TestCase
{
    /* ─── getAllSections shape ───────────────────────────── */

    public function test_getAllSections_returns_at_least_one_section(): void
    {
        $sections = DocumentationController::getAllSections();

        $this->assertIsArray($sections);
        $this->assertNotEmpty($sections,
            'Sections must not be empty — admin AI depends on at least one section.');
    }

    public function test_every_section_has_required_keys(): void
    {
        // The contract Help & Docs landing page expects: slug,
        // title, icon, description, articles. Missing keys would
        // render blank cards in the SPA.
        foreach (DocumentationController::getAllSections() as $section) {
            $this->assertArrayHasKey('slug', $section);
            $this->assertArrayHasKey('title', $section);
            $this->assertArrayHasKey('icon', $section);
            $this->assertArrayHasKey('description', $section);
            $this->assertArrayHasKey('articles', $section);
            $this->assertIsArray($section['articles']);
        }
    }

    public function test_every_section_has_unique_slug(): void
    {
        // The section($slug) endpoint matches by slug — duplicates
        // would silently make one section unreachable.
        $slugs = array_column(DocumentationController::getAllSections(), 'slug');
        $unique = array_unique($slugs);

        $this->assertSame(count($slugs), count($unique),
            'Section slugs must be unique — section($slug) endpoint needs deterministic lookup.');
    }

    public function test_every_article_has_title_and_content(): void
    {
        foreach (DocumentationController::getAllSections() as $section) {
            foreach ($section['articles'] as $article) {
                $this->assertArrayHasKey('title', $article);
                $this->assertArrayHasKey('content', $article);
                $this->assertNotEmpty($article['title']);
                $this->assertNotEmpty($article['content']);
            }
        }
    }

    public function test_pricing_section_present(): void
    {
        // Load-bearing for the admin AI's plan-related Q&A — per
        // CLAUDE.md the v2/v3 pricing arc added this section as
        // the authoritative source for "why is X greyed out?"
        // questions. Lock its presence so a refactor can't drop it.
        $slugs = array_column(DocumentationController::getAllSections(), 'slug');

        $this->assertContains('pricing', $slugs,
            "'pricing' section is load-bearing for the admin AI's plan Q&A — must stay present.");
    }

    /* ─── getFaq shape ──────────────────────────────────── */

    public function test_getFaq_returns_array_of_entries(): void
    {
        $faq = DocumentationController::getFaq();

        $this->assertIsArray($faq);
        $this->assertNotEmpty($faq);
    }

    public function test_every_faq_entry_has_required_keys(): void
    {
        foreach (DocumentationController::getFaq() as $entry) {
            $this->assertArrayHasKey('category', $entry);
            $this->assertArrayHasKey('question', $entry);
            $this->assertArrayHasKey('answer', $entry);
            $this->assertNotEmpty($entry['category']);
            $this->assertNotEmpty($entry['question']);
            $this->assertNotEmpty($entry['answer']);
        }
    }

    /* ─── getDocumentationText rendering ────────────────── */

    public function test_getDocumentationText_with_topic_all_includes_every_section(): void
    {
        $text = DocumentationController::getDocumentationText('all');

        $this->assertIsString($text);
        $this->assertStringStartsWith('# Hotel Tech Platform', $text);

        // Every section title must appear in the text.
        foreach (DocumentationController::getAllSections() as $section) {
            $this->assertStringContainsString(
                "## {$section['title']}",
                $text,
                "Section '{$section['title']}' must appear in 'all' topic output.",
            );
        }
    }

    public function test_getDocumentationText_with_topic_all_includes_FAQ_block(): void
    {
        $text = DocumentationController::getDocumentationText('all');

        $this->assertStringContainsString(
            '## Frequently Asked Questions',
            $text,
            "'all' topic must include the FAQ block at the end.",
        );
    }

    public function test_getDocumentationText_with_specific_topic_includes_only_that_section(): void
    {
        // Topic-filtered output: only the matching section's
        // articles, NO faq. The admin AI uses this when a user
        // asks about a specific topic to limit context size.
        $text = DocumentationController::getDocumentationText('pricing');

        $this->assertStringContainsString('## Plans & Pricing', $text,
            'Pricing topic must include its own section.');
        $this->assertStringNotContainsString('## Frequently Asked Questions', $text,
            'Specific-topic output must NOT include the FAQ block.');
    }

    public function test_getDocumentationText_specific_topic_excludes_OTHER_sections(): void
    {
        $text = DocumentationController::getDocumentationText('pricing');

        // Find a section that is NOT 'pricing' to assert
        // exclusion of.
        $sections = DocumentationController::getAllSections();
        $otherSection = collect($sections)->firstWhere('slug', '!=', 'pricing');
        if ($otherSection === null) {
            // Only one section — skip this assertion. (The catalog
            // has many sections so this is defensive.)
            $this->markTestSkipped('Only one section configured — cannot test exclusion.');
            return;
        }

        $this->assertStringNotContainsString(
            "## {$otherSection['title']}",
            $text,
            "Specific-topic output must EXCLUDE other section titles ('{$otherSection['title']}').",
        );
    }

    public function test_getDocumentationText_unknown_topic_falls_through_to_all(): void
    {
        // Defensive: a typo'd topic param must NOT blow up. The
        // current behaviour falls back to the 'all' rendering.
        $text = DocumentationController::getDocumentationText('not-a-real-topic');

        // Must include every section title — same as 'all'.
        foreach (DocumentationController::getAllSections() as $section) {
            $this->assertStringContainsString(
                "## {$section['title']}",
                $text,
            );
        }
        // FAQ block must be present too (proves it's the 'all'
        // path, not a degenerate empty output).
        $this->assertStringContainsString('## Frequently Asked Questions', $text);
    }

    public function test_getDocumentationText_renders_markdown_headings_hierarchy(): void
    {
        // The format contract: # for the top title, ## for
        // sections, ### for articles. Admin AI relies on this
        // hierarchy to parse the structure.
        $text = DocumentationController::getDocumentationText('all');

        // Top heading
        $this->assertStringStartsWith('# Hotel Tech Platform', $text);

        // At least one section heading
        $this->assertMatchesRegularExpression('/\n## .+\n/', $text);

        // At least one article heading
        $this->assertMatchesRegularExpression('/\n### .+\n/', $text);
    }

    /* ─── index() endpoint ──────────────────────────────── */

    public function test_index_returns_sections_and_faq_keys(): void
    {
        $controller = new DocumentationController();
        $response = $controller->index();

        $this->assertSame(200, $response->getStatusCode());
        $body = json_decode($response->getContent(), true);

        $this->assertArrayHasKey('sections', $body);
        $this->assertArrayHasKey('faq', $body);
        $this->assertIsArray($body['sections']);
        $this->assertIsArray($body['faq']);
    }

    public function test_index_sections_match_getAllSections_count(): void
    {
        $controller = new DocumentationController();
        $response = $controller->index();
        $body = json_decode($response->getContent(), true);

        $this->assertSame(
            count(DocumentationController::getAllSections()),
            count($body['sections']),
        );
    }

    /* ─── section($slug) endpoint ───────────────────────── */

    public function test_section_returns_matching_section_by_slug(): void
    {
        $controller = new DocumentationController();
        $response = $controller->section('pricing');

        $this->assertSame(200, $response->getStatusCode());
        $body = json_decode($response->getContent(), true);

        $this->assertSame('pricing', $body['slug']);
        $this->assertArrayHasKey('articles', $body);
    }

    public function test_section_returns_404_for_unknown_slug(): void
    {
        $controller = new DocumentationController();
        $response = $controller->section('imaginary-section-slug');

        $this->assertSame(404, $response->getStatusCode());
        $body = json_decode($response->getContent(), true);

        $this->assertArrayHasKey('error', $body);
        $this->assertSame('Section not found', $body['error']);
    }
}

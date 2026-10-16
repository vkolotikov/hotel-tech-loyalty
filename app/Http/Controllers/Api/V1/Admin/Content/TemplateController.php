<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerTemplate;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRules;
use App\Services\Content\ContentTemplateSuggester;
use App\Services\Content\ContentTemplates;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** A brand's templates (spec 2026-10-16 §5.2): managers keep them, at most 100; everyone reads them in the brand payload. */
class TemplateController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        $data = $request->validate(ContentRules::templateFields(true));
        if ($profile->templates()->count() >= ContentPlannerTemplate::MAX) {
            throw new ContentRefused('too_many_templates', 'A brand keeps at most ' . ContentPlannerTemplate::MAX . ' templates.', 422);
        }
        $template = $profile->templates()->create($data + ['brand_id' => $profile->brand_id, 'created_by' => $request->user()->id]);

        return response()->json(['template' => ContentTemplates::one($template), 'templates' => ContentTemplates::list($profile)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        $template = ContentTemplates::find($profile, $id);
        $template->fill($request->validate(ContentRules::templateFields(false)))->save();

        return response()->json(['template' => ContentTemplates::one($template->fresh()), 'templates' => ContentTemplates::list($profile)]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        ContentTemplates::find($profile, $id)->delete();

        return response()->json(['templates' => ContentTemplates::list($profile)]);
    }

    /** Templates the AI proposes for this brand (spec 2026-10-16 §5.2): suggestions only, nothing is saved. */
    public function suggest(Request $request, ContentAiGate $gate, ContentTemplateSuggester $suggester): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $gate->allow($request->attributes->get('workspace_org'));
        $profile = ContentContext::requireProfile();
        set_time_limit(120);
        try {
            $suggestions = $suggester->suggest($profile);
        } catch (ContentRefused $e) {
            throw $e;
        } catch (\Throwable $e) {
            report($e);
            // The provider's own words stay in the log.
            throw new ContentRefused('ai_failed', 'The AI could not finish this. Please try again.', 502);
        }

        return response()->json(['suggestions' => $suggestions]);
    }
}

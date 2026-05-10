<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\CustomField;
use App\Services\CustomFieldService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Admin endpoints for the per-org custom-fields schema. Powers the
 * Settings → Pipelines → Custom Fields editor. Field CRUD plus
 * preset application (Beauty / Medical).
 */
class CustomFieldController extends Controller
{
    public function __construct(protected CustomFieldService $svc) {}

    public function index(Request $request): JsonResponse
    {
        $query = CustomField::orderBy('entity')->orderBy('sort_order')->orderBy('id');

        if ($entity = $request->get('entity')) {
            $this->assertEntity($entity);
            $query->where('entity', $entity);
        }
        if ($request->boolean('active_only')) {
            $query->where('is_active', true);
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'entity'       => 'required|string|in:' . implode(',', CustomField::ENTITIES),
            'label'        => 'required|string|max:120',
            'type'         => 'required|string|in:' . implode(',', CustomField::TYPES),
            'config'       => 'nullable|array',
            'help_text'    => 'nullable|string|max:240',
            'required'     => 'nullable|boolean',
            'is_active'    => 'nullable|boolean',
            'show_in_list' => 'nullable|boolean',
        ]);

        $key = $this->svc->generateKey($data['entity'], $data['label']);
        $maxSort = (int) CustomField::where('entity', $data['entity'])->max('sort_order');

        $field = CustomField::create(array_merge($data, [
            'key'        => $key,
            'sort_order' => $maxSort + 1,
        ]));

        return response()->json($field, 201);
    }

    public function update(Request $request, CustomField $field): JsonResponse
    {
        $data = $request->validate([
            'label'        => 'sometimes|string|max:120',
            'config'       => 'sometimes|nullable|array',
            'help_text'    => 'sometimes|nullable|string|max:240',
            'required'     => 'sometimes|boolean',
            'is_active'    => 'sometimes|boolean',
            'show_in_list' => 'sometimes|boolean',
            // Type changes are intentionally NOT permitted here — flipping
            // a date column to a number would silently invalidate every
            // saved value. The migration path is "delete + recreate".
        ]);

        $field->fill($data)->save();
        return response()->json($field);
    }

    public function destroy(CustomField $field): JsonResponse
    {
        // Soft policy: deleting a field does NOT scrub the saved values
        // from entity rows — orphaned keys stay in custom_data so that
        // re-creating the same key resurrects the historical data. The
        // editor warns the admin about this.
        $field->delete();
        return response()->json(['success' => true]);
    }

    /**
     * POST /v1/admin/custom-fields/reorder — accept ordered ids per
     * entity. Body: { entity: 'inquiry', order: [3, 1, 5, 2] }.
     */
    public function reorder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'entity'  => 'required|string|in:' . implode(',', CustomField::ENTITIES),
            'order'   => 'required|array',
            'order.*' => 'integer',
        ]);

        DB::transaction(function () use ($data) {
            foreach ($data['order'] as $i => $id) {
                CustomField::where('entity', $data['entity'])
                    ->where('id', $id)
                    ->update(['sort_order' => $i]);
            }
        });

        return response()->json(['success' => true]);
    }

    /**
     * POST /v1/admin/custom-fields/apply-preset — seed a starter field
     * set (Beauty / Medical / etc). Idempotent — keys that already
     * exist are skipped, so re-applying doesn't create dupes.
     */
    public function applyPreset(Request $request): JsonResponse
    {
        $data = $request->validate([
            'preset' => 'required|string|in:' . implode(',', array_keys(CustomFieldService::PRESETS)),
        ]);

        $created = $this->svc->applyPreset($data['preset']);

        return response()->json([
            'success'        => true,
            'created_count'  => count($created),
            'fields'         => $created,
            'message'        => count($created) > 0
                ? count($created) . ' field' . (count($created) === 1 ? '' : 's') . ' added from the ' . $data['preset'] . ' preset.'
                : 'All fields from this preset already exist — nothing added.',
        ]);
    }

    /** Available presets — listed by the frontend picker. */
    public function presets(): JsonResponse
    {
        $list = [];
        foreach (CustomFieldService::PRESETS as $key => $defs) {
            $count = 0;
            foreach ($defs as $fields) $count += count($fields);
            $list[] = [
                'key'         => $key,
                'label'       => match ($key) {
                    'beauty'  => 'Beauty / Spa',
                    'medical' => 'Medical / Healthcare',
                    default   => ucfirst($key),
                },
                'description' => match ($key) {
                    'beauty'  => 'Skin type, allergies, preferred therapist, service preferences. Adds fields to Guests + Inquiries.',
                    'medical' => 'DOB, blood type, allergies, medications, insurance, emergency contact. Adds fields to Guests + Inquiries.',
                    default   => '',
                },
                'field_count' => $count,
            ];
        }
        return response()->json($list);
    }

    private function assertEntity(string $entity): void
    {
        if (!in_array($entity, CustomField::ENTITIES, true)) {
            abort(422, "Unknown entity '{$entity}'.");
        }
    }
}

<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\SavedView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * CRM Phase 3 — per-user saved views for the Sales Pipeline.
 *
 * Default scope is the current user's pinned views for the page they
 * pass in. Cross-user share is Phase 4+; today we deliberately do not
 * surface other people's views.
 */
class SavedViewController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $page = $request->get('page', 'inquiries');

        $views = SavedView::where('user_id', $request->user()->id)
            ->where('page', $page)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json($views);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'page'      => 'nullable|string|max:32',
            'name'      => 'required|string|max:80',
            'filters'   => 'required|array',
            'is_pinned' => 'nullable|boolean',
        ]);

        $maxSort = (int) SavedView::where('user_id', $request->user()->id)
            ->where('page', $data['page'] ?? 'inquiries')
            ->max('sort_order');

        $view = SavedView::create([
            'user_id'    => $request->user()->id,
            'page'       => $data['page'] ?? 'inquiries',
            'name'       => $data['name'],
            'filters'    => $data['filters'],
            'is_pinned'  => $data['is_pinned'] ?? true,
            'sort_order' => $maxSort + 1,
        ]);

        return response()->json($view, 201);
    }

    public function update(Request $request, SavedView $view): JsonResponse
    {
        $this->authorizeOwn($request, $view);

        $data = $request->validate([
            'name'      => 'sometimes|string|max:80',
            'filters'   => 'sometimes|array',
            'is_pinned' => 'sometimes|boolean',
        ]);

        $view->fill($data)->save();
        return response()->json($view);
    }

    public function destroy(Request $request, SavedView $view): JsonResponse
    {
        $this->authorizeOwn($request, $view);

        $view->delete();
        return response()->json(['success' => true]);
    }

    private function authorizeOwn(Request $request, SavedView $view): void
    {
        if ($view->user_id !== $request->user()->id) {
            abort(403, 'You can only modify your own saved views.');
        }
    }
}

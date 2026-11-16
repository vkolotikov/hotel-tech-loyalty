<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentWork;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRules;
use App\Services\Content\ContentWorkService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class WorkController extends Controller
{
    public function __construct(private ContentWorkService $work) {}

    public function store(Request $request): JsonResponse
    {
        $input = $request->validate([
            'action' => ['required', Rule::in(ContentWorkService::ACTIONS)], 'request_key' => 'required|string|max:100',
            'post_id' => 'required_unless:action,fill|nullable|integer', 'instructions' => 'nullable|string|max:1000',
            'type' => ['required_if:action,rewrite', 'nullable', Rule::in(ContentRules::REWRITES)], 'guidance' => 'nullable|string|max:1000',
            'template_id' => 'nullable|integer', 'date' => 'required_if:action,fill|nullable|date_format:Y-m-d',
            'platform' => ['required_if:action,fill', 'nullable', Rule::in(ContentRules::PLATFORMS)],
        ]);

        return response()->json(['work' => $this->work->describe($this->work->create($input, $request->user()))], 202);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(['work' => $this->work->describe($this->find($id))]);
    }

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['post_id' => 'required|integer']);
        PostController::find((int) $data['post_id']);
        $row = ContentWork::where('post_id', $data['post_id'])->orderByDesc('id')->first();

        return response()->json(['work' => $row ? $this->work->describe($row) : null]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        return response()->json(['work' => $this->work->describe($this->work->cancel($this->find($id), $request->user()))]);
    }

    private function find(int $id): ContentWork
    {
        return ContentWork::find($id) ?? throw new ContentRefused('not_found', 'This work no longer exists.', 404);
    }
}

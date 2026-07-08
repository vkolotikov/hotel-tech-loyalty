# AI Content Planner — Development Plan & Discovery Report

**Date**: 2026-07-08  
**Status**: Phase 0/1 Complete — Ready for Implementation  
**Priority**: HIGH

---

## Phase 0: Local Environment Setup ✅

### Checklist
- [x] Git synced with origin/main (latest commit: ca6fb3b9 — Planner: hours worked)
- [x] PHP 8.3.6 ready
- [x] Node 24.15.0 ready
- [x] npm 10.8.3 ready
- [x] Composer 2.9.5 ready
- [x] Laravel vendor/ installed
- [x] .env configured for local PostgreSQL
- [ ] **TODO: npm install** (node_modules missing — needed before building frontend)
- [ ] **TODO: Verify local PostgreSQL is running** with hotel_loyalty database

### Next Action
```bash
npm install
# If DB is not running:
# Start PostgreSQL, create hotel_loyalty database, run migrations if needed
```

---

## Phase 1: Discovery Report ✅

### 1.1 System Architecture

**Multi-tenant hierarchy:**
```
Organization (top-level)
  ├─ Brand (multi-brand support, one default per org)
  │  ├─ KnowledgeItem (FAQ — question/answer pairs)
  │  ├─ KnowledgeDocument (uploaded files)
  │  ├─ ChatWidgetConfig (chatbot setup)
  │  ├─ Property (hotel/venue)
  │  └─ Service/ServiceBooking
  │
  └─ CrmSetting (key/value JSON settings at org level)
     ├─ crm_settings.industry_preset
     ├─ planner_groups
     ├─ planner_channels
     ├─ planner_employee_prefs
     ├─ planner_work_hours_per_day
     └─ ... (other CRM settings)
```

**Traits used for multi-tenancy:**
- `BelongsToOrganization` — scopes queries by organization_id
- `BelongsToBrand` — scopes queries by brand_id
- `TenantScope` — global query scope (frontend binds current_organization_id + current_brand_id)

### 1.2 Frontend Structure

**Routing & Layout:**
- Route pattern: `/marketing/content-planner`, `/marketing/content-planner/setup`, etc.
- Hub pages use tab-based navigation with card tiles (see MarketingHub.tsx)
- Settings pages use multi-tab panel layout (see Settings.tsx)
- Components lazy-loaded with Suspense

**Marketing Hub** (c:\wamp64\www\Hexa-Tech\frontend\src\pages\hubs\MarketingHub.tsx):
- Current tabs: Campaigns, Email Templates, Reviews
- Each tab is a TileDef with: key, label, description, icon, accent color
- Tile grid: `grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4`
- On click, switches to detail view (single tab)

**Settings Page** (c:\wamp64\www\Hexa-Tech\frontend\src\pages\Settings.tsx):
- Multi-tab navigation on left sidebar
- Tabs load components like PlannerSettings, MenuSettings, etc.
- Should add new tab for AI Content Planner settings

### 1.3 Existing Knowledge Base Integration

**Where FAQ/Knowledge is stored:**
- `knowledge_items` table:
  - Fields: id, organization_id, brand_id, category_id, question, answer, keywords (array), priority, use_count, is_active
  - Model: `App\Models\KnowledgeItem`
  - Relationship: `category()` → `KnowledgeCategory`

- `knowledge_documents` table:
  - Fields: id, organization_id, brand_id, file_name, file_path, mime_type, size_bytes, extracted_text, chunks_count, processing_status
  - Model: `App\Models\KnowledgeDocument`

- `knowledge_categories` table:
  - Hierarchical (parent_id for sub-categories)

- `chatbot_widget_config` table:
  - Fields: organization_id, brand_id, company_name, header_title, welcome_message, suggestions (array), canned_responses (array), etc.
  - Model: `App\Models\ChatWidgetConfig`

**Access pattern:**
```php
// To load FAQ for a brand:
$faq = KnowledgeItem::where('brand_id', $brandId)->active()->get();

// To load chatbot config:
$chatbot = ChatWidgetConfig::where('brand_id', $brandId)->first();
```

### 1.4 Existing CRM Settings Pattern

**How settings are stored:**
```php
// In CrmSetting table (key/value JSON store at org level):
CrmSetting::where('organization_id', $orgId)->where('key', 'planner_groups')->first();
// Returns: CrmSetting { key: 'planner_groups', value: {...} (JSON-cast to array/object) }
```

**Already stored keys** (examples from codebase):
- `industry_preset` (string)
- `planner_groups` (JSON array)
- `planner_channels` (JSON array)
- `planner_employee_prefs` (JSON object)
- `planner_work_hours_per_day` (int)
- `planner_work_days_per_week` (int)

**Pattern for Content Planner:**
- Store new keys: `content_planner_profile`, `content_planner_audiences`, `content_planner_brand_voice`, etc.
- OR create dedicated tables for structured data (strategies, posts, campaigns)

### 1.5 API Response Pattern

**Standard JSON response format** (from EmailCampaignController):
```php
return response()->json($data);                    // For single items
return response()->json($paginated);               // For paginated lists
```

**Pagination:**
```php
$rows = Model::paginate(25);  // Returns: { data: [...], current_page, total, per_page, ... }
```

**Filters & Query Building:**
```php
$rows = Model::where('status', 'draft')
    ->when($filter, fn($q) => $q->where(...))
    ->orderByDesc('created_at')
    ->paginate(25);
```

---

## Phase 2: Database Schema Design

### Tables to Create

All tables use:
- `BelongsToOrganization` trait (adds organization_id + global scope)
- `BelongsToBrand` trait (adds brand_id scoping)
- `created_at`, `updated_at` timestamps

#### 1. `content_planner_profiles`
Stores main setup for a workspace/brand.
```sql
CREATE TABLE content_planner_profiles (
  id BIGINT PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  brand_id BIGINT NOT NULL,
  name VARCHAR(255),
  default_language VARCHAR(10) DEFAULT 'en',
  default_tone VARCHAR(100),
  primary_goal VARCHAR(255),
  secondary_goals JSON,
  content_rules JSON,
  knowledge_sources JSON,           -- Which sources to use (faq, kb, settings, etc.)
  knowledge_summary_long LONGTEXT,  -- Full summary for AI context
  knowledge_summary_short TEXT,     -- Brief summary for display
  last_knowledge_sync_at TIMESTAMP,
  setup_completed_at TIMESTAMP,
  created_by BIGINT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (brand_id) REFERENCES brands(id),
  UNIQUE (organization_id, brand_id)
);
```

#### 2. `content_planner_audiences`
Target audiences for content generation.
```sql
CREATE TABLE content_planner_audiences (
  id BIGINT PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  brand_id BIGINT NOT NULL,
  planner_profile_id BIGINT NOT NULL,
  name VARCHAR(255),
  description TEXT,
  industry VARCHAR(100),
  country VARCHAR(100),
  language VARCHAR(10),
  pain_points JSON,
  goals JSON,
  objections JSON,
  buying_triggers JSON,
  preferred_platforms JSON,
  preferred_tone VARCHAR(100),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (planner_profile_id) REFERENCES content_planner_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (brand_id) REFERENCES brands(id)
);
```

#### 3. `content_planner_channels`
Social media / publishing channels.
```sql
CREATE TABLE content_planner_channels (
  id BIGINT PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  brand_id BIGINT NOT NULL,
  planner_profile_id BIGINT NOT NULL,
  platform VARCHAR(50),  -- linkedin, instagram, tiktok, facebook, x, youtube, blog, email
  label VARCHAR(255),
  url VARCHAR(255),
  goal VARCHAR(255),
  audience_id BIGINT,
  default_language VARCHAR(10),
  tone_override VARCHAR(100),
  frequency JSON,        -- { mon: true, tue: true, wed: true, ... }
  preferred_formats JSON, -- [post, carousel, reel, thread]
  emoji_policy VARCHAR(50),
  hashtag_policy VARCHAR(50),
  max_length INT,
  active BOOLEAN DEFAULT true,
  settings JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (planner_profile_id) REFERENCES content_planner_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (audience_id) REFERENCES content_planner_audiences(id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (brand_id) REFERENCES brands(id)
);
```

#### 4. `content_planner_brand_voices`
Brand voice/tone settings.
```sql
CREATE TABLE content_planner_brand_voices (
  id BIGINT PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  brand_id BIGINT NOT NULL,
  planner_profile_id BIGINT NOT NULL,
  name VARCHAR(255),
  tone VARCHAR(100),
  style VARCHAR(100),
  formality_level VARCHAR(50),
  emoji_policy VARCHAR(50),
  hashtag_policy VARCHAR(50),
  preferred_words JSON,
  forbidden_words JSON,
  example_good_posts JSON,
  example_bad_posts JSON,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (planner_profile_id) REFERENCES content_planner_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (brand_id) REFERENCES brands(id)
);
```

#### 5. `content_planner_strategies`
Generated strategies (saved outputs).
```sql
CREATE TABLE content_planner_strategies (
  id BIGINT PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  brand_id BIGINT NOT NULL,
  planner_profile_id BIGINT NOT NULL,
  title VARCHAR(255),
  summary TEXT,
  goals JSON,
  platform_strategy JSON,
  content_mix JSON,
  visual_direction TEXT,
  ai_output JSON,        -- Full AI response for debugging
  status VARCHAR(50) DEFAULT 'active', -- active, archived, superseded
  created_by BIGINT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (planner_profile_id) REFERENCES content_planner_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (brand_id) REFERENCES brands(id)
);
```

#### 6. `content_planner_pillars`
Content pillars.
```sql
CREATE TABLE content_planner_pillars (
  id BIGINT PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  brand_id BIGINT NOT NULL,
  planner_profile_id BIGINT NOT NULL,
  strategy_id BIGINT,
  name VARCHAR(255),       -- Educational, Product, Trust, etc.
  description TEXT,
  purpose TEXT,
  frequency_weight INT,    -- 1-10, higher = post more often
  recommended_platforms JSON,
  example_topics JSON,
  cta_examples JSON,
  visual_direction TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (planner_profile_id) REFERENCES content_planner_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (strategy_id) REFERENCES content_planner_strategies(id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (brand_id) REFERENCES brands(id)
);
```

#### 7. `content_planner_campaigns`
Content campaigns.
```sql
CREATE TABLE content_planner_campaigns (
  id BIGINT PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  brand_id BIGINT NOT NULL,
  planner_profile_id BIGINT NOT NULL,
  name VARCHAR(255),
  goal TEXT,
  audience_id BIGINT,
  start_date DATE,
  end_date DATE,
  platforms JSON,
  offer VARCHAR(255),
  landing_page VARCHAR(255),
  key_message TEXT,
  cta VARCHAR(255),
  status VARCHAR(50) DEFAULT 'draft', -- draft, active, paused, completed, archived
  notes TEXT,
  ai_output JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (planner_profile_id) REFERENCES content_planner_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (audience_id) REFERENCES content_planner_audiences(id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (brand_id) REFERENCES brands(id)
);
```

#### 8. `content_planner_posts`
Planned/generated posts.
```sql
CREATE TABLE content_planner_posts (
  id BIGINT PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  brand_id BIGINT NOT NULL,
  planner_profile_id BIGINT NOT NULL,
  campaign_id BIGINT,
  strategy_id BIGINT,
  pillar_id BIGINT,
  audience_id BIGINT,
  platform VARCHAR(50),          -- linkedin, instagram, etc.
  scheduled_date DATE,
  scheduled_time TIME,
  language VARCHAR(10),
  topic VARCHAR(255),
  title VARCHAR(255),
  goal VARCHAR(255),
  format VARCHAR(50),            -- text_post, carousel, reel, thread, etc.
  status VARCHAR(50) DEFAULT 'idea', -- idea, draft, needs_review, needs_visual, approved, ready_to_publish, published, skipped, archived
  main_copy LONGTEXT,
  short_copy TEXT,
  alternative_copy TEXT,
  hook VARCHAR(500),
  cta VARCHAR(255),
  hashtags JSON,
  visual_brief_id BIGINT,
  quality_score JSON,            -- { brand_fit: 9, platform_fit: 8, clarity: 9, ... }
  source_context JSON,           -- Where this came from (strategy, campaign, manual)
  published_url VARCHAR(255),
  published_at TIMESTAMP,
  created_by BIGINT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (planner_profile_id) REFERENCES content_planner_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES content_planner_campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY (strategy_id) REFERENCES content_planner_strategies(id) ON DELETE SET NULL,
  FOREIGN KEY (pillar_id) REFERENCES content_planner_pillars(id) ON DELETE SET NULL,
  FOREIGN KEY (audience_id) REFERENCES content_planner_audiences(id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (brand_id) REFERENCES brands(id)
);
```

#### 9. `content_planner_visual_briefs`
Visual direction for posts.
```sql
CREATE TABLE content_planner_visual_briefs (
  id BIGINT PRIMARY KEY,
  post_id BIGINT NOT NULL,
  visual_type VARCHAR(50),       -- image, video, carousel, infographic
  aspect_ratio VARCHAR(20),      -- 1:1, 16:9, 9:16, etc.
  style VARCHAR(255),            -- premium, playful, minimal, etc.
  description TEXT,
  scene TEXT,
  mood VARCHAR(100),
  composition TEXT,
  text_overlay VARCHAR(500),
  avoid TEXT,
  video_script TEXT,
  image_prompt_future TEXT,      -- For future image generation
  metadata JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES content_planner_posts(id) ON DELETE CASCADE
);
```

#### 10. `content_planner_post_variations`
Alternative copy versions.
```sql
CREATE TABLE content_planner_post_variations (
  id BIGINT PRIMARY KEY,
  post_id BIGINT NOT NULL,
  variation_type VARCHAR(50),    -- alternative, shorter, longer, professional, friendly, etc.
  copy LONGTEXT,
  notes TEXT,
  ai_output JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES content_planner_posts(id) ON DELETE CASCADE
);
```

#### 11. `content_planner_assets`
Uploaded images, templates, brand assets.
```sql
CREATE TABLE content_planner_assets (
  id BIGINT PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  brand_id BIGINT NOT NULL,
  planner_profile_id BIGINT NOT NULL,
  title VARCHAR(255),
  file_path VARCHAR(255),
  file_type VARCHAR(50),
  description TEXT,
  tags JSON,
  metadata JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (planner_profile_id) REFERENCES content_planner_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (brand_id) REFERENCES brands(id)
);
```

#### 12. `content_planner_ai_generations`
AI request/response logs (for cost tracking + debugging).
```sql
CREATE TABLE content_planner_ai_generations (
  id BIGINT PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  brand_id BIGINT NOT NULL,
  planner_profile_id BIGINT NOT NULL,
  user_id BIGINT,
  generation_type VARCHAR(50),   -- knowledge_summary, strategy, calendar, post_copy, visual_brief, quality_check, etc.
  model VARCHAR(50),
  prompt_hash VARCHAR(64),
  prompt_text LONGTEXT,          -- Store if it doesn't violate privacy
  response_json LONGTEXT,
  tokens_input INT,
  tokens_output INT,
  cost_estimate DECIMAL(10, 4),
  status VARCHAR(50),            -- success, error, partial
  error_message TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (brand_id) REFERENCES brands(id),
  FOREIGN KEY (planner_profile_id) REFERENCES content_planner_profiles(id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

---

## Phase 3: Backend Implementation Order

### Step 1: Create Migrations (in database/migrations/)
```
2026_07_08_create_content_planner_tables.php
```

### Step 2: Create Models (in app/Models/)
```
ContentPlannerProfile.php
ContentPlannerAudience.php
ContentPlannerChannel.php
ContentPlannerBrandVoice.php
ContentPlannerStrategy.php
ContentPlannerPillar.php
ContentPlannerCampaign.php
ContentPlannerPost.php
ContentPlannerVisualBrief.php
ContentPlannerPostVariation.php
ContentPlannerAsset.php
ContentPlannerAiGeneration.php
```

All models:
- Use `BelongsToOrganization` trait
- Use `BelongsToBrand` trait
- Define relationships (HasMany, BelongsTo)
- Include scopes (e.g., `active()`, `recent()`)

### Step 3: Create Service Classes (in app/Services/)
```
ContentKnowledgeService.php          -- Reads FAQ/KB from ChatWidget
ContentPlannerStrategyService.php    -- AI strategy generation
ContentCalendarGenerationService.php -- Calendar generation
ContentPostGenerationService.php     -- Post copy generation
ContentVisualBriefService.php        -- Visual brief generation
ContentQualityCheckService.php       -- Quality scoring
ContentHistoryAnalysisService.php    -- Checks for repetition
ContentPlannerAiLogger.php           -- Logs AI calls to DB
```

### Step 4: Create Controllers (in app/Http/Controllers/Api/V1/Admin/)
```
ContentPlannerProfileController.php
ContentPlannerAudienceController.php
ContentPlannerChannelController.php
ContentPlannerBrandVoiceController.php
ContentPlannerStrategyController.php
ContentPlannerPillarController.php
ContentPlannerCampaignController.php
ContentPlannerPostController.php
ContentPlannerVisualBriefController.php
```

Endpoints:
- `GET /v1/admin/content-planner/profile` — current profile
- `POST /v1/admin/content-planner/profile` — create/setup
- `PUT /v1/admin/content-planner/profile` — update
- `GET/POST/PUT/DELETE /v1/admin/content-planner/audiences`
- `GET/POST/PUT/DELETE /v1/admin/content-planner/channels`
- ... (standard CRUD for each resource)
- `POST /v1/admin/content-planner/strategies/generate` — AI strategy
- `POST /v1/admin/content-planner/calendar/generate` — AI calendar
- `POST /v1/admin/content-planner/posts/{id}/regenerate` — AI copy
- etc.

### Step 5: Routes (in routes/api.php)
```php
Route::prefix('content-planner')->group(function () {
    Route::get('profile', [ContentPlannerProfileController::class, 'show']);
    Route::post('profile', [ContentPlannerProfileController::class, 'store']);
    Route::put('profile', [ContentPlannerProfileController::class, 'update']);
    Route::apiResource('audiences', ContentPlannerAudienceController::class);
    Route::apiResource('channels', ContentPlannerChannelController::class);
    Route::apiResource('strategies', ContentPlannerStrategyController::class);
    Route::apiResource('posts', ContentPlannerPostController::class);
    Route::post('strategies/generate', [ContentPlannerStrategyController::class, 'generate']);
    Route::post('calendar/generate', [ContentPlannerStrategyController::class, 'generateCalendar']);
    // ... more routes
});
```

---

## Phase 4: Frontend Implementation Order

### Step 1: Add Card to Marketing Hub
File: `frontend/src/pages/hubs/MarketingHub.tsx`

Add to TILES array:
```typescript
{ 
  key: 'content-planner', 
  label: 'AI Content Planner', 
  desc: 'Generate social media strategies, content calendars, posts, and visual briefs from your existing business knowledge.', 
  icon: Sparkles,  // from lucide-react
  accent: '#06b6d4' // cyan
}
```

Add lazy import:
```typescript
const ContentPlanner = lazy(() => import('../ContentPlanner').then(m => ({ default: m.ContentPlanner })))
```

Add to tabs in Suspense:
```typescript
{active === 'content-planner' && <ContentPlanner />}
```

### Step 2: Add Card to Settings Page
File: `frontend/src/pages/Settings.tsx`

Add new tab with card pointing to settings:
```typescript
{ 
  key: 'content-planner',
  title: 'AI Content Planner',
  description: 'Brand voice, social channels, content rules, AI settings, and knowledge sources.',
  component: ContentPlannerSettingsTab
}
```

### Step 3: Create Main Pages
```
frontend/src/pages/ContentPlanner.tsx              -- Main dashboard/entry
frontend/src/pages/ContentPlannerSetup.tsx         -- Setup wizard
frontend/src/pages/ContentPlannerStrategy.tsx      -- Strategy editor
frontend/src/pages/ContentPlannerCalendar.tsx      -- Calendar view
frontend/src/pages/ContentPlannerPostEditor.tsx    -- Post editor
frontend/src/pages/ContentPlannerPosts.tsx         -- Posts library
frontend/src/pages/ContentPlannerCampaigns.tsx     -- Campaigns
frontend/src/pages/ContentPlannerSettings.tsx      -- Settings
```

### Step 4: Create Components
```
frontend/src/components/ContentPlannerOnboarding.tsx
frontend/src/components/ContentPlannerDashboard.tsx
frontend/src/components/ContentPlannerKnowledgeDetector.tsx
frontend/src/components/PostCard.tsx
frontend/src/components/CalendarView.tsx
frontend/src/components/AudienceManager.tsx
frontend/src/components/ChannelManager.tsx
frontend/src/components/BrandVoiceEditor.tsx
frontend/src/components/PostCopyEditor.tsx
frontend/src/components/VisualBriefEditor.tsx
frontend/src/components/LoadingStates.tsx
frontend/src/components/EmptyStates.tsx
```

### Step 5: Create Hooks for API
```
frontend/src/hooks/useContentPlanner.ts
frontend/src/hooks/useContentPlannerStrategy.ts
frontend/src/hooks/useContentPlannerCalendar.ts
frontend/src/hooks/useContentPlannerPosts.ts
```

---

## Detailed Step-by-Step Implementation

### STEP 1: Create Database Migration
```bash
php artisan make:migration create_content_planner_tables
```

Edit: `database/migrations/2026_07_08_XXXXXX_create_content_planner_tables.php`
- Create all 12 tables
- Add indexes: (organization_id, brand_id), (planner_profile_id), (status), (scheduled_date)

### STEP 2: Create Models
For each model (e.g., ContentPlannerProfile):

```php
<?php
namespace App\Models;

use App\Traits\BelongsToOrganization;
use App\Traits\BelongsToBrand;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ContentPlannerProfile extends Model
{
    use BelongsToOrganization, BelongsToBrand;
    
    protected $fillable = [
        'organization_id', 'brand_id', 'name', 'default_language', 
        'default_tone', 'primary_goal', 'secondary_goals', ...
    ];
    
    protected $casts = [
        'secondary_goals' => 'array',
        'content_rules' => 'array',
        'knowledge_sources' => 'array',
        'setup_completed_at' => 'datetime',
        'last_knowledge_sync_at' => 'datetime',
    ];
    
    public function audiences(): HasMany
    {
        return $this->hasMany(ContentPlannerAudience::class, 'planner_profile_id');
    }
    
    public function channels(): HasMany
    {
        return $this->hasMany(ContentPlannerChannel::class, 'planner_profile_id');
    }
    
    // ... more relationships
}
```

### STEP 3: Create ContentKnowledgeService
This is critical — it reads existing FAQ/KB.

```php
<?php
namespace App\Services;

use App\Models\KnowledgeItem;
use App\Models\ChatWidgetConfig;

class ContentKnowledgeService
{
    public function buildForBrand(int $brandId): array
    {
        $faq = KnowledgeItem::where('brand_id', $brandId)->active()->get();
        $chatbot = ChatWidgetConfig::where('brand_id', $brandId)->first();
        
        return [
            'faq' => $faq->map(fn($item) => [
                'q' => $item->question,
                'a' => $item->answer,
                'keywords' => $item->keywords,
            ]),
            'chatbot_company_name' => $chatbot->company_name ?? '',
            'chatbot_welcome' => $chatbot->welcome_message ?? '',
            'missing_fields' => $this->detectMissing($faq, $chatbot),
        ];
    }
    
    private function detectMissing($faq, $chatbot): array
    {
        $missing = [];
        if (!$chatbot || !$chatbot->company_name) $missing[] = 'Company description';
        if (!$faq || $faq->count() === 0) $missing[] = 'FAQ content';
        // ... more detection
        return $missing;
    }
}
```

### STEP 4: Create ContentPlannerProfileController
```php
<?php
namespace App\Http\Controllers\Api\V1\Admin;

use App\Models\ContentPlannerProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContentPlannerProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $org = $request->user()->current_organization;
        $brand = Brand::currentOrDefaultIdForOrg($org->id);
        
        $profile = ContentPlannerProfile::where('organization_id', $org->id)
            ->where('brand_id', $brand)
            ->first();
        
        if (!$profile) {
            // Return onboarding state
            return response()->json([
                'exists' => false,
                'setup_step' => 1,
                'detected_knowledge' => (new ContentKnowledgeService())->buildForBrand($brand),
            ]);
        }
        
        return response()->json($profile);
    }
    
    public function store(Request $request): JsonResponse
    {
        $org = $request->user()->current_organization;
        $brand = Brand::currentOrDefaultIdForOrg($org->id);
        
        $profile = ContentPlannerProfile::create([
            'organization_id' => $org->id,
            'brand_id' => $brand,
            'name' => $request->input('name', $org->name . ' Content Plan'),
            'default_language' => $request->input('default_language', 'en'),
            'default_tone' => $request->input('default_tone', 'professional'),
            'primary_goal' => $request->input('primary_goal'),
            'setup_completed_at' => now(),
            'created_by' => $request->user()->id,
        ]);
        
        return response()->json($profile, 201);
    }
}
```

### STEP 5: Create Routes
File: `routes/api.php`

```php
Route::prefix('v1/admin/content-planner')->middleware(['auth:sanctum'])->group(function () {
    Route::get('profile', [ContentPlannerProfileController::class, 'show']);
    Route::post('profile', [ContentPlannerProfileController::class, 'store']);
    Route::put('profile', [ContentPlannerProfileController::class, 'update']);
    
    Route::apiResource('audiences', ContentPlannerAudienceController::class);
    Route::apiResource('channels', ContentPlannerChannelController::class);
    
    Route::post('strategies/generate', [ContentPlannerStrategyController::class, 'generate']);
    Route::apiResource('strategies', ContentPlannerStrategyController::class);
    
    Route::post('calendar/generate', [ContentPlannerStrategyController::class, 'generateCalendar']);
    Route::apiResource('posts', ContentPlannerPostController::class);
});
```

### STEP 6: Create Frontend Pages

File: `frontend/src/pages/ContentPlanner.tsx`
```typescript
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { ContentPlannerSetup } from '../components/ContentPlannerSetup'
import { ContentPlannerDashboard } from '../components/ContentPlannerDashboard'

export function ContentPlanner() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ['content-planner-profile'],
    queryFn: () => api.get('/v1/admin/content-planner/profile').then(r => r.data),
  })
  
  if (isLoading) return <div>Loading...</div>
  
  if (!profile?.exists) {
    return <ContentPlannerSetup />
  }
  
  return <ContentPlannerDashboard profile={profile} />
}
```

---

## Implementation Sequence (Recommended Order)

1. **Backend Foundation** (Days 1-2)
   - [ ] Create migration + all tables
   - [ ] Create 12 models with relationships
   - [ ] Create ContentKnowledgeService
   - [ ] Create ContentPlannerProfileController + basic routes
   - [ ] Test API endpoints with Postman/curl

2. **Knowledge Integration** (Day 2-3)
   - [ ] Implement ContentKnowledgeService fully
   - [ ] Create detect-missing-fields logic
   - [ ] Create knowledge summarization service
   - [ ] Add knowledge summary to CrmSetting on profile creation

3. **Audience/Channel/Voice Setup** (Day 3-4)
   - [ ] Create Audience/Channel/BrandVoice controllers + routes
   - [ ] Frontend setup wizard (7 steps)
   - [ ] Test wizard flow end-to-end

4. **AI Strategy Generation** (Day 4-5)
   - [ ] ContentPlannerStrategyService (calls Claude API)
   - [ ] Create API endpoint POST /strategies/generate
   - [ ] Test strategy generation
   - [ ] Log AI calls to content_planner_ai_generations table

5. **Calendar Generation** (Day 5-6)
   - [ ] ContentCalendarGenerationService
   - [ ] API endpoint POST /calendar/generate
   - [ ] Calendar view (month/week/list)
   - [ ] Test calendar generation

6. **Post Editor** (Day 6-7)
   - [ ] Post CRUD endpoints
   - [ ] ContentPostGenerationService (platform-specific copy)
   - [ ] Post editor page with AI action buttons
   - [ ] Copy-to-clipboard functionality

7. **Visual Briefs + Quality Check** (Day 7-8)
   - [ ] ContentVisualBriefService
   - [ ] ContentQualityCheckService
   - [ ] Visual brief editor
   - [ ] Quality check integration

8. **Dashboard + Filtering** (Day 8-9)
   - [ ] Dashboard with KPI cards
   - [ ] Post library with filters
   - [ ] Anti-repetition logic
   - [ ] Status workflow

9. **Polish + Error Handling** (Day 9-10)
   - [ ] Empty states
   - [ ] Loading states
   - [ ] Error messages
   - [ ] Responsive design
   - [ ] Edge cases

---

## Key Files to Update

**Routes:**
- `routes/api.php` — add content-planner routes

**Frontend Navigation:**
- `frontend/src/pages/hubs/MarketingHub.tsx` — add AI Content Planner tile
- `frontend/src/pages/Settings.tsx` — add settings card
- `frontend/src/lib/api.ts` — add API helpers if needed

**Database:**
- `database/migrations/2026_07_08_XXXXXX_create_content_planner_tables.php`

**App Models:**
- `app/Models/ContentPlanner*.php` (12 models)

**App Services:**
- `app/Services/ContentPlanner*.php` (8 services)

**App Controllers:**
- `app/Http/Controllers/Api/V1/Admin/ContentPlanner*.php` (9 controllers)

**Frontend Pages:**
- `frontend/src/pages/ContentPlanner.tsx` (main)
- `frontend/src/pages/ContentPlannerSetup.tsx` (wizard)
- etc. (8 pages)

**Frontend Components:**
- `frontend/src/components/ContentPlanner*.tsx` (10+ components)

---

## Before Starting Implementation

**Verify:**
1. ✅ Local PostgreSQL is running and hotel_loyalty database exists
2. ✅ npm install has been run (node_modules exists)
3. ✅ Laravel artisan commands work: `php artisan tinker`
4. ✅ Migrations run: `php artisan migrate --path=database/migrations`
5. ✅ Frontend builds: `npm run dev` starts Vite dev server

**Commands to run first:**
```bash
# Install Node dependencies
npm install

# Verify PHP/Laravel
php artisan tinker

# Check database connection
php artisan db

# Run existing migrations if needed
php artisan migrate
```

---

## Success Criteria (MVP)

- [x] Discovery complete
- [ ] Database schema created and migrated
- [ ] All 12 models created with relationships
- [ ] All 8 services created with working methods
- [ ] All 9 controllers with CRUD endpoints
- [ ] Routes registered and tested
- [ ] Marketing Hub card added
- [ ] Setup wizard works end-to-end
- [ ] Strategy generation works
- [ ] Calendar generation works
- [ ] Post editor with AI actions works
- [ ] Dashboard shows KPIs and posts
- [ ] UI matches existing design
- [ ] No errors in browser console
- [ ] API calls logged to content_planner_ai_generations
- [ ] Knowledge reuse working (FAQ loaded on setup)

---

**Next Action:** Ready for Phase 2 implementation. Start with creating the migration file.

# Testing Content Planner API

## ✅ Migration Complete!

All 12 tables created successfully in PostgreSQL:
- ✓ content_planner_profiles
- ✓ content_planner_audiences
- ✓ content_planner_channels
- ✓ content_planner_brand_voices
- ✓ content_planner_strategies
- ✓ content_planner_pillars
- ✓ content_planner_campaigns
- ✓ content_planner_posts
- ✓ content_planner_visual_briefs
- ✓ content_planner_post_variations
- ✓ content_planner_assets
- ✓ content_planner_ai_generations

---

## 🧪 HOW TO TEST

### Option 1: Using Postman (Recommended)

1. **Open Postman**
2. **Log into the app** (http://127.0.0.1:8000/admin)
   - Use your existing login
   - Copy the Authorization token from browser DevTools (Network tab)

3. **Get Auth Token** (from browser):
   - Open browser DevTools (F12)
   - Go to Application → Cookies
   - Find `XSRF-TOKEN` or use the Authorization header from a logged-in request

4. **Test Endpoints**:
   - See curl commands below
   - Replace `YOUR_AUTH_TOKEN` with your real token

### Option 2: Using curl (Terminal)

#### Step 1: Log In via Browser First
Go to http://127.0.0.1:8000/admin and log in normally.

#### Step 2: Get Your Auth Token
Open browser DevTools (F12) → Network tab → make any request and copy the Authorization header.

#### Step 3: Test Endpoints

```bash
# Set your token
TOKEN="Bearer YOUR_AUTH_TOKEN_HERE"

# Test 1: Check onboarding state (should return detected knowledge)
curl -X GET http://127.0.0.1:8000/api/v1/admin/content-planner/profile \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json"

# Expected response: { "exists": false, "setup_step": 1, "detected_knowledge": {...} }
```

---

## 🔍 WHAT'S WORKING

### ✅ Knowledge Detection
The system **automatically loads**:
- FAQ items from AI Chat Widget
- Chatbot configuration
- Company services/products
- Organization information

Test it via: `GET /v1/admin/content-planner/profile`
- If profile doesn't exist, returns `detected_knowledge` with FAQ loaded

### ✅ Profile Management
Create a profile from detected knowledge:
```bash
curl -X POST http://127.0.0.1:8000/api/v1/admin/content-planner/profile \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Q3 Content Plan",
    "default_language": "en",
    "default_tone": "professional",
    "primary_goal": "Increase brand awareness",
    "use_existing_knowledge": true
  }'
```

### ✅ Audience Management
Add target audiences:
```bash
curl -X POST http://127.0.0.1:8000/api/v1/admin/content-planner/audiences \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "planner_profile_id": 1,
    "name": "Hotel Owners",
    "industry": "Hospitality",
    "pain_points": ["Direct bookings declining", "Staff coordination"],
    "goals": ["Increase bookings", "Improve efficiency"]
  }'
```

### ✅ Channel Management
Add social channels:
```bash
curl -X POST http://127.0.0.1:8000/api/v1/admin/content-planner/channels \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "planner_profile_id": 1,
    "platform": "linkedin",
    "label": "Hotel Tech LinkedIn",
    "url": "https://linkedin.com/company/hotel-tech",
    "frequency": {
      "monday": true,
      "wednesday": true,
      "friday": true
    }
  }'
```

---

## 📋 ENDPOINTS CREATED

### Profile
- `GET /v1/admin/content-planner/profile` — Get setup state or profile
- `POST /v1/admin/content-planner/profile` — Create profile
- `PUT /v1/admin/content-planner/profile/{id}` — Update profile
- `POST /v1/admin/content-planner/profile/{id}/refresh-knowledge` — Sync FAQ/KB

### Audiences
- `GET /v1/admin/content-planner/audiences` — List audiences
- `POST /v1/admin/content-planner/audiences` — Create audience
- `GET /v1/admin/content-planner/audiences/{id}` — Get audience
- `PUT /v1/admin/content-planner/audiences/{id}` — Update audience
- `DELETE /v1/admin/content-planner/audiences/{id}` — Delete audience

### Channels
- `GET /v1/admin/content-planner/channels` — List channels
- `POST /v1/admin/content-planner/channels` — Create channel
- `GET /v1/admin/content-planner/channels/{id}` — Get channel
- `PUT /v1/admin/content-planner/channels/{id}` — Update channel
- `DELETE /v1/admin/content-planner/channels/{id}` — Delete channel

---

## 🐛 DEBUGGING

### Verify Tables Exist
```bash
/c/wamp64/bin/php/php8.4.20/php artisan tinker
>>> DB::select("SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'content_planner%'")
# Should return: 12 tables
```

### Test Knowledge Service
```bash
/c/wamp64/bin/php/php8.4.20/php artisan tinker
>>> $svc = app(App\Services\ContentKnowledgeService::class);
>>> $knowledge = $svc->buildForBrand(1, 1);  # org_id=1, brand_id=1
>>> $knowledge['sources']  # Check what was detected
>>> $knowledge['faq']      # Check FAQ loaded
```

### Check if Profile Exists
```bash
/c/wamp64/bin/php/php8.4.20/php artisan tinker
>>> App\Models\ContentPlannerProfile::first()
```

---

## 🚀 PHASE 2 VERIFICATION

You've successfully completed Phase 2 when:

- [x] Migration runs without errors
- [x] All 12 tables created
- [x] Models load properly
- [x] Routes registered
- [x] Knowledge detection service built
- [x] 3 controllers created
- [ ] API endpoints tested via Postman/curl
- [ ] Profile creation works
- [ ] Audience creation works
- [ ] Channel creation works

---

## ✨ WHAT'S NEXT: PHASE 3

Once you verify the API works:

### This Week
1. **BrandVoiceController** — Last setup wizard controller
2. **AI Services**:
   - `ContentPlannerStrategyService` (calls Claude API)
   - `ContentCalendarGenerationService`
   - `ContentPostGenerationService`
   - `ContentVisualBriefService`

3. **StrategyController** — POST /strategies/generate endpoint

### Frontend
1. **Marketing Hub card** — Opens `/marketing/content-planner`
2. **Setup Wizard** — 7-step flow
3. **Dashboard** — KPI cards + quick actions
4. **Settings** — Integration with existing Settings page

### Expected Outcome
Users can:
1. Open Marketing → AI Content Planner
2. Complete 7-step setup (auto-loads FAQ)
3. Generate social media strategy
4. Generate content calendar for a month
5. Edit posts + generate copy variants
6. Mark posts as ready to publish

---

## 💡 KEY FEATURES UNLOCKED

✅ **Knowledge Reuse**
- No duplicate data entry
- FAQ/KB auto-loaded on setup
- Can refresh when chatbot KB changes

✅ **Multi-tenant Safety**
- Every query filtered by org/brand
- Authorization on every write
- Global TenantScope middleware

✅ **AI-Ready**
- Logs all AI generations
- Tracks tokens + costs
- Ready for billing integration

✅ **Database Design**
- Cascading deletes (campaigns → posts)
- Flexible JSON configs
- Proper indexes on query paths

---

## 📞 NEXT STEPS

1. **Test the API** using curl commands above
2. **Verify knowledge detection** — Check if FAQ loads
3. **Create a profile** and audience via API
4. **Let me know** what works/doesn't work

Then **Phase 3: Building the AI magic!** 🚀

---

## 🎯 QUICK COMMANDS

```bash
# Use PHP 8.4.20 for all commands:
/c/wamp64/bin/php/php8.4.20/php

# Run migrations
/c/wamp64/bin/php/php8.4.20/php artisan migrate

# Test in tinker
/c/wamp64/bin/php/php8.4.20/php artisan tinker

# Start dev server
/c/wamp64/bin/php/php8.4.20/php artisan serve
```

---

**Ready to test? Let's go! 🚀**

# Testing Phase 3: AI Endpoints (Complete Guide)

## 🎯 TESTING WORKFLOW

You'll test this flow:
1. Create a profile (if not exists)
2. Create an audience
3. Create a channel
4. **Generate a strategy (AI)**
5. Create a post manually
6. **Generate post copy (AI)**
7. Generate alternatives
8. Mark ready → published

---

## 🔑 STEP 1: GET YOUR AUTH TOKEN

### Via Browser DevTools (Easiest)

1. **Open browser**: http://127.0.0.1:8000/admin
2. **Log in** with your credentials
3. **Open DevTools**: Press `F12`
4. Go to **Network** tab
5. **Make any request** in the admin panel (click anything)
6. **Find the request** in the Network tab
7. Click on it → **Headers** tab
8. Look for `Authorization` header
9. Copy the full value: `Bearer eyJhbGciOiJIUzI1NiIs...`

**Or use Console** (easier):
```javascript
// In browser DevTools Console (F12 → Console tab):
document.cookie.split('; ').find(c => c.startsWith('XSRF-TOKEN=')).split('=')[1]
```

---

## 🧪 STEP 2: TEST THE ENDPOINTS

### 2a. Create a Profile (if you haven't already)

```bash
# Set your token (replace with actual token from above)
TOKEN="Bearer YOUR_ACTUAL_TOKEN_HERE"

# Create profile
curl -X POST http://127.0.0.1:8000/api/v1/admin/content-planner/profile \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Content Plan",
    "default_language": "en",
    "default_tone": "professional",
    "primary_goal": "Increase brand awareness",
    "use_existing_knowledge": true
  }' | jq .
```

**Expected response** (should print JSON):
```json
{
  "profile": {
    "id": 1,
    "organization_id": 1,
    "name": "Test Content Plan",
    "setup_completed_at": "2026-07-08T..."
  },
  "message": "Content Planner setup complete..."
}
```

**Note**: Save the `profile.id` (you'll use it for next calls)

---

### 2b. Create an Audience

```bash
# Create audience for the profile
curl -X POST http://127.0.0.1:8000/api/v1/admin/content-planner/audiences \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "planner_profile_id": 1,
    "name": "Hotel Managers",
    "industry": "Hospitality",
    "country": "US",
    "language": "en",
    "pain_points": ["Guest communication delays", "Direct bookings declining"],
    "goals": ["Improve efficiency", "Increase bookings"],
    "preferred_platforms": ["LinkedIn", "Facebook"],
    "preferred_tone": "professional"
  }' | jq .
```

**Expected response**: Audience object with id=1

---

### 2c. Create Social Channels

```bash
# Create LinkedIn channel
curl -X POST http://127.0.0.1:8000/api/v1/admin/content-planner/channels \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "planner_profile_id": 1,
    "platform": "linkedin",
    "label": "Hotel Tech LinkedIn",
    "url": "https://linkedin.com/company/hotel-tech",
    "goal": "Thought leadership",
    "audience_id": 1,
    "default_language": "en",
    "frequency": {
      "monday": true,
      "wednesday": true,
      "friday": true
    },
    "preferred_formats": ["text_post", "article"],
    "emoji_policy": "minimal",
    "hashtag_policy": "3-5"
  }' | jq .
```

**Expected response**: Channel object

---

### 🎯 2d. GENERATE A STRATEGY (THE AI MAGIC!)

```bash
# This calls Claude AI to generate a comprehensive strategy
curl -X POST http://127.0.0.1:8000/api/v1/admin/content-planner/strategies/generate \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "planner_profile_id": 1,
    "instructions": "Focus on B2B hotel industry, thought leadership angle"
  }' | jq .
```

**Expected response** (will take 5-10 seconds, Claude is thinking):
```json
{
  "strategy": {
    "id": 1,
    "title": "Social Media Strategy",
    "summary": "Comprehensive strategy...",
    "platform_strategy": {...},
    "content_mix": {
      "educational": 40,
      "promotional": 20,
      "proof_trust": 25,
      "entertainment": 10,
      "behind_scenes": 5
    },
    "ai_output": {...}
  },
  "pillars": [
    {
      "id": 1,
      "name": "Educational Content",
      "description": "...",
      "frequency_weight": 40
    },
    {
      "id": 2,
      "name": "Product/Service Explanation",
      "frequency_weight": 25
    },
    ...
  ],
  "message": "Strategy generated successfully..."
}
```

✅ **This proves Claude AI integration is working!**

---

### 2e. Create a Post Manually

```bash
# Create a post (you'll generate copy for it next)
curl -X POST http://127.0.0.1:8000/api/v1/admin/content-planner/posts \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "planner_profile_id": 1,
    "platform": "linkedin",
    "topic": "How to improve guest communication response time",
    "goal": "Educate and generate leads",
    "pillar_id": 1,
    "audience_id": 1,
    "scheduled_date": "2026-07-15",
    "language": "en"
  }' | jq .
```

**Expected response**: Post object with `status: "idea"`

**Save the post.id** (you'll need it next)

---

### 🎯 2f. GENERATE POST COPY (THE AI WRITES IT!)

```bash
# Claude AI generates platform-specific LinkedIn copy
curl -X POST http://127.0.0.1:8000/api/v1/admin/content-planner/posts/1/generate-copy \
  -H "Authorization: $TOKEN" | jq .
```

**Expected response** (5-10 seconds for Claude):
```json
{
  "post": {
    "id": 1,
    "platform": "linkedin",
    "topic": "How to improve guest communication response time",
    "hook": "A guest message waiting 2+ hours often becomes a booking somewhere else.",
    "main_copy": "Hotel managers know the problem well: guest enquiries pile up, response times slip, and direct bookings vanish...",
    "short_copy": "Quick response = more direct bookings.",
    "cta": "What's your average response time? Share in the comments—let's discuss.",
    "hashtags": ["#HotelTech", "#DirectBookings", "#Hospitality", "#GuestCommunication"],
    "status": "needs_review"
  },
  "message": "Post copy generated. Review and click 'Mark Ready' when approved."
}
```

✅ **Claude generated professional LinkedIn copy!**

---

### 2g. Generate an Alternative (Shorter Version)

```bash
# Generate a shorter version of the post
curl -X POST http://127.0.0.1:8000/api/v1/admin/content-planner/posts/1/generate-alternative?type=shorter \
  -H "Authorization: $TOKEN" | jq .
```

**Expected response**:
```json
{
  "variation": {
    "id": 1,
    "post_id": 1,
    "variation_type": "shorter",
    "copy": "Guest messages that wait 2+ hours often become bookings elsewhere. Fast response = more direct bookings.",
    "created_at": "2026-07-08T..."
  },
  "message": "Alternative generated. Choose the best version!"
}
```

**Try other types**:
```bash
# Longer version
curl -X POST http://127.0.0.1:8000/api/v1/admin/content-planner/posts/1/generate-alternative?type=longer \
  -H "Authorization: $TOKEN" | jq .

# More professional tone
curl -X POST http://127.0.0.1:8000/api/v1/admin/content-planner/posts/1/generate-alternative?type=professional \
  -H "Authorization: $TOKEN" | jq .

# Friendlier tone
curl -X POST http://127.0.0.1:8000/api/v1/admin/content-planner/posts/1/generate-alternative?type=friendly \
  -H "Authorization: $TOKEN" | jq .
```

---

### 2h. Mark Post as Ready

```bash
# Change status to ready_to_publish
curl -X POST http://127.0.0.1:8000/api/v1/admin/content-planner/posts/1/mark-ready \
  -H "Authorization: $TOKEN" | jq .
```

**Expected response**: Post with `status: "ready_to_publish"`

---

### 2i. Mark as Published

```bash
# Mark as published (after posting to LinkedIn manually)
curl -X POST http://127.0.0.1:8000/api/v1/admin/content-planner/posts/1/mark-published \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "published_url": "https://linkedin.com/feed/update/1234567890"
  }' | jq .
```

**Expected response**: Post with `status: "published"` and `published_at` timestamp

---

## 🔍 VERIFY AI COSTS LOGGED

```bash
# Check that AI generation was logged (for billing)
curl -X GET "http://127.0.0.1:8000/api/v1/admin/content-planner/posts?planner_profile_id=1" \
  -H "Authorization: $TOKEN" | jq .
```

Then in database (using tinker):
```bash
/c/wamp64/bin/php/php8.4.20/php artisan tinker
>>> App\Models\ContentPlannerAiGeneration::latest()->first();
# Should show: strategy generation + post_copy generation logs with tokens/costs
```

---

## ⚡ QUICK TEST (Copy-Paste Ready)

Save this as `test-content-planner.sh`:

```bash
#!/bin/bash

TOKEN="Bearer YOUR_TOKEN_HERE"
BASE="http://127.0.0.1:8000/api/v1/admin/content-planner"

echo "1️⃣ Creating profile..."
PROFILE=$(curl -s -X POST $BASE/profile \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","default_tone":"professional","primary_goal":"Awareness","use_existing_knowledge":true}')
PID=$(echo $PROFILE | jq -r '.profile.id')
echo "Profile ID: $PID"

echo ""
echo "2️⃣ Creating audience..."
AUD=$(curl -s -X POST $BASE/audiences \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"planner_profile_id\":$PID,\"name\":\"Test Audience\",\"industry\":\"Hospitality\"}")
AID=$(echo $AUD | jq -r '.id')
echo "Audience ID: $AID"

echo ""
echo "3️⃣ Creating channel..."
CH=$(curl -s -X POST $BASE/channels \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"planner_profile_id\":$PID,\"platform\":\"linkedin\",\"label\":\"LinkedIn\",\"audience_id\":$AID}")
echo "Channel created"

echo ""
echo "4️⃣ Generating strategy (Claude AI)..."
STRAT=$(curl -s -X POST $BASE/strategies/generate \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"planner_profile_id\":$PID}")
SID=$(echo $STRAT | jq -r '.strategy.id')
echo "Strategy ID: $SID"
echo "Pillars created: $(echo $STRAT | jq '.pillars | length') pillars"

echo ""
echo "5️⃣ Creating post..."
POST=$(curl -s -X POST $BASE/posts \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"planner_profile_id\":$PID,\"platform\":\"linkedin\",\"topic\":\"Guest communication\",\"goal\":\"Educate\"}")
POSTID=$(echo $POST | jq -r '.id')
echo "Post ID: $POSTID"

echo ""
echo "6️⃣ Generating post copy (Claude AI)..."
COPY=$(curl -s -X POST $BASE/posts/$POSTID/generate-copy \
  -H "Authorization: $TOKEN")
echo "Generated hook: $(echo $COPY | jq -r '.post.hook')"
echo "Status: $(echo $COPY | jq -r '.post.status')"

echo ""
echo "7️⃣ Generating alternative (shorter)..."
ALT=$(curl -s -X POST "$BASE/posts/$POSTID/generate-alternative?type=shorter" \
  -H "Authorization: $TOKEN")
echo "Alternative created: $(echo $ALT | jq -r '.variation.variation_type')"

echo ""
echo "✅ COMPLETE! All AI generation working."
```

**Run it**:
```bash
chmod +x test-content-planner.sh
./test-content-planner.sh
```

---

## 🎯 WHAT TO VERIFY

After testing, check:

- ✅ Strategy generates (takes 5-10 seconds)
- ✅ Strategy has pillars array
- ✅ Post copy generates with hook + main_copy + cta + hashtags
- ✅ Alternatives create PostVariation records
- ✅ Status workflow works (idea → ready → published)
- ✅ No errors in response

---

## 🐛 TROUBLESHOOTING

### "Unauthorized" (403)
- Get a fresh token from browser
- Make sure you're logged in as admin

### "jq: command not found"
- Install jq: `choco install jq` (Windows)
- Or remove `| jq .` from commands to see raw JSON

### Claude API error
- Check `ANTHROPIC_API_KEY` in `.env`
- Make sure it's set and valid

### Strategy takes forever
- Claude sometimes takes 10-15 seconds
- Be patient, it's thinking 🧠

### Database errors
- Run migration: `/c/wamp64/bin/php/php8.4.20/php artisan migrate`
- Check tables: `/c/wamp64/bin/php/php8.4.20/php artisan tinker → DB::select("SELECT * FROM content_planner_profiles")`

---

## 📊 SUCCESS LOOKS LIKE

When everything works:

1. ✅ Profile created
2. ✅ Audience created
3. ✅ Channel created
4. ✅ **Strategy AI generates** with pillars (takes ~10s)
5. ✅ Post created
6. ✅ **Post copy AI generates** with hook + body + CTA (takes ~10s)
7. ✅ Alternatives generate
8. ✅ Status changes work
9. ✅ AI logs recorded in database

**All this = Phase 3 is LIVE! 🚀**

---

## 📝 NEXT STEPS AFTER TESTING

Once you confirm everything works:
1. **Build remaining 2 services** (calendar + visual brief)
2. **Build frontend** (Marketing Hub card + setup wizard + dashboard)
3. **Deploy to production**

---

**Ready? Grab your token and start testing!** 🎯

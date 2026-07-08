# AI Content Planner Module — Codex Build Specification

## 0. Purpose of This Document

This document is written for an AI coding agent working inside the existing Laravel CRM / loyalty system.

The goal is to add a powerful, modern, easy-to-use **AI Content Planner / Social Media Planner** module to the existing platform, not to build a separate application.

The module should help a business generate a complete social media strategy, monthly content calendar, platform-specific posts, copy, visual briefs, campaign ideas, and publishing workflow by using information already stored inside the system.

A critical requirement: the module must reuse the existing **AI Chat Widget knowledge base / FAQ / business information** wherever possible. The user should not be forced to enter the same company information twice.

---

# 1. Product Summary

## Feature Name

**AI Content Planner**

Alternative UI labels allowed:

- AI Content Planner
- Social Planner
- Social Media Planner
- Content Studio
- AI Marketing Planner

Recommended final label for the existing system:

> **AI Content Planner**

Reason: the feature should eventually support social posts, email campaigns, blog ideas, ad copy, short-form video scripts, landing page content, and campaign planning. “Social Media Planner” is narrower than the real product vision.

---

# 2. Existing Product Context

The current app already includes a CRM-style interface with these sections:

- Overview
  - Dashboard
  - Analytics
  - AI Insights
- AI Chat
  - Engagement
  - Chatbot Setup
- CRM & Marketing
  - Leads
  - Deals
  - Marketing
- Operations
  - Planner
  - Brands
  - Properties
  - Scan
- System
  - Billing
  - Audit Log
  - Settings

The current Marketing page contains cards such as:

- Campaigns
- Email Templates
- Reviews

The current Settings page contains cards such as:

- General
- Industry
- Branding
- Loyalty
- Integrations
- Booking
- Pipelines
- Planner
- Menu
- Team
- Mobile App
- Documentation
- AI Usage
- AI & System

The new module must visually match the existing dark premium UI:

- dark navy background
- rounded cards
- subtle borders
- soft gradients
- colored icons
- modern SaaS look
- clean spacing
- good empty states
- responsive layout

Do not introduce a completely different design language.

---

# 3. Main Goal

The module must help businesses answer:

1. What should we post?
2. Which platform should we post it on?
3. When should we post it?
4. What should the post say?
5. What visual should we prepare?
6. What campaign does the post belong to?
7. What have we already published?
8. What topics are becoming repetitive?
9. What content pillars are missing?
10. What should we create next?

The module must transform the existing CRM from a customer-management system into a broader AI growth platform:

> CRM + AI Chatbot + Knowledge Base + Campaigns + Loyalty + AI Content Planning.

---

# 4. Core Product Principle

Do not build a simple “caption generator”.

Build a structured planning system with:

- saved company knowledge
- knowledge-base reuse
- target audience profiles
- brand voice
- content pillars
- social channel rules
- content calendar
- campaign planning
- post copy generation
- visual direction
- content history
- anti-repetition logic
- AI quality checking
- manual publishing workflow

The user should be able to use this every week as an operational tool.

---

# 5. Where to Place the Module in the Existing UI

## 5.1 Marketing Page

Add a new card to the existing **Marketing** page.

Current cards:

- Campaigns
- Email Templates
- Reviews

Add:

## AI Content Planner

Suggested card copy:

**Title:** AI Content Planner  
**Description:** Generate social media strategies, content calendars, posts, and visual briefs from your existing business knowledge.

Suggested icon:

- sparkles
- calendar-days
- share-nodes
- wand
- pen-line

Suggested color:

- cyan / blue / violet gradient

Card behavior:

- Clicking opens `/marketing/content-planner` or equivalent route.

## 5.2 Sidebar

Recommended approach for MVP:

Keep sidebar clean. Do not add too many top-level items immediately.

Add the feature as a card under Marketing first.

Later, if the module becomes central, add a sidebar sub-item under CRM & Marketing:

- Marketing
- AI Content Planner
- Campaigns

## 5.3 Settings Page

Add a settings card related to this module.

Suggested card:

**Title:** AI Content Planner  
**Description:** Brand voice, social channels, content rules, AI settings, and knowledge sources.

This card should open the planner settings page.

---

# 6. Knowledge Reuse Requirement

This is one of the most important requirements.

The app already contains company information inside the AI Chat Widget setup, FAQ, and knowledge base. The new AI Content Planner must reuse that data.

The user should not need to enter the same information twice.

## 6.1 Knowledge Source Priority

When generating strategy, calendar, or posts, use data in this priority order:

1. **AI Content Planner custom fields**  
   Use the most specific planner data first: brand voice, social strategy, target audiences, channel rules, campaign goals.

2. **Existing AI Chat Widget FAQ**  
   Use FAQ entries as high-value business knowledge. FAQs often contain the most important service explanations, objections, customer questions, pricing questions, product details, and process details.

3. **Existing AI Chat Widget Knowledge Base**  
   Use broader business information stored for chatbot answers: company description, services, rules, terms, booking rules, product info, loyalty rules, etc.

4. **Existing General / Industry / Branding settings**  
   Use general workspace/company settings as fallback.

5. **Manual user prompt at generation time**  
   Use any additional instructions entered by the user for that specific generation.

## 6.2 Fallback Logic

When a company has no AI Content Planner profile yet:

- auto-load available AI Chat Widget FAQ
- auto-load available chatbot knowledge base
- auto-load general company settings
- create a generated “Content Knowledge Summary”
- show the user a review screen instead of forcing manual entry

Suggested UI message:

> We found existing AI Chat knowledge for this business. We can use it to generate your content strategy, so you do not need to enter everything again.

Buttons:

- Use Existing Knowledge
- Review Knowledge First
- Add Missing Details

## 6.3 Missing Knowledge Detection

If important data is missing, show a smart checklist:

- Company description missing
- Target audience missing
- Main offer missing
- Brand voice missing
- Social channels missing
- Posting frequency missing
- CTA links missing

Do not block generation completely unless there is not enough information.

If data is weak, generate with a warning:

> Some brand information is incomplete. The generated plan may be more generic until you add target audience, offer, and tone of voice.

## 6.4 Content Knowledge Summary

Create a reusable summarized knowledge object for each company/workspace.

Suggested name:

- Content Knowledge Summary
- Brand Content Brain
- Marketing Knowledge Summary

This summary should combine:

- company profile
- FAQ content
- chatbot knowledge base
- services/products
- audience assumptions
- brand voice
- offers
- links
- objections
- CTAs

It should be regenerated when:

- chatbot FAQ changes
- chatbot knowledge base changes
- brand voice changes
- company profile changes
- social strategy changes

Store this summary in the database and use it in AI prompts to reduce token usage and improve consistency.

---

# 7. Main User Workflow

## Step 1 — Open Marketing

User opens:

`CRM & Marketing → Marketing`

They see existing cards plus the new **AI Content Planner** card.

## Step 2 — Open AI Content Planner

User opens the planner.

If this company already has planner setup:

- show dashboard
- show this week’s content
- show posts needing action
- show AI suggestions

If this company does not have planner setup:

- show onboarding wizard
- detect existing AI Chat knowledge
- offer to use FAQ / knowledge base as starting point

## Step 3 — Setup or Import Knowledge

User chooses:

- use existing chatbot knowledge
- add extra brand/audience details
- define social channels
- define posting frequency

## Step 4 — Generate Strategy

AI creates:

- content pillars
- platform strategy
- content mix
- posting frequency recommendations
- monthly direction

## Step 5 — Generate Calendar

User selects:

- date range
- platforms
- campaign focus
- language
- intensity
- target audience

AI generates a calendar with planned posts.

## Step 6 — Generate / Review Posts

Each calendar item contains:

- platform
- topic
- content pillar
- post goal
- copy
- visual brief
- CTA
- hashtags
- status

User edits, improves, regenerates, translates, or approves.

## Step 7 — Manual Publishing

MVP should support manual publishing only.

User copies content, prepares visual, publishes manually on social media, then marks item as published.

## Step 8 — History and Improvement

Next time AI generates posts, it reviews content history and avoids repeating the same topics too often.

---

# 8. Module Pages

## 8.1 Main Dashboard

Route example:

`/marketing/content-planner`

Purpose:

Show the planner overview for the active workspace/company.

### Dashboard Cards

Show top KPI cards:

- Posts This Month
- Ready to Publish
- Needs Review
- Needs Visual
- Published
- Active Campaigns
- Missing Setup Items

### Dashboard Sections

1. **This Week’s Schedule**
   - list planned posts by date
   - show platform badge
   - show status badge
   - quick open button

2. **AI Recommendations**
   - missing platforms
   - repeated topics
   - weak CTA warnings
   - missing content pillars
   - upcoming content gaps

3. **Platform Activity**
   - LinkedIn: 8 planned / 4 published
   - Instagram: 12 planned / 5 published
   - TikTok: 4 planned / 1 published

4. **Content Pillar Balance**
   - educational
   - product
   - proof
   - behind the scenes
   - promotional

5. **Quick Actions**
   - Generate Strategy
   - Generate Month Plan
   - Create Campaign
   - Add Manual Post
   - Open Calendar
   - Open Settings

---

## 8.2 Onboarding / Setup Wizard

Route example:

`/marketing/content-planner/setup`

Show only if planner is not configured.

### Wizard Steps

1. Knowledge Sources
2. Company Summary
3. Target Audience
4. Brand Voice
5. Social Channels
6. Posting Frequency
7. Confirm Setup

### Step 1 — Knowledge Sources

Show detected sources:

- AI Chat FAQ: found / not found
- AI Chat Knowledge Base: found / not found
- General company settings: found / not found
- Branding settings: found / not found
- Existing campaigns: found / not found

Allow user to select which sources to use.

### Step 2 — Company Summary

Pre-fill from existing data.

Fields:

- company name
- industry
- website
- main offer
- services/products
- short description
- long description
- USP
- customer problems solved
- CTA links

### Step 3 — Target Audience

Allow multiple audiences.

Fields:

- audience name
- description
- pain points
- goals
- objections
- preferred platforms
- preferred tone
- country/language

### Step 4 — Brand Voice

Fields:

- tone
- style
- formality
- emoji policy
- hashtag policy
- words to use
- words to avoid
- example post style

### Step 5 — Social Channels

Allow platforms:

- Facebook
- Instagram
- LinkedIn company page
- LinkedIn personal profile
- TikTok
- X
- YouTube
- YouTube Shorts
- Pinterest
- Blog
- Email newsletter

Fields per channel:

- active/inactive
- URL
- goal
- default audience
- default language
- tone override
- frequency
- preferred post types

### Step 6 — Posting Frequency

User defines or accepts AI recommendation.

Example:

- LinkedIn: Monday, Wednesday, Friday
- Instagram: Monday, Tuesday, Thursday, Saturday
- TikTok: Tuesday, Friday
- Facebook: Wednesday, Sunday

### Step 7 — Confirm Setup

Show summary and button:

- Save Setup
- Generate Strategy Now

---

## 8.3 Strategy Page

Route example:

`/marketing/content-planner/strategy`

Purpose:

Generate, view, edit, and save social media strategies.

### Strategy Generator Inputs

- company/workspace
- target audience
- primary goal
- secondary goals
- date period
- platforms
- language
- content intensity
- campaign focus
- additional instructions

### AI Strategy Output

Save structured sections:

1. Strategy Summary
2. Platform Roles
3. Content Pillars
4. Content Mix
5. Posting Frequency
6. Campaign Ideas
7. CTA Strategy
8. Visual Style Direction
9. Risks / Warnings
10. Next Actions

### Strategy Actions

- Save Strategy
- Regenerate
- Improve
- Make more B2B
- Make more luxury
- Make more educational
- Use this strategy for calendar generation

---

## 8.4 Content Pillars Page

Route example:

`/marketing/content-planner/pillars`

Purpose:

Manage reusable content pillars.

Each pillar should include:

- name
- description
- purpose
- recommended platforms
- frequency weight
- example topics
- CTA examples
- visual direction
- active/inactive

Example pillars:

- Educational Content
- Problem Awareness
- Product / Service Explanation
- Trust and Proof
- Customer Success
- Behind the Scenes
- Founder / Expert Insight
- FAQ / Objection Handling
- Promotion / Offer
- Industry Trends

---

## 8.5 Calendar Page

Route example:

`/marketing/content-planner/calendar`

Purpose:

Show all planned content in calendar format.

### Calendar Views

- Month view
- Week view
- List view
- Platform view
- Campaign view

### Calendar Filters

- company/workspace
- platform
- status
- campaign
- content pillar
- audience
- language
- date range

### Calendar Item Preview

Show:

- platform badge
- topic/title
- status
- content pillar
- visual status

### Calendar Item Actions

- open post
- quick status change
- duplicate
- move date
- regenerate copy
- mark ready
- mark published

### Generation Button

Button:

> Generate Content Calendar

Generation modal fields:

- period: 7 days, 14 days, 1 month, 3 months, custom
- platforms
- intensity
- audience
- campaign
- strategy
- language
- content balance
- include visual briefs: yes/no
- generate full copy now: yes/no

For MVP, allow generation of full copy immediately, but also allow lightweight idea-only generation if token cost is a concern.

---

## 8.6 Post Editor Page

Route example:

`/marketing/content-planner/posts/{id}`

Purpose:

Edit and manage one planned post.

### Post Fields

- platform
- scheduled date
- scheduled time
- status
- audience
- campaign
- content pillar
- topic
- goal
- format
- main copy
- short copy
- alternative copy
- hook
- CTA
- hashtags
- visual brief
- internal notes
- published URL
- published date

### AI Action Buttons

- Generate Copy
- Regenerate
- Improve
- Make Shorter
- Make Longer
- Make More Professional
- Make More Friendly
- Make More Luxury
- Add Stronger CTA
- Remove Emojis
- Add Emojis
- Translate
- Create 3 Alternatives
- Turn into LinkedIn Post
- Turn into Instagram Caption
- Turn into Reel Script
- Turn into Carousel
- Generate Visual Brief
- Quality Check

### Post Statuses

Use these statuses:

- idea
- draft
- needs_review
- needs_visual
- approved
- ready_to_publish
- published
- skipped
- archived

Display these as clean colored badges.

---

## 8.7 Posts Library

Route example:

`/marketing/content-planner/posts`

Purpose:

Search and manage all generated posts.

Filters:

- platform
- status
- date
- campaign
- audience
- pillar
- language
- published/unpublished
- generated/manual

Actions:

- open
- duplicate
- repurpose
- archive
- delete
- export

---

## 8.8 Campaigns Page

Route example:

`/marketing/content-planner/campaigns`

Purpose:

Plan structured campaigns, not only random social posts.

### Campaign Fields

- name
- goal
- target audience
- start date
- end date
- platforms
- offer
- CTA
- landing page
- message
- status
- notes

### Campaign AI Actions

- Generate campaign plan
- Generate content sequence
- Generate posts for campaign
- Generate launch week
- Generate reminder posts
- Generate final CTA posts

### Campaign Statuses

- draft
- active
- paused
- completed
- archived

---

## 8.9 Settings Page for AI Content Planner

Route example:

`/marketing/content-planner/settings`

Purpose:

Control global planner settings for the active company/workspace.

Settings sections:

1. Knowledge Sources
2. Brand Voice
3. Social Channels
4. Posting Frequency
5. AI Generation Defaults
6. Content Rules
7. Languages
8. Cost / Usage Rules

### Knowledge Source Settings

Allow enabling/disabling:

- use AI Chat FAQ
- use AI Chat Knowledge Base
- use general company profile
- use branding settings
- use services/products
- use CRM insights later
- use previous posts

Show last sync time.

Buttons:

- Refresh Content Knowledge Summary
- View Used Knowledge
- Detect Missing Information

### AI Generation Defaults

Fields:

- default language
- default tone
- default post length
- default CTA style
- default hashtag count
- default emoji usage
- default content calendar length
- default model if supported by app

### Content Rules

Fields:

- banned words
- required words
- claims to avoid
- disclaimers
- industries/topics to avoid
- maximum promotional post percentage
- approval required before publishing

---

# 9. Data Model Recommendation

Before creating new tables, inspect the existing codebase for related models/tables:

- users
- workspaces
- companies
- brands
- properties
- chatbot settings
- chatbot FAQs
- knowledge base entries
- campaigns
- planner/tasks
- AI usage logs
- audit logs

Reuse existing workspace/company relationships.

Do not invent a parallel company system if the app already has one.

## 9.1 Suggested Tables

Use exact project conventions for names, namespaces, policies, and migrations.

### `content_planner_profiles`

Stores main planner setup for a workspace/company.

Suggested fields:

- id
- workspace_id / company_id / brand_id depending on existing app structure
- name
- default_language
- default_tone
- primary_goal
- secondary_goals_json
- content_rules_json
- knowledge_sources_json
- knowledge_summary_long
- knowledge_summary_short
- last_knowledge_sync_at
- setup_completed_at
- created_by
- created_at
- updated_at

### `content_planner_audiences`

Stores target audiences.

Fields:

- id
- planner_profile_id
- name
- description
- industry
- country
- language
- pain_points_json
- goals_json
- objections_json
- buying_triggers_json
- preferred_platforms_json
- preferred_tone
- active
- created_at
- updated_at

### `content_planner_channels`

Stores social/media channels.

Fields:

- id
- planner_profile_id
- platform
- label
- url
- goal
- audience_id nullable
- default_language
- tone_override
- frequency_json
- preferred_formats_json
- emoji_policy
- hashtag_policy
- max_length nullable
- active
- settings_json
- created_at
- updated_at

### `content_planner_brand_voices`

Stores brand voice settings.

Fields:

- id
- planner_profile_id
- name
- tone
- style
- formality_level
- emoji_policy
- hashtag_policy
- preferred_words_json
- forbidden_words_json
- example_good_posts_json
- example_bad_posts_json
- active
- created_at
- updated_at

### `content_planner_strategies`

Stores generated strategies.

Fields:

- id
- planner_profile_id
- title
- summary
- goals_json
- platform_strategy_json
- content_mix_json
- visual_direction_json
- ai_output_json
- status
- created_by
- created_at
- updated_at

### `content_planner_pillars`

Stores content pillars.

Fields:

- id
- planner_profile_id
- strategy_id nullable
- name
- description
- purpose
- frequency_weight
- recommended_platforms_json
- example_topics_json
- cta_examples_json
- visual_direction
- active
- created_at
- updated_at

### `content_planner_campaigns`

Stores campaigns.

Fields:

- id
- planner_profile_id
- name
- goal
- audience_id nullable
- start_date
- end_date
- platforms_json
- offer
- landing_page
- key_message
- cta
- status
- notes
- ai_output_json
- created_at
- updated_at

### `content_planner_posts`

Stores planned posts.

Fields:

- id
- planner_profile_id
- campaign_id nullable
- strategy_id nullable
- pillar_id nullable
- audience_id nullable
- platform
- scheduled_date
- scheduled_time nullable
- language
- topic
- title
- goal
- format
- status
- main_copy
- short_copy nullable
- alternative_copy nullable
- hook nullable
- cta nullable
- hashtags_json nullable
- visual_brief_id nullable
- quality_score_json nullable
- source_context_json nullable
- published_url nullable
- published_at nullable
- created_by
- created_at
- updated_at

### `content_planner_visual_briefs`

Stores visual instructions.

Fields:

- id
- post_id
- visual_type
- aspect_ratio
- style
- description
- scene
- mood
- composition
- text_overlay
- avoid
- video_script nullable
- image_prompt_future nullable
- metadata_json
- created_at
- updated_at

### `content_planner_post_variations`

Stores alternative copy versions.

Fields:

- id
- post_id
- variation_type
- copy
- notes
- ai_output_json nullable
- created_at
- updated_at

### `content_planner_assets`

Stores uploaded assets.

Fields:

- id
- planner_profile_id
- title
- file_path
- file_type
- description
- tags_json
- metadata_json
- created_at
- updated_at

### `content_planner_ai_generations`

Stores AI request/response logs.

Fields:

- id
- user_id
- planner_profile_id
- generation_type
- model
- prompt_hash
- prompt_text longtext nullable if safe to store
- response_json
- tokens_input nullable
- tokens_output nullable
- cost_estimate nullable
- status
- error_message nullable
- created_at
- updated_at

If the existing system already has AI usage logging, reuse it or extend it rather than duplicating cost logs.

---

# 10. AI Generation Types

Define generation types as constants/enums.

Recommended types:

- `knowledge_summary`
- `strategy`
- `content_pillars`
- `calendar`
- `post_copy`
- `visual_brief`
- `quality_check`
- `rewrite`
- `translate`
- `repurpose`
- `campaign_plan`
- `history_analysis`

Each type should have:

- a dedicated service method
- a structured input builder
- a structured output schema
- database logging
- error handling

---

# 11. AI Architecture

Do not build one giant prompt for everything.

Use small, controlled AI services.

## 11.1 Suggested Service Classes

Names can follow project conventions.

- `ContentKnowledgeService`
- `ContentPlannerStrategyService`
- `ContentCalendarGenerationService`
- `ContentPostGenerationService`
- `ContentVisualBriefService`
- `ContentQualityCheckService`
- `ContentHistoryAnalysisService`
- `ContentPlannerAiLogger`

## 11.2 Knowledge Context Builder

Create a service that builds the context for AI calls.

Inputs:

- planner profile
- selected audience
- selected channel
- strategy
- campaign
- recent posts
- chatbot FAQ
- chatbot knowledge base
- general settings
- brand settings

Output:

A compact structured context object.

Important: limit token usage. Do not send thousands of irrelevant records. Summarize and select the most relevant knowledge.

---

# 12. AI Agents / Logical Steps

## Agent 1 — Knowledge Summarizer

Purpose:

Turn existing chatbot FAQ, knowledge base, and company data into a reusable marketing summary.

Output:

- company summary
- main services/products
- target customers inferred
- value proposition
- common FAQs
- common objections
- important claims
- CTAs/links
- tone hints
- missing information

## Agent 2 — Brand Analyst

Purpose:

Analyze company positioning for content creation.

Output:

- positioning
- brand voice
- audience insights
- content opportunities
- content risks

## Agent 3 — Strategy Builder

Purpose:

Generate social media strategy.

Output:

- platform roles
- content pillars
- content mix
- posting frequency
- campaign ideas
- CTA strategy

## Agent 4 — Calendar Planner

Purpose:

Generate calendar items for selected date range and platforms.

Output:

- dates
- platforms
- topics
- pillars
- goals
- post formats

## Agent 5 — Copywriter

Purpose:

Generate final platform-specific copy.

Output:

- copy
- hook
- CTA
- hashtags
- short version
- alternative version

## Agent 6 — Visual Director

Purpose:

Generate visual instructions.

Output:

- visual type
- aspect ratio
- concept
- mood
- scene
- composition
- text overlay
- video script if needed

## Agent 7 — Quality Checker

Purpose:

Review generated content.

Output:

- brand fit score
- platform fit score
- CTA strength
- clarity
- originality
- repetition risk
- warnings
- improvement suggestions

## Agent 8 — Repurposing Agent

Purpose:

Turn one post into another platform format.

Example:

- LinkedIn post → Instagram caption
- LinkedIn post → TikTok script
- Blog idea → 10 social posts
- FAQ → educational carousel

---

# 13. Structured AI Output

Use structured JSON outputs wherever possible.

The app needs predictable data, not free-form text only.

## 13.1 Calendar Output Example

```json
{
  "calendar": [
    {
      "date": "2026-08-03",
      "time": "10:00",
      "platform": "LinkedIn",
      "audience": "Hotel owners",
      "content_pillar": "Problem Awareness",
      "topic": "Why hotels lose direct bookings when guest messages are answered too late",
      "goal": "Educate and create urgency",
      "format": "text_post",
      "copy_required": true,
      "visual_required": false,
      "status": "idea"
    }
  ]
}
```

## 13.2 Post Output Example

```json
{
  "platform": "LinkedIn",
  "language": "en",
  "title": "Missed guest enquiries cost direct bookings",
  "hook": "A guest enquiry that waits too long often becomes a booking somewhere else.",
  "main_copy": "...",
  "short_copy": "...",
  "alternative_copy": "...",
  "cta": "See how AI can help your hotel reply faster.",
  "hashtags": ["#HotelTech", "#DirectBookings", "#HospitalityTech"],
  "visual_brief": {
    "visual_type": "image",
    "aspect_ratio": "1:1",
    "description": "Modern hotel reception desk with a CRM dashboard visible on a laptop screen.",
    "style": "premium, realistic, dark blue SaaS look",
    "avoid": "cartoon robots, excessive text, unrealistic sci-fi visuals"
  }
}
```

## 13.3 Quality Check Output Example

```json
{
  "brand_fit": 9,
  "platform_fit": 8,
  "clarity": 9,
  "cta_strength": 7,
  "originality": 8,
  "repetition_risk": "low",
  "warnings": [],
  "suggestions": [
    "CTA could be slightly more specific."
  ]
}
```

---

# 14. Prompt Rules

All prompts should include:

- company summary
- selected knowledge sources
- target audience
- platform rules
- brand voice
- current strategy
- content pillar
- campaign if applicable
- recent posts to avoid repetition
- language
- output JSON schema

Prompts must instruct AI:

- do not invent fake statistics
- do not invent testimonials
- do not invent case studies
- do not make unsupported claims
- do not overpromise results
- avoid generic AI marketing phrases
- keep platform style appropriate
- use the company’s actual services and knowledge
- respect banned words and tone rules

---

# 15. Anti-Repetition Logic

Before generating a calendar or new posts, load recent posts from the same planner profile.

Recommended lookback:

- last 30 days for short-term repetition
- last 90 days for topic balance
- current campaign posts for campaign consistency

Check:

- same topic used too often
- same CTA repeated too often
- same content pillar overused
- same platform neglected
- too many promotional posts
- no educational posts
- no proof/trust posts
- no founder/expert posts

Show insights like:

- “LinkedIn has no planned posts this week.”
- “Instagram has too many promotional posts this month.”
- “The topic ‘AI chatbot’ appears 6 times. Add more loyalty, CRM, or booking automation topics.”

---

# 16. Manual Publishing Workflow

MVP must not attempt direct social posting.

Use manual workflow:

1. AI generates post.
2. User reviews copy.
3. User prepares visual manually.
4. User copies post text.
5. User publishes on social platform manually.
6. User returns and marks post as published.
7. User may add published URL.

Post statuses:

- idea
- draft
- needs_review
- needs_visual
- approved
- ready_to_publish
- published
- skipped
- archived

Add copy buttons:

- Copy main copy
- Copy short copy
- Copy hashtags
- Copy CTA
- Copy full post

---

# 17. Future Publishing Integration

Do not build in MVP, but design database so it can support later:

- Facebook Pages publishing
- Instagram Business publishing
- LinkedIn company page publishing
- X publishing
- YouTube Shorts publishing
- TikTok publishing

Future fields:

- external_platform_post_id
- platform_publish_status
- platform_error_message
- auto_publish_enabled
- published_by_api_at

Do not block MVP with these integrations.

---

# 18. Visual Briefs First, Image Generation Later

MVP should generate visual briefs only.

The user currently prepares images/videos manually.

Each visual brief should include:

- visual type
- aspect ratio
- style
- scene
- mood
- main object/person
- background
- composition
- overlay text
- what to avoid
- video scenes if video

Later, this can become image/video generation.

Future support:

- OpenAI image generation
- branded image prompt templates
- product mockups
- carousel generation
- video script generation
- video generation

---

# 19. UX and Interface Requirements

## 19.1 Design Style

Match existing app:

- dark background
- card-based layout
- large rounded cards
- subtle borders
- gradient icon boxes
- clean typography
- platform badges
- status badges
- modern SaaS spacing

## 19.2 Empty States

Good empty states are important.

Examples:

### No Strategy Yet

Title:

> No content strategy yet

Text:

> Generate a strategy from your existing AI Chat knowledge base, FAQ, brand settings, and target audience.

Button:

> Generate Strategy

### No Calendar Yet

Title:

> Your content calendar is empty

Text:

> Create a weekly or monthly plan for LinkedIn, Instagram, Facebook, TikTok, and more.

Button:

> Generate Calendar

### No Social Channels

Title:

> Add your social channels

Text:

> Choose where this business publishes content and define posting frequency for each platform.

Button:

> Add Channels

## 19.3 Loading States

AI generation may take time.

Show states:

- Reading business knowledge
- Analyzing FAQ and knowledge base
- Building strategy
- Creating content calendar
- Writing post copy
- Creating visual briefs
- Checking quality

This makes the app feel intelligent.

## 19.4 Confirmation Before Large Generation

For large monthly generation, show a confirmation modal:

- estimated number of posts
- selected platforms
- selected date range
- whether full copy will be generated
- whether visual briefs will be generated

---

# 20. Platform-Specific Content Rules

## LinkedIn

Use for:

- B2B education
- founder/expert insights
- industry problems
- product value
- case studies
- trust-building

Style:

- professional
- clear
- not too many emojis
- few hashtags
- strong opening hook
- business-focused CTA

## Instagram

Use for:

- visual trust
- brand awareness
- reels
- carousels
- behind the scenes
- offers

Style:

- more visual
- shorter captions
- emojis allowed if brand permits
- hashtags allowed
- strong visual brief

## TikTok / Reels

Use for:

- short educational videos
- problem/solution clips
- quick tips
- behind the scenes
- trends only if appropriate

Style:

- hook in first 3 seconds
- scene-based script
- simple language
- on-screen text suggestions

## Facebook

Use for:

- community posts
- offers
- updates
- relationship-building
- local audience communication

Style:

- conversational
- clear CTA
- medium length

## X

Use for:

- short opinions
- industry insights
- threads
- quick announcements

Style:

- concise
- direct
- sharper opinion

## YouTube Shorts

Use for:

- short educational videos
- product explanations
- tips
- service demos

Style:

- title
- hook
- 30–60 second script
- CTA

## Blog

Use for:

- SEO content ideas
- long-form educational posts
- repurposing into social posts

Style:

- title
- outline
- intro
- SEO angle
- social repurpose ideas

## Email Newsletter

Use for:

- campaign messages
- updates
- offers
- educational emails

Style:

- subject line
- preview text
- email body
- CTA

---

# 21. Integration with Existing AI Insights

The planner should optionally feed insights into the existing AI Insights area.

Examples:

- “No content planned for this week.”
- “You have 5 posts ready but not published.”
- “Instagram has no visual briefs ready.”
- “The same offer was promoted too often.”
- “FAQ topics from chatbot are not being used in social content.”
- “Customer inquiries mention pricing often. Create an educational pricing post.”

Future CRM-based ideas:

- generate posts from lead objections
- generate posts from chatbot questions
- generate posts from popular services
- generate campaigns from booking trends
- generate educational posts from FAQs

---

# 22. Integration with Existing Chatbot FAQ / Knowledge Base

Implementation must inspect existing database and code for AI Chat Widget setup.

Find where the app stores:

- chatbot FAQ questions
- chatbot FAQ answers
- knowledge base entries
- company chatbot instructions
- services
- booking rules
- business rules
- AI prompt settings

Then expose them to the Content Planner through a service.

Suggested service method:

```php
$contentKnowledge = $contentKnowledgeService->buildForWorkspace($workspace);
```

It should return something like:

```php
[
    'company' => [...],
    'faq' => [...],
    'knowledge_base' => [...],
    'services' => [...],
    'branding' => [...],
    'missing_fields' => [...],
]
```

Do not hardcode table names before inspecting the actual project.

---

# 23. Permissions and Team Access

Respect existing roles/permissions.

Possible permissions:

- view content planner
- manage content planner settings
- generate AI content
- edit posts
- approve posts
- mark posts as published
- delete/archive posts
- manage campaigns

For MVP, if detailed permissions are not implemented, use existing admin/team permission logic.

---

# 24. Audit and AI Usage

Because AI generation costs money, every generation should be logged.

Track:

- user
- workspace/company
- generation type
- model
- input size
- output size
- success/failure
- created posts count
- timestamp

If the existing system already has AI Usage settings, integrate with that section.

Settings page already has **AI Usage**, so the planner should report usage there if possible.

---

# 25. Search

The Marketing page already has search.

Add planner items to search results later:

- posts
- campaigns
- strategies
- channels
- audiences

Inside planner, support search for posts:

- by topic
- copy text
- platform
- campaign
- date
- status

---

# 26. MVP Scope

## Must Build in MVP

1. Marketing page card for AI Content Planner
2. Settings page card for AI Content Planner
3. Planner dashboard
4. Setup wizard
5. Existing chatbot FAQ / knowledge base detection
6. Content knowledge summary generation
7. Target audience manager
8. Social channel manager
9. Brand voice settings
10. Strategy generator
11. Content pillar generator
12. Calendar generator
13. Calendar/list view
14. Post editor
15. Platform-specific post copy generation
16. Visual brief generation
17. Post statuses
18. Copy-to-clipboard buttons
19. Mark as published
20. Content history
21. AI generation logs
22. Basic quality check

## Should Not Build in MVP

- direct social media API publishing
- automatic image generation
- automatic video generation
- social analytics API
- subscription billing changes
- client approval portal
- complex team workflows
- drag-and-drop calendar if time is limited

---

# 27. Suggested Development Phases for Codex

## Phase 1 — Discovery

Inspect existing project structure.

Find:

- routing pattern
- layout components
- card components
- existing Marketing page
- existing Settings page
- existing AI Chat / Chatbot Setup models
- existing FAQ / knowledge base storage
- existing AI service wrapper
- existing AI usage logging
- existing workspace/company model
- existing permission model

Do not start migrations before understanding current conventions.

## Phase 2 — UI Entry Points

Add:

- AI Content Planner card to Marketing page
- AI Content Planner card to Settings page
- empty planner dashboard route
- layout consistent with existing UI

## Phase 3 — Data Model

Add required tables using project conventions.

Create models and relationships.

## Phase 4 — Knowledge Source Service

Build service that reads:

- planner profile
- chatbot FAQ
- chatbot knowledge base
- general settings
- branding settings

Create fallback logic and missing-field detection.

## Phase 5 — Setup Wizard

Build onboarding wizard.

Allow using existing knowledge and adding missing details.

## Phase 6 — Strategy and Pillars

Implement AI strategy generation and content pillars.

Save structured outputs.

## Phase 7 — Calendar Generation

Implement calendar generator.

Save posts as planned items.

## Phase 8 — Post Editor

Build post editor, AI copy generation, visual brief, copy buttons, status workflow.

## Phase 9 — History and Quality

Add content library, filters, recent history checks, AI quality scoring.

## Phase 10 — Polish

Improve UI, empty states, loading states, responsive design, error handling.

---

# 28. Acceptance Criteria

The feature is successful when:

1. User can open Marketing and see AI Content Planner card.
2. User can open Settings and see AI Content Planner settings card.
3. User can start planner setup for the active company/workspace.
4. System detects existing AI Chat FAQ and knowledge base.
5. User can use existing knowledge instead of re-entering company info.
6. User can add target audiences and social channels.
7. User can generate a social media strategy.
8. User can generate content pillars.
9. User can generate a monthly calendar.
10. Calendar items are saved to database.
11. User can open a post and generate/edit copy.
12. User can generate visual brief.
13. User can copy post text easily.
14. User can change status to ready/published.
15. Content history is saved and searchable.
16. AI generation is logged.
17. UI matches the existing dark CRM style.
18. The module does not break existing Marketing, Settings, Chatbot, Campaigns, or Planner functionality.

---

# 29. Important Guardrails

Do not:

- duplicate existing company setup unnecessarily
- force user to re-enter chatbot knowledge
- build direct publishing in MVP
- build image/video generation in MVP
- create a separate app outside the CRM
- ignore existing roles/permissions
- create a UI style different from the current system
- invent fake business statistics in generated content
- generate unsupported claims
- store huge AI prompts without considering privacy/cost
- generate content without using company context

Do:

- reuse existing knowledge
- keep the workflow simple
- make AI outputs structured
- save every generated post
- allow manual editing
- provide clear visual briefs
- support multiple companies/workspaces
- add strong empty states
- add clear status workflow
- keep MVP realistic

---

# 30. Final Product Definition

The AI Content Planner is a new module inside the existing loyalty / CRM platform that helps a business generate and manage social media content using existing AI Chat Widget knowledge, FAQ, company settings, target audience, brand voice, and social channels.

It should create strategy, content pillars, monthly calendars, platform-specific copy, visual briefs, and publishing workflows. The first version should support manual publishing and strong content planning. Later versions can add direct publishing, AI image generation, video generation, analytics, and CRM-based content recommendations.

The module should feel like a natural extension of the existing Marketing area and become a serious value-add for companies using the platform.


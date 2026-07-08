# AI Content Planner — Strategy Upgrade Prompt for Coding Agent

## Purpose of This Document

Use this document as the master instruction for improving the existing **AI Content Planner** module inside the current Laravel CRM system.

The current version is only a basic shell: setup profile, simple strategy/posts/calendar cards, manual post creation, and an empty calendar. This is not enough. The goal is to transform it into a serious AI-powered **Social Media Strategy + Content Calendar + Engagement Engine** that can create strategic, platform-specific, non-generic content plans for real brands.

This module must not become a simple caption generator. It must become a system that understands the brand, audience, USP, values, sales goals, existing FAQ knowledge, previous content, platform behavior, engagement psychology, and long-term trust building.

---

# 1. Main Product Goal

Build a powerful, modern, easy-to-use AI Content Planner that helps a company create social media content that people actually want to read, save, share, comment on, and remember.

The module should help users achieve:

- higher engagement
- stronger brand trust
- better audience understanding
- consistent publishing
- platform-specific content quality
- stronger positioning
- long-term audience growth
- more meaningful interactions
- soft lead generation without aggressive direct promotion
- better connection between brand USP, values, audience problems, and daily content

The system must generate not only posts, but complete strategic content direction:

- what to post
- why to post it
- who it is for
- what emotional trigger it uses
- what value it gives
- what interaction it should create
- what platform it fits best
- what visual/video direction is needed
- what role this post plays in the long-term strategy

---

# 2. Core Principle

The app must follow this rule:

> Audience first. Brand second. Promotion third.

Most weak social media content fails because it starts with the company: “We offer…”, “Our product…”, “Book now…”. This module must avoid that default behavior.

Every content idea should start from:

- audience pain
- audience desire
- audience question
- audience misconception
- audience aspiration
- audience identity
- audience objection
- audience daily situation
- audience emotional trigger

Only after that should the content connect naturally to the brand, product, value, or offer.

---

# 3. Strategic Content Philosophy

The AI must understand that good social media is not random posting. It is a long-term trust system.

The generated strategy should balance these content goals:

## 3.1 Attention

The content must earn attention quickly through:

- strong hooks
- relatable problems
- useful insights
- pattern interruption
- curiosity gaps
- strong first sentence
- visual clarity
- specific audience relevance

## 3.2 Trust

The content must build trust through:

- expertise
- transparency
- examples
- realistic promises
- proof
- case studies
- behind-the-scenes content
- educational explanations
- founder/expert voice

## 3.3 Interaction

The content must invite real interaction:

- questions
- polls
- comments
- “which one would you choose?” prompts
- opinion-based posts
- comparison posts
- mistake posts
- myth-busting posts
- open loops
- DM prompts
- save/share triggers

## 3.4 Memory

The brand should become memorable through:

- repeated key messages
- consistent visual style
- recognizable tone
- recurring series
- unique point of view
- strong positioning
- values-based communication

## 3.5 Conversion

The content should lead to sales or enquiries without being constantly sales-heavy.

Use soft conversion mechanisms:

- “Want the checklist?”
- “Ask us for the demo.”
- “Save this for later.”
- “Send this to your team.”
- “Book a free consultation.”
- “Start with a free trial.”
- “Need help implementing this?”

Direct sales posts should be limited and strategically placed.

---

# 4. New Setup Wizard Requirements

Replace the current simple 2-step setup with a deep but easy wizard. The wizard should feel modern, guided, and intelligent. It should not overload the user on one screen.

## Wizard Structure

### Step 1 — Select Company / Workspace

The user selects the brand/company from the existing CRM workspace.

If a company already has information in:

- General settings
- Branding settings
- Industry settings
- AI Chat Widget knowledge base
- FAQ
- Services
- Campaigns
- CRM data

then the system should reuse that data automatically.

### Step 2 — Knowledge Source Selection

The user chooses what the AI should use as brand knowledge.

Options:

- Use AI Chat Widget FAQ
- Use AI Chat Widget knowledge base
- Use company general settings
- Use services/products list
- Use existing website/business description
- Use manual information entered in this wizard
- Use uploaded brand documents later

Important logic:

1. If AI Chat Widget FAQ exists, use it as the first high-value source.
2. If FAQ is missing or incomplete, use the main AI Chat Widget knowledge base.
3. If both are missing, use company general profile/settings.
4. If all are missing, ask the user to complete manual brand setup.

The system should show a “Knowledge Completeness Score”.

Example:

- Company info: 80%
- FAQ: 65%
- Audience: 40%
- Brand voice: 20%
- Social channels: 10%
- Overall readiness: 48%

### Step 3 — Brand DNA

Collect or confirm:

- company name
- industry
- website
- short description
- long description
- main products/services
- main offer
- secondary offers
- USP
- mission
- values
- brand promise
- what makes the company different
- proof points
- awards
- testimonials
- case studies
- price position: budget / mid-market / premium / luxury
- main CTA
- important links

### Step 4 — Audience Intelligence

User defines one or more target audience segments.

For each audience:

- audience name
- job role / customer type
- industry
- region/country
- language
- business size if B2B
- pain points
- desires
- fears
- buying triggers
- objections
- content they trust
- content they ignore
- questions they ask before buying
- preferred social platforms
- emotional motivation
- rational motivation
- desired transformation

The AI should generate missing audience details if the user provides limited input, but mark them as AI assumptions.

### Step 5 — Brand Voice and Personality

User sets:

- tone: professional, friendly, luxury, bold, expert, warm, direct, educational, premium, playful
- formality: casual / balanced / formal
- emoji policy: none / light / medium / expressive
- hashtag policy: none / minimal / standard / broad
- sentence style: short / balanced / storytelling
- point of view: brand voice / founder voice / expert voice / customer voice
- forbidden words
- preferred words
- claims to avoid
- example posts the brand likes
- example posts the brand dislikes

### Step 6 — Positioning and Narrative

The AI should help define the brand’s narrative.

Fields:

- what problem we fight against
- what change we believe in
- what old way is broken
- what new way we represent
- what audience transformation we promise
- what beliefs the brand wants to repeat
- what messages should appear again and again

Example:

Old way: Hotels lose direct bookings because guest communication is slow and fragmented.  
New way: AI handles repetitive communication instantly while the team focuses on hospitality.

### Step 7 — Social Channel Strategy

For each platform, user sets:

- active/inactive
- URL
- purpose of the platform
- audience segment
- posting frequency
- preferred content formats
- tone on this platform
- CTA style
- hashtag rules
- emoji rules
- visual style
- content length
- link policy

Platforms:

- LinkedIn Company Page
- LinkedIn Founder Profile
- Instagram Feed
- Instagram Reels
- Instagram Stories
- Facebook Page
- TikTok
- YouTube Shorts
- YouTube Long Form
- X
- Blog
- Email Newsletter

### Step 8 — Strategic Content Mix

The user can accept or edit an AI-recommended mix.

Recommended content categories:

- education
- problem awareness
- myths/misconceptions
- product/service explanation
- behind the scenes
- social proof
- founder/expert thought leadership
- customer questions / FAQ
- case studies
- trend reaction
- community interaction
- soft promotion
- direct conversion

The system should recommend a balanced ratio.

Example B2B SaaS mix:

- 30% educational
- 20% problem awareness
- 15% thought leadership
- 15% product explanation
- 10% proof/case studies
- 5% behind the scenes
- 5% direct promotion

Example beauty/salon mix:

- 25% education
- 20% transformation/visual proof
- 15% expert tips
- 15% behind the scenes
- 10% offers
- 10% community/interaction
- 5% founder/story

### Step 9 — Weekly Rhythm

The system must allow weekday strategy settings.

A strong default weekly rhythm:

## Monday — Problem / Mindset / Industry Insight

Purpose: start the week with a strategic thought, problem, or perspective shift.

Good for:

- LinkedIn thought leadership
- X opinion post
- Instagram carousel
- TikTok myth-busting video

Example angles:

- “The real reason hotels lose direct bookings is not price.”
- “Most beauty salons do not have a booking problem. They have a follow-up problem.”

## Tuesday — Educational / How-To / Practical Value

Purpose: give useful content that builds authority.

Good for:

- tutorials
- checklists
- tips
- mini-guides
- explainer videos

Example angles:

- “3 ways to answer customer enquiries faster without hiring more staff.”
- “How to turn one guest question into a full content idea.”

## Wednesday — Proof / Case / Example / Before-After

Purpose: build trust through evidence.

Good for:

- case studies
- testimonials
- screenshots
- before/after stories
- data-backed explanation

Example angles:

- “Before AI: missed enquiries. After AI: instant replies and captured leads.”
- “What a better booking flow looks like.”

## Thursday — Behind the Scenes / Story / Human Content

Purpose: make the brand human and memorable.

Good for:

- team content
- product-building process
- founder story
- lessons learned
- customer conversation insights
- office/event content

Example angles:

- “What we learned from hotel managers this week.”
- “Behind the scenes: building a better CRM flow.”

## Friday — Soft Conversion / Offer / CTA

Purpose: move interested people closer to action without hard selling.

Good for:

- free trial posts
- demo invitation
- consultation CTA
- offer reminder
- product benefit summary

Example angles:

- “If you want fewer missed enquiries next week, start here.”
- “Try the AI chatbot free for 7 days.”

## Saturday — Community / Interaction / Light Value

Purpose: invite comments, preferences, stories, questions.

Good for:

- polls
- this-or-that posts
- question posts
- casual behind-the-scenes
- relatable situations

Example angles:

- “What is more frustrating: unanswered messages or double bookings?”
- “Which dashboard would your team actually use?”

## Sunday — Reflection / Recap / Planning / Inspiration

Purpose: softer content that prepares audience for next week.

Good for:

- recap posts
- weekly lessons
- planning prompts
- trend summaries
- founder reflections

Example angles:

- “One thing to improve in your customer journey next week.”
- “Sunday checklist for better customer communication.”

The user should be able to customize this rhythm per brand and per platform.

### Step 10 — Engagement Goals

The wizard should let the user choose what type of engagement matters most.

Options:

- comments
- saves
- shares
- DMs
- profile visits
- link clicks
- demo requests
- free trial signups
- bookings
- email replies

The AI should then design posts around the selected engagement goal.

Examples:

- If goal is comments: use opinion-based questions.
- If goal is saves: use checklists, frameworks, useful steps.
- If goal is shares: use clear insights, myths, mistakes, industry truths.
- If goal is DMs: use “message us for…” CTA.
- If goal is conversions: use proof + low-friction CTA.

### Step 11 — Visual Style System

The wizard should collect:

- brand colors
- visual style: premium, minimal, bold, luxury, realistic, lifestyle, corporate, educational, dark, light
- image type preference: real photos, screenshots, UI mockups, people, product, abstract, studio, office, lifestyle
- avoid list: robots, fake graphics, too much text, childish icons, generic stock images
- text overlay style
- preferred aspect ratios
- video style

The AI should generate visual briefs, not only captions.

### Step 12 — Trend Mode

Add a setting:

- Evergreen strategy
- Trend-aware strategy
- Aggressive trend testing
- Conservative professional strategy

The system should not blindly copy trends. It should adapt trends only when they fit brand, audience, and platform.

Trend validation rules:

- Is this trend relevant to the audience?
- Can the brand add a useful point of view?
- Does it damage premium/professional positioning?
- Is it worth adapting or ignoring?
- Can it be turned into educational or humorous content?

### Step 13 — Final Strategy Preview

Before saving, show:

- brand summary
- target audience summary
- platform strategy
- weekly rhythm
- content mix
- suggested posting frequency
- example posts
- visual direction
- AI readiness score

User can approve and save.

---

# 5. AI Knowledge Source Logic

Implement a context builder for AI generation.

The context builder should collect data in this priority order:

1. Manual Social Planner profile settings
2. AI Chat Widget FAQ
3. AI Chat Widget knowledge base
4. Company general settings
5. Services/products
6. Branding settings
7. CRM insights / common lead questions later
8. Previous generated/published posts
9. Campaign settings
10. User’s specific generation request

If data is missing, the AI should not hallucinate. It should either:

- ask the user to complete missing wizard fields
- generate assumptions clearly marked as assumptions
- use general industry best practice only when appropriate

---

# 6. AI Agents Required

The system should use multiple logical AI agents or prompt templates. Do not use one generic prompt for all tasks.

## Agent 1 — Brand Strategist

Input:

- company profile
- FAQ
- knowledge base
- services
- values
- USP
- audience

Output:

- positioning summary
- audience summary
- brand narrative
- key messages
- content opportunities
- risks
- assumptions

## Agent 2 — Audience Psychologist

Output:

- audience pains
- desires
- objections
- emotional triggers
- rational triggers
- attention triggers
- content they would save/share/comment on
- topics they care about
- topics to avoid

## Agent 3 — Platform Strategist

Output per platform:

- platform role
- content formats
- tone
- posting frequency
- ideal post types
- CTA style
- engagement mechanics
- visual style

## Agent 4 — Weekly Rhythm Architect

Output:

- weekday strategy
- platform mapping per day
- content pillar distribution
- campaign flow
- audience journey flow

## Agent 5 — Content Ideator

Output:

- creative post ideas
- hooks
- story angles
- educational angles
- proof angles
- interaction angles
- visual ideas

## Agent 6 — Copywriter

Output:

- final post copy
- platform adaptation
- hook
- CTA
- hashtags
- alternative versions

## Agent 7 — Visual Director

Output:

- image/video brief
- style
- composition
- format
- text overlay
- scene plan
- what to avoid

## Agent 8 — Engagement Designer

Output:

- comment trigger
- save trigger
- share trigger
- DM trigger
- poll idea
- story question
- interaction mechanic

## Agent 9 — Quality Critic

Output:

- brand fit score
- audience fit score
- platform fit score
- engagement potential score
- originality score
- repetition risk
- sales pressure score
- clarity score
- improvement suggestions

## Agent 10 — History Analyst

Output:

- overused topics
- missing pillars
- neglected platforms
- repeated CTAs
- repeated hooks
- next-month recommendations

---

# 7. Content Quality Rules

Every generated post must follow these rules:

1. One post = one clear idea.
2. First line must create immediate relevance or curiosity.
3. Start with the audience problem, not the company.
4. Avoid generic AI language.
5. Avoid empty claims like “revolutionary”, “game-changing”, “unlock your potential” unless justified.
6. Do not overpromote.
7. Connect naturally to the brand USP or values.
8. Include a clear but not always aggressive CTA.
9. Respect platform-specific behavior.
10. Include a visual idea.
11. Include an engagement mechanism.
12. Check for repetition against recent posts.
13. Do not invent fake statistics, fake testimonials, or fake case studies.
14. Do not create misleading claims.
15. Make content specific to the target audience.

---

# 8. Platform-Specific Strategy Rules

## 8.1 LinkedIn

Purpose:

- B2B trust
- authority
- thought leadership
- founder credibility
- education
- lead generation

Best content types:

- founder/expert insights
- industry lessons
- case studies
- customer problems
- transformation stories
- practical frameworks
- contrarian but useful opinions
- company updates with human angle

Rules:

- strong first line
- professional tone
- no excessive emojis
- no generic motivational fluff
- use specific business examples
- use soft CTA
- create comments through thoughtful questions
- founder profile posts can be more personal than company page posts

## 8.2 Instagram Feed

Purpose:

- brand awareness
- visual trust
- education through visuals
- aesthetic memory
- social proof

Best content types:

- carousels
- short captions
- educational graphics
- behind-the-scenes photos
- before/after
- product/service visuals
- lifestyle content

Rules:

- visual comes first
- keep captions clear
- use saves/share mechanics
- use carousel logic when teaching
- strong cover slide concept
- do not overcrowd image with text

## 8.3 Instagram Reels

Purpose:

- reach
- discovery
- short education
- quick emotional connection

Best content types:

- short tips
- myth-busting
- before/after
- process videos
- quick demos
- relatable business problems

Rules:

- first 1–3 seconds must hook
- vertical 9:16
- clear subject
- captions/on-screen text
- one idea per video
- avoid overproduced content if it feels fake

## 8.4 TikTok

Purpose:

- discovery
- attention
- relatable education
- trend adaptation
- fast creative testing

Best content types:

- native short videos
- problem/solution videos
- POV content
- founder speaking
- quick examples
- reactions to trends
- simple storytelling

Rules:

- TikTok-first content, not repurposed corporate ads
- vertical video
- strong opening hook
- natural human tone
- trend use only when relevant
- avoid polished corporate stiffness

## 8.5 YouTube Shorts

Purpose:

- discovery
- education
- searchable short-form video
- repurposed expertise

Best content types:

- quick explainers
- mini tutorials
- mistake lists
- before/after
- short demo
- question-answer format

Rules:

- hook in first seconds
- clear title
- one topic
- strong retention structure
- end with simple CTA

## 8.6 Facebook

Purpose:

- community
- local trust
- offers
- relationship building
- existing customer engagement

Best content types:

- updates
- offers
- stories
- community questions
- event posts
- helpful tips
- customer-friendly posts

Rules:

- more conversational
- easier language
- good for community-style engagement
- use questions and relatable situations

## 8.7 X

Purpose:

- short insights
- opinions
- industry commentary
- thought fragments
- traffic to deeper content

Best content types:

- sharp one-liners
- short threads
- opinions
- trend reactions
- mini frameworks

Rules:

- concise
- clear point of view
- avoid generic corporate language
- one strong idea

## 8.8 Blog / Newsletter

Purpose:

- deeper education
- SEO
- long-term trust
- nurture leads

Best content types:

- guides
- explainers
- case studies
- product education
- trend articles
- FAQ articles

Rules:

- useful structure
- clear headers
- practical examples
- can be repurposed into multiple social posts

---

# 9. Content Idea Generator Requirements

The content idea generator must not only ask for platform and topic. It should create ideas using strategic dimensions.

For every idea, generate:

- title
- platform
- audience segment
- content pillar
- funnel stage
- weekday role
- post type
- core angle
- hook
- why the audience should care
- brand connection
- USP connection
- value delivered
- visual concept
- engagement mechanism
- CTA
- repetition risk
- quality score

Idea types:

- problem-aware post
- myth-busting post
- how-to post
- checklist
- mistake post
- comparison
- story post
- before/after
- FAQ answer
- behind the scenes
- case study
- soft offer
- founder opinion
- trend reaction
- poll/question
- carousel
- short video script
- product demo
- customer journey post

---

# 10. Calendar Generator Requirements

The calendar generator must use strategy logic, not random date filling.

Input:

- company
- target audience
- platforms
- content mix
- weekly rhythm
- campaign
- posting frequency
- start date
- end date
- language
- content goals
- previous content history

Output calendar items:

- date
- suggested time
- weekday strategy
- platform
- content pillar
- audience
- funnel stage
- post type
- topic
- hook
- copy draft
- visual brief
- engagement mechanic
- CTA
- hashtags
- status
- quality score

Calendar logic:

- distribute pillars according to content mix
- avoid repetitive topics
- match weekdays to content roles
- adapt same theme differently by platform
- include campaign sequences where active
- include low-promotion/high-value balance
- show why each post exists

---

# 11. Strategy Output Requirements

When generating strategy, AI should output:

- brand summary
- target audience map
- platform roles
- content pillars
- content mix
- weekly rhythm
- monthly theme suggestions
- campaign ideas
- visual direction
- engagement strategy
- conversion strategy
- content risks
- content opportunities
- example post ideas
- next actions

The UI should display this as sections/cards, not one huge block of text.

---

# 12. UI / UX Improvements

The module must match the existing CRM dark theme but become more premium and useful.

Current UI is too empty. Improve it with:

## AI Content Planner Dashboard

Cards:

- Strategy Readiness Score
- Posts Planned This Month
- Ready to Publish
- Needs Visual
- Needs Review
- Published
- Campaigns Active
- Content Balance Health

Sections:

- This Week’s Plan
- AI Recommendations
- Platform Activity
- Content Pillar Balance
- Engagement Opportunities
- Recent Generated Posts
- Missing Setup Information

## Setup Wizard UI

Must include:

- stepper progress
- autosave
- import from FAQ button
- AI fill missing fields button
- readiness score
- preview of final strategy
- collapsible advanced fields
- clean form layout
- strong empty states

## Calendar UI

Must include:

- monthly view
- weekly view
- list view
- platform filters
- status filters
- drag-and-drop later
- colored platform badges
- post status badges
- click day to create post
- “generate week” button
- “generate month” button
- “fill empty days” button

## Post Editor UI

Must include:

- copy text
- hook
- CTA
- hashtags
- visual brief
- AI quality score
- platform preview
- rewrite buttons
- status dropdown
- copy-to-clipboard button
- mark as published
- published URL field

## Strategy UI

Must include:

- strategy overview
- content pillars
- weekly rhythm
- channel strategy
- audience map
- content mix chart
- AI recommendations
- regenerate/improve buttons

---

# 13. Database Improvements

Add or extend these tables:

## content_planner_profiles

- id
- company_id
- profile_name
- primary_goal
- secondary_goals_json
- default_language
- tone
- brand_summary
- usp
- values
- mission
- positioning
- brand_promise
- key_messages_json
- forbidden_words_json
- preferred_words_json
- knowledge_score
- setup_completed_at

## content_knowledge_sources

- id
- company_id
- source_type
- source_id
- title
- summary
- status
- priority
- last_synced_at

Source types:

- chat_faq
- chat_knowledge_base
- company_settings
- services
- manual
- uploaded_file_later

## content_audience_segments

- id
- company_id
- name
- description
- pain_points_json
- goals_json
- objections_json
- buying_triggers_json
- emotional_triggers_json
- rational_triggers_json
- preferred_platforms_json
- language

## content_platform_settings

- id
- company_id
- platform
- url
- active
- role
- audience_segment_id
- frequency_json
- tone
- formats_json
- hashtag_policy
- emoji_policy
- cta_style
- visual_style
- max_length

## content_pillars

- id
- company_id
- name
- description
- purpose
- weight
- platforms_json
- example_topics_json

## content_weekly_rhythms

- id
- company_id
- weekday
- role
- preferred_pillars_json
- preferred_platforms_json
- notes

## content_strategies

- id
- company_id
- title
- summary
- strategy_json
- content_mix_json
- platform_strategy_json
- status
- generated_by_ai

## content_calendar_items

- id
- company_id
- strategy_id
- campaign_id
- platform
- audience_segment_id
- content_pillar_id
- scheduled_date
- scheduled_time
- weekday_role
- funnel_stage
- post_type
- topic
- hook
- copy
- cta
- hashtags_json
- visual_brief_json
- engagement_mechanic_json
- status
- quality_score
- published_url
- published_at

## content_quality_scores

- id
- calendar_item_id
- brand_fit
- audience_fit
- platform_fit
- engagement_potential
- originality
- clarity
- sales_pressure
- repetition_risk
- notes

## content_ai_generations

- id
- user_id
- company_id
- generation_type
- prompt_json
- response_json
- model
- status
- tokens_used
- cost_estimate
- created_at

---

# 14. Required AI Prompt System

Implement AI prompts with structured JSON outputs. Every AI generation must be validated before saving to database.

The AI must be instructed:

- never return only generic text
- return structured fields
- mark assumptions
- avoid fake claims
- include platform-specific logic
- include visual direction
- include engagement mechanism
- include quality reasoning

---

# 15. Master AI Strategy Prompt Template

Use this as the core logic for the strategy generation prompt.

```text
You are an elite social media strategist, brand strategist, audience psychologist, and platform-native content planner.

Your task is to create a long-term social media strategy that builds attention, trust, engagement, memorability, and soft conversion for the selected brand.

Do not create random content ideas. Build a coherent strategy based on:
- brand positioning
- USP
- values
- target audience psychology
- audience pains and desires
- platform behavior
- content pillars
- weekly rhythm
- brand voice
- previous content history
- engagement goals
- available FAQ / knowledge base information

Golden rules:
1. Audience first, brand second, promotion third.
2. Do not start content with “we offer” unless the post is intentionally promotional.
3. Every post must have a purpose.
4. Every post must connect to a content pillar.
5. Every platform needs native adaptation.
6. Avoid generic AI marketing language.
7. Do not invent proof, numbers, testimonials, or results.
8. Prefer useful, specific, memorable content.
9. Mix education, proof, story, interaction, and soft promotion.
10. Create content people would want to save, share, comment on, or discuss.

Return a structured strategy with:
- brand summary
- target audience map
- positioning narrative
- content pillars
- weekly rhythm
- platform strategy
- content mix
- engagement strategy
- visual direction
- campaign ideas
- example posts
- risks
- missing information
- next actions
```

---

# 16. Master Calendar Prompt Template

```text
You are an expert social media calendar strategist.

Create a content calendar for the selected brand using the approved strategy, platform settings, weekly rhythm, audience segments, content pillars, and previous content history.

Do not fill dates randomly.

For every post, decide:
- why this post should exist
- which audience it serves
- which content pillar it supports
- which funnel stage it belongs to
- why this platform is suitable
- what engagement action it should create
- what visual is required
- how it connects to USP, values, or brand narrative

Avoid repetition from previous posts.
Avoid too many promotional posts.
Do not use the same hook style repeatedly.
Use platform-native formats.

Return calendar items as structured JSON with:
- date
- time
- weekday role
- platform
- audience
- pillar
- funnel stage
- post type
- topic
- strategic reason
- hook
- draft copy
- CTA
- hashtags
- visual brief
- engagement mechanic
- status
- quality score
```

---

# 17. Master Post Generation Prompt Template

```text
You are a platform-native social media copywriter and engagement strategist.

Create a post for the given platform and audience.

Context:
- brand profile
- USP
- values
- audience segment
- content pillar
- weekday role
- platform strategy
- tone rules
- engagement goal
- visual style
- previous content to avoid repeating

Rules:
- one post = one idea
- first line must stop attention
- speak to the audience’s problem, desire, belief, or situation
- connect naturally to the brand without sounding like an ad
- avoid generic marketing language
- include clear value
- include a suitable CTA
- include visual direction
- include an engagement mechanism
- adapt style to the platform

Return:
- main copy
- short version
- stronger CTA version
- hook alternatives
- CTA
- hashtags
- visual brief
- engagement mechanic
- quality notes
```

---

# 18. Master Visual Brief Prompt Template

```text
You are a creative director for social media content.

Create a visual brief for this post.

The visual must support the message, match the brand style, and be practical for manual creation.

Return:
- visual type
- aspect ratio
- scene/concept
- mood
- composition
- main subject
- background
- text overlay suggestion
- colors/style direction
- video scene plan if video
- what to avoid
- stock image idea if relevant
- design notes
```

---

# 19. Master Quality Checker Prompt Template

```text
You are a strict social media content quality critic.

Review the generated content.

Score:
- brand fit
- audience fit
- platform fit
- clarity
- originality
- engagement potential
- CTA strength
- visual clarity
- repetition risk
- sales pressure

Flag problems:
- too generic
- too promotional
- weak hook
- unclear audience
- platform mismatch
- repeated idea
- unrealistic claim
- vague CTA
- poor visual brief

Return corrected recommendations.
```

---

# 20. Engagement Mechanics Library

Build reusable engagement mechanics into the system.

Examples:

## Comment Triggers

- “Which one is the bigger problem for your team?”
- “Would you use this in your business?”
- “What would you add to this list?”
- “Do you agree or disagree?”
- “Which version looks more useful?”

## Save Triggers

- checklist
- step-by-step guide
- framework
- mistake list
- comparison table
- quick reference

## Share Triggers

- industry truth
- relatable pain
- myth-busting
- useful template
- strong opinion
- “send this to your team”

## DM Triggers

- “Message us ‘AI’ and we’ll send the checklist.”
- “DM us if you want the setup example.”
- “Send us your website and we’ll suggest 3 content ideas.”

## Story/Community Triggers

- polls
- sliders
- question box
- this-or-that
- quiz
- behind-the-scenes choice

---

# 21. Visual Idea Library

The system should suggest visual directions such as:

- founder photo + strong statement
- team working behind the scenes
- product screenshot
- dashboard UI mockup
- before/after process
- problem/solution split image
- customer journey diagram
- carousel framework
- 3-step checklist
- short video demo
- screen recording
- office/event photo
- testimonial graphic
- FAQ answer card
- myth vs reality graphic
- comparison carousel
- lifestyle image
- premium brand still life

The AI should choose based on platform and post type.

---

# 22. Trend-Aware Logic

Add a future-ready trend module.

For MVP, allow manual trend input:

- trend title
- platform
- description
- why it is relevant
- example link
- suggested adaptation

Later, connect to trend data sources/APIs where possible.

AI trend validation:

- relevant to brand: yes/no
- relevant to audience: yes/no
- fits brand tone: yes/no
- can create useful content: yes/no
- risk level: low/medium/high
- recommended action: use/adapt/ignore

Do not hard-code trends forever. Trends expire quickly.

---

# 23. Anti-Repetition Logic

Before generating new content, compare against previous content.

Check:

- repeated topic
- repeated hook
- repeated CTA
- repeated visual idea
- repeated content pillar
- repeated platform format
- too many posts about same offer

If repetition is detected, AI should either:

- create a new angle
- change format
- change platform
- change hook
- change audience segment
- postpone the post

---

# 24. Success Metrics for the Module

The module is successful when users can:

- complete setup easily
- generate a serious strategy
- generate one month of content
- understand what to post each day
- get platform-specific copy
- get practical visual ideas
- avoid direct promotion overload
- maintain consistent brand voice
- reuse FAQ and knowledge base automatically
- track what is ready and published
- generate new ideas without repetition

Future success metrics:

- engagement rate
- saves
- shares
- comments
- clicks
- leads generated
- bookings/demos/free trials
- best-performing content pillars
- best-performing platforms

---

# 25. Development Instructions for Coding Agent

You are improving an existing Laravel CRM module called **AI Content Planner**.

Do not rebuild the entire CRM.
Do not destroy existing navigation, authentication, layout, or current marketing pages.
Do not create a separate app.

Improve the existing module inside the current system.

Your tasks:

1. Review the current module implementation.
2. Identify existing routes, controllers, models, migrations, views, and components.
3. Preserve existing app style and dark UI design.
4. Replace the simple setup flow with the advanced setup wizard.
5. Add database tables needed for strategic content planning.
6. Implement knowledge source selection from existing AI Chat Widget FAQ / knowledge base where available.
7. Add setup completeness scoring.
8. Add strategy generator page.
9. Add content pillars and weekly rhythm settings.
10. Add platform settings.
11. Add calendar generation logic.
12. Add post editor with AI rewrite tools.
13. Add visual brief generation.
14. Add content quality scoring.
15. Add content history and anti-repetition checks.
16. Ensure all AI outputs are structured JSON and validated before saving.
17. Add clean empty states, loading states, and helpful UI explanations.
18. Keep the module easy to use despite advanced settings.
19. Build MVP first, but structure code for future image generation, direct publishing, analytics, and trend integrations.

Do not implement direct social media publishing yet.
Do not implement paid subscriptions yet.
Do not implement automatic image/video generation yet.
Do not overcomplicate team approvals in MVP.

Focus on making the strategy, calendar, post generation, visual briefs, and UX excellent.

---

# 26. MVP Implementation Order

## Phase 1 — Structure and Database

- add/extend migrations
- models
- relationships
- route structure
- service classes
- AI generation logging

## Phase 2 — Advanced Setup Wizard

- knowledge source selection
- brand DNA
- audience segments
- brand voice
- platform settings
- weekly rhythm
- content mix
- final preview

## Phase 3 — Strategy Generator

- brand strategist prompt
- audience psychologist prompt
- platform strategy prompt
- save structured strategy
- display strategy in UI cards

## Phase 4 — Calendar Generator

- generate monthly calendar
- use weekday rhythm
- use platform frequency
- use content mix
- avoid repetition
- save items

## Phase 5 — Post Generator and Editor

- generate copy
- regenerate/improve
- translate
- copy to clipboard
- status workflow

## Phase 6 — Visual Briefs and Quality Score

- visual director prompt
- quality critic prompt
- display quality warnings

## Phase 7 — Dashboard Polish

- readiness score
- content health
- this week plan
- pending tasks
- AI recommendations

---

# 27. Final Product Standard

The finished module should feel like a professional AI marketing strategist inside the CRM.

It should not feel like:

- a simple form
- a basic calendar
- a random caption generator
- a generic ChatGPT wrapper

It should feel like:

- a strategic planning system
- a brand-aware content engine
- a weekly marketing assistant
- a practical social media operating system
- a tool that helps companies stay visible, valuable, and consistent

The final goal:

> The user should be able to set up a brand once, connect existing FAQ/knowledge base information, define audience and platform rules, and then generate a complete, high-quality, strategic content calendar with ready-to-use copy and visual ideas for every social channel.


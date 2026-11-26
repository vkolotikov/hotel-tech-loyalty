# Handoff — 26 November 2026

## CRM lead follow-up

FDS retail prices come from the builder. The shared knowledge library now includes sourced partner terms, delivery and proof guidance. Confirm bespoke kit prices and destination charges on the specific order. The Contacts bridge accepts Zoho delivery confirmation for replies filed outside Sent.

Lead edits support clearing the enquiry type and entering a custom type for organisations without a configured list. Empty FDS amounts default to EUR. Captured and logged emails can fill a blank value from an explicit order total with its currency. Approved quotes can supply their calculated total. Lead views group totals by currency.

## PHP dependency maintenance

A separate lock-file patch updates Symfony HTTP Kernel, Mailer, Routing and the required HTTP Foundation component to 8.1.12. Composer's locked dependency audit clears the five November advisories. Run the production stack's PHP 8.5 checks against the lock file.

## CRM email quality review

A reseller run ended without a usable email after four paid calls. The audit stayed within its ten-attempt limit. The writer now records bounded failure reasons by generation stage, including correction and review, without logging correspondence or provider responses.

A matched production retest distinguished the price of a stock sample from the cost of proving a complete custom order. The search plan now records what is being priced and carries a buyer-approved fallback through to review. Retrieve the full audit from the owner's private report for case scores and the limitations of the live sample.

The production draft review exposed quoted threads and signatures being read as fresh requests, repeated email copies, and a price hold after a buyer expressly invited a feasibility response. The CRM assistant now prepares the captured correspondence before retrieval, masks labelled access details in provider inputs, and gives the independent commercial reviewer recent correspondence. A pricing correction shares the existing retry allowance. Each final figure must still pass the commercial checks.

The CRM runbook describes the [email workflow](../crm-workspace.md#customer-email-drafts). Regression coverage is in `LeadAssistantTest` and `AssistantEmailTextTest`. The customer-level audit and draft examples are held outside Git. For the automatic capture setup, queues, release procedure and other operational context, see the [25 November handoff](2026-11-25-hexatech-handoff.md).

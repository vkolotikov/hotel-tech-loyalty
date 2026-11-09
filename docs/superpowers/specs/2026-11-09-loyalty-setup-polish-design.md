# Loyalty setup and catalogue improvements

The owner requested cleaner member/place forms, a usable industry setup, compact offers, reward management, and email/app readiness checks. Preserve the current navy/cyan visual language and all five translations.

## Behaviour

- Give desktop member fields explicit vertical gaps; exclude native radios from text-input styling. Preserve mobile flows, accessible labels, keyboard focus, and light theme.
- Make every server-provided industry template selectable in guided setup, including organisations with existing tiers. Existing organisations keep their tiers, benefits and reward catalogue; a selected template proposes only earning options, shown and editable before Apply. The existing backend tier-preservation guard remains. No global organisation industry or unrelated CRM settings change. A new empty programme still gets the canonical preset catalogue. Keeping current settings remains the default for existing programmes. Remember the chosen template through wizard-owned ProgrammeOptions metadata so reopening Settings can identify it; reopening starts from saved numbers until another template is deliberately chosen.
- Put a clear guided-setup action and the real server checklist on Overview for unfinished setup, even when registration already seeded tiers. Keep a permanent Setup section in Settings with links to guided setup and the checklist. Do not automatically redirect staff or overwrite programme data.
- Points rewards have explicit Edit, Enable/Disable and Delete controls for authorised staff. Delete is allowed only when there is no redemption of any status and no stamp-card reference. Existing/redemption history must survive. Use one shared transactional reward-management service for both admin interfaces; lock the reward row, use the existing redemption lock convention, validate tenant and permission, audit each change. Return structured refusal codes. No cascade deletion of history.
- Offers open in a compact read view with schedule, eligibility, limits, terms and Edit. New offers open the editor immediately. Edits use the existing writer and unsaved-change guard; cancel exits editing, save returns to the read view. Preserve search, selection and permission behaviour.

## Verification and release

Add meaningful service/API and pure state tests for reward safety, template selection, setup replay and offer read/edit transitions. Verify desktop/mobile forms, dark/light and translations in the browser against real local endpoints. Follow the repository source-patch deploy recipe, required artifact checks and fresh build, then verify production content. Check email public DNS and SiteGround; preserve the actual mail providers. Read the current native-app release evidence before reporting push/wallet readiness; device delivery and wallet acceptance are separate from implemented code.

Implementation details and exact component composition are left to the builder. Existing setup idempotency, permissions, shared writers, programme economics validation and source-patch release rules remain mandatory.

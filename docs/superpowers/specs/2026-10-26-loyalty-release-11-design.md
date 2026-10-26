# HexaTech Loyalty, release 11: rename and delete tiers and benefits

Owner, 2026-10-26: "Can we add an option for users delete or rename tiers and benefits, so they can customise the
system for their needs."

## What was there

- Renaming worked, but only inside each item's full Edit form, which a newcomer does not read as "rename". Two tiers
  could be given the same name; the database refused the second with an error page.
- Nothing could be deleted. A tier or a benefit could only be switched off, and stayed on every list.

## The decisions

1. **Rename is its own action.** Each tier card has Rename, Edit and Delete in words; each benefit row has the same
   three as icons beside its switch. Rename asks for the name alone. A tier's name is the organisation's own among
   the tiers not deleted, whatever its case.
2. **Delete is a soft delete.** A deleted tier or benefit leaves every list and ladder (the models are SoftDeletes,
   so the full admin, the portal and the member app forget it too), while history keeps its name: tier assessments,
   a member's tier and members' benefit requests read it `withTrashed()`. Nothing is removed from the database that
   history points at.
3. **Nothing changes until the manager has read what changes.** The dialog asks the server what the delete would do
   (`GET …/removal`) and says it line by line, the lines that need staff afterwards marked.
4. **A tier's members always have a tier.** They move, switched on and off, to the tier the manager chooses; the
   suggestion is the nearest tier below that members can earn, else the nearest above. Each move is a tier assessment
   (`tier_deleted`, who did it). Their points stay; they are not sent a message. The last tier switched on cannot be
   deleted.
5. **Nothing gets wider than it was.** An empty tier list means "every tier" for boosts and offers, and an empty tier
   rule matches everyone in a segment. So a boost or an offer that named only the deleted tier is switched off; a
   segment rule naming only it is left as it is (refused at send until staff change it); a place or an event that let
   in only it then lets in no tier until staff choose again. Where they name other tiers too, the deleted one is simply
   taken out.
6. **A benefit's delete** takes it off every tier (the links switched off) and out of the catalogue. Requests members
   already made keep its name; the waiting ones stay in Requests for staff to decide. The dialog offers switching it
   off instead, which comes back with one press.
7. **Names and codes are free again.** Partial unique indexes keep a tier's name and a benefit's code once among the
   rows not deleted, so a new "Silver" can follow a deleted one. A preset applied again never brings back what a
   manager deleted.

## Server

- Migration `2026_10_26_120000_tiers_and_benefits_can_be_deleted`: `deleted_at` on `loyalty_tiers` and
  `benefit_definitions`; on PostgreSQL and SQLite the plain uniques on (organisation, name) and (organisation, code)
  become partial (`WHERE deleted_at IS NULL`). Its `down()` restores the plain ones where no rows clash.
- `App\Services\Loyalty\Programme\TierRemoval` (`preview()`, `remove()` under `tiers:{org}`),
  `Programme\BenefitRemoval`, `Members\TierHolders` (`moveAll()`, `renamed()`).
- `ProgramController`: `tierRemoval`, `destroyTier` (`move_to`), `benefitRemoval`, `destroyBenefit`; the tier name
  check; a deleted benefit's code free again. The routes sit under `admin/loyalty/program` (staff read, managers
  change).
- Unscoped ladder queries drop only `TenantScope`, so they do not see deleted tiers; the workspace's forms refuse a
  deleted tier or benefit.

## Workspace

- `program/RemoveDialogs.tsx` (`RenameDialog`, `RemoveTier`, `RemoveBenefit`); the wording of each change is
  `programMath.ts` `tierRemovalLines()` with `words.ts` `REMOVAL_WORDS`; every string in all five bundles.

## Tests

- `tests/Feature/LoyaltyWorkspace/ProgramRemovalTest.php` (SQLite and PostgreSQL, the partial indexes included);
  `frontend/src/loyalty/program/RemoveDialogs.test.tsx`.

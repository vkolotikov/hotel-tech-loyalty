# Selling the workspaces on their own — runbook

The owner (2026-11-02): customers buy one product at a lower price and get only that product. Later they add the others
by buying more. HexaTech Loyalty and HexaTech Content cost 85 € a month each, and both together cost 170 €. The
Appointments plan (`docs/appointments-workspace.md`, "Selling Appointments on its own") was the first such plan. The
logic below covers all three.

## Who is on modules

`Organization::planModules()` gives the modules an organisation bought, in the order `appointments`, `loyalty`,
`content`. It answers `null` for a full customer, who has the full admin and every workspace. It decides in this order:

1. An operator's mark. `php artisan workspace:appointments <organisation id> --only` puts the organisation on the
   Appointments plan. `--not-only` makes it a full customer whatever billing says (this now also overrides Loyalty or
   Content bought alone). `--plan-decides` hands the decision back to billing.
2. Billing's products, when it sent any. The organisation is on modules when every product is a module product
   (`appointments`, `booking`, `loyalty`, `content`) and at least one names a module. Any other product (`crm`,
   `chat`…) makes a full customer. This is why Starter (`crm`, `loyalty`) stays a full customer.
3. The plan slug, when billing sent no products: `loyalty`, `content`, `loyalty-content`, `appointments`,
   `appointments-loyalty`… (`PlanModules::fromPlanSlug`; only the canonical order counts).

`App\Support\PlanModules` holds the modules, each module's billing products, the slug for a set of modules
(`planSlug()`), and the prices and features used only when billing cannot be read.

## What an organisation on modules has

- **Its workspaces only.** The workspaces it bought are always on, and the others are off. Staff land on the workspace
  an operator chose with `--landing` when it is one of them, else on the first in the order above. Sign-in, `/auth/me`
  and the sign-up answer mark each bought workspace `only: true`.
- **No full admin.** Every full-admin address sends staff to their workspace (`fullAdminRedirect`). The access map
  (`AdminAccess`, `AccessMap::productsFor`) answers every other admin endpoint 403 `not_in_plan`. Allowed are the
  `account` product and the products named after the modules bought. The full admin's own loyalty endpoints
  (`admin/members`…) carry the `loyalty` product, so a Loyalty customer's API may call them, but no screen shows them.
- **What a missing module would do stays off.** Without Loyalty there is no member portal, no points, no member sign-up
  and no guest made a member, and the staff app hears no request alerts. Without Content there is no morning email.
  The checks are `holdsModule()` and `lacksModule()`.
- **In each workspace's Settings**, in place of "Full admin": the other workspaces it bought, then
  **Plan & products**. When the plan has ended, the workspace says so and links to Plan & products.

## The pages

| Address | What it is |
|---|---|
| `/loyalty/register`, `/content/register` | Sign-up for that product alone. It is the full suite's sign-up screen (email code, industry, trial) with the product's own words and the price from `GET /v1/modules`. When billing does not sell the plan yet, the page says so and starts no trial. |
| `/loyalty/login`, `/content/login` (and `…/forgot-password`, `…/reset-password`) | The same accounts as `/login`. A signed-out visit to `/loyalty…` or `/content…` comes here. |
| `/account/products` | **Plan & products**: the plan, its status and price; Add a card and activate (trial), Card and invoices (paid), Start again (ended); each product with "In your plan / Open" or "Add for €85 a month". Staff read it, and owners and managers act. It sits outside every workspace and outside the subscription check, so a plan that ended can be started again. |

The umbrella `/register` and the full admin's Billing page still list only the full plans and Appointments, because
`/v1/plans` leaves the Loyalty and Content plans to their own pages.

## The endpoints

| Route | Who | What |
|---|---|---|
| `GET /v1/modules` | public | Every module plan with its monthly amount, currency, trial and `available`. Billing's rows are used where it lists them, and the built-in prices otherwise. `available: false` means billing was read and does not sell that plan. |
| `GET /v1/auth/modules` | staff (`auth/modules`, product `account`) | The organisation's modules, plan, subscription status, each product's state and the price of adding it. |
| `POST /v1/auth/modules/add {module}` | owner, manager | Moves the subscription to the plan of the larger set through billing's `change-plan`. |
| `POST /v1/auth/modules/activate` | owner, manager | Pays for the current plan through Stripe Checkout, back to `/account/products?success=1`. An ended plan starts a new subscription to the same plan, as the full admin's Billing does. |
| `POST /v1/auth/modules/portal` | owner, manager | Opens Stripe's customer portal (card, invoices, cancelling). |
| `POST /v1/auth/modules/refresh` | owner, manager | Reads billing again after Stripe sends the customer back. |

**Adding a product.** The client sends only the module; the server picks the plan by slug and never sends an amount.

| Case | What happens |
|---|---|
| Trial without a card | Billing swaps the plan. The product is in the trial at no charge, and the customer pays the new price once they activate. |
| Card-paid subscription | The target plan must have its own monthly Stripe price, otherwise the answer is `not_available` and nothing changes. Stripe prorates, so the difference for the rest of the month is on the next invoice. |
| Ended plan | Refused with `subscription_inactive`. The customer uses "Start again" first. |
| Billing does not sell the larger set (e.g. `appointments-loyalty`) | Refused with `not_available`, and the page says "Contact HexaTech". |
| No billing application configured (local development only) | The organisation's own row changes. |

**Signing up for a module.** Billing's register answers an unknown plan with a Growth trial. The sign-up therefore
first checks that billing lists the plan. If billing is read and does not list it, the sign-up is refused
(`not_available`) before anything is made. The welcome email links to the product's own sign-in page.

## Billing handover (the owner, in `hotel-tech-saas`)

The billing side is the patch `docs/billing/2026-11-02-hotel-tech-saas-module-plans.patch` (commit `ee8d969`, branch
`ccr-71f769f3-l5tyv4` in that repository). This session could not push it there. It contains:

- a migration that adds the product `content` and the plans `loyalty` (8 500), `content` (8 500) and
  `loyalty-content` (17 000). The plans are in EUR, monthly only (`yearlyAmount` 0), with a 7-day trial and their
  products and features. They are **hidden and unpriced**, so nobody can sign up for one or be moved to one yet;
- `stripe:sync --plan=<slug>… --publish`, which prices only the named plans and then publishes each one that has a
  monthly price;
- `SubscriptionService::changePlan`, which refuses to move a Stripe-charged subscription to a plan without a price
  for the interval. Before, the local plan changed while Stripe kept charging the old price.

To sell the plans:

1. Apply the patch in `hotel-tech-saas` and deploy it: `git am docs/billing/2026-11-02-hotel-tech-saas-module-plans.patch`
   from a checkout of `hotel-tech-saas` `main` (copy the file across first), then merge to `main` as usual.
2. In that application's environment, run once:
   `php artisan stripe:sync --plan=loyalty --plan=content --plan=loyalty-content --publish`
   (it creates the three monthly prices in Stripe and makes the plans public).
3. Deploy this application (either order works: before step 2 the pages say the products cannot be bought yet).

The features each plan grants (editable in billing's super admin, Plans) are assumptions of 2026-11-02:

- **Loyalty:** 5 team members, 2 000 members, 2 000 guests, 1 property; campaigns, wallet, push, member app and NFC
  cards on; everything else off.
- **Content:** 5 team members, 1 property; everything else off (the Content workspace checks no feature).
- **Loyalty + Content:** the larger of each.

This application's fallback (`PlanModules::features`) mirrors them.

## Known limits (2026-11-02)

- **No "remove a product" online.** Stripe's portal cancels the whole plan. A smaller plan is set by HexaTech in
  billing.
- **Appointments with Loyalty or Content** needs billing plans `appointments-loyalty`, `appointments-content` and
  `appointments-loyalty-content`. The logic already handles them. Until they exist, Plan & products says "Not
  available online yet".
- **No team management in the workspaces.** Inviting colleagues and Twilio (SMS) settings are in the full admin.
  An organisation on modules needs HexaTech to add a staff account or set up SMS. This was already true of the
  Appointments plan.
- **Links into the full admin** from inside a workspace (e.g. campaign results, SMS setup) send a customer on modules
  back to its workspace.
- The Appointments plan's staff can now pay for and restart their plan themselves on Plan & products. Before
  2026-11-02, HexaTech did this for them.

## Rules the code keeps (and the tests that keep them)

- `tests/Unit/Support/PlanModulesTest.php`: which product lists and slugs are module plans, prices, features.
- `tests/Feature/AdminAccess/PlanModulesAccessTest.php`: workspaces, landing, access, loyalty off without the module,
  the operator's mark, the commands.
- `tests/Feature/Auth/PlanModulesControllerTest.php`: the catalogue, Plan & products, adding a product (trial, paid,
  unpriced, not sold, ended, staff refused), module sign-up, `/v1/plans` filtering.
- Frontend: `workspace/lib/landing.test.ts` (modules), `lib/api.refusals.test.ts` (a session from before the plan
  changed), `pages/productSignup.test.ts`, `pages/AccountProducts.test.tsx`, `pages/Login.product.test.tsx`.
- Billing: `tests/Feature/ModulePlansTest.php` in `hotel-tech-saas` (PostgreSQL).

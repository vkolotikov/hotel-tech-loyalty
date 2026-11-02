# Selling the workspaces on their own — runbook

The owner (2026-11-02): customers buy one product at a lower price and get only that product. Later they add the others,
or move to another package. HexaTech Loyalty and HexaTech Content are each sold in three packages; Standard is the
85 € one. Paid yearly, every package costs 15 % less a month. The Appointments plan
(`docs/appointments-workspace.md`, "Selling Appointments on its own") was the first such plan; the logic covers all
three products.

## Packages and prices

The prices are in EUR. Yearly is 12 months less 15 %.

| | Lite | Standard | Pro |
|---|---|---|---|
| Loyalty, a month | 49 | 85 | 149 |
| Loyalty, yearly (a month / a year) | 41.65 / 499.80 | 72.25 / 867 | 126.65 / 1 519.80 |
| Content, a month | 39 | 85 | 149 |
| Content, yearly (a month / a year) | 33.15 / 397.80 | 72.25 / 867 | 126.65 / 1 519.80 |

Both products together cost the sum of the two packages chosen (for example Loyalty Pro + Content Lite is 188 € a
month).

What each package grants is enforced by existing code: the member limit by `PlanLimitGuard` when a member is added,
the team limit when a colleague is invited, campaigns, push and wallet by the routes' `feature:` middleware, and
Content's AI allowance by `ContentAiGate` (`ai_monthly_cost_cents`, a monthly AI budget in USD cents).

| | Loyalty Lite | Loyalty Standard | Loyalty Pro | Content Lite | Content Standard | Content Pro |
|---|---|---|---|---|---|---|
| Members | 500 | 2 500 | 10 000 | — | — | — |
| Team members | 2 | 5 | 15 | 2 | 5 | 15 |
| Locations | 1 | 1 | 3 | 1 | 1 | 3 |
| Email and SMS campaigns, push, Wallet and NFC cards | — | yes | yes | — | — | — |
| Monthly AI allowance | — | — | — | 8 $ | 20 $ | 50 $ |
| Support | email | email | priority | email | email | priority |

These are the owner's prices of 2026-11-02 and Claude's proposed limits. Billing's super admin (Plans) can change any
of them; the pages show billing's figures. This application's fallback (`App\Support\PlanModules`, used only when
billing cannot be read) mirrors them.

## Who is on modules, and in which package

`Organization::planModules()` gives the modules an organisation bought, in the order `appointments`, `loyalty`,
`content`. It answers `null` for a full customer, who has the full admin and every workspace. It decides in this order:

1. An operator's mark. `php artisan workspace:appointments <organisation id> --only` puts the organisation on the
   Appointments plan. `--not-only` makes it a full customer whatever billing says (this also overrides Loyalty or
   Content bought alone). `--plan-decides` hands the decision back to billing.
2. Billing's products, when it sent any. The organisation is on modules when every product is a module product
   (`appointments`, `booking`, `loyalty`, `content`) and at least one names a module. Any other product (`crm`,
   `chat`…) makes a full customer. This is why Starter (`crm`, `loyalty`) stays a full customer.
3. The plan slug, when billing sent no products.

`Organization::planTiers()` gives each bought module's package, read from the plan slug.

**Plan slugs** (`PlanModules::planSlug()`): Standard is the bare name, the others carry their package, and two
products join with a hyphen in the order above, for example `loyalty`, `loyalty_lite`, `content_pro`, `loyalty-content`
and `loyalty_pro-content_lite`. Only that spelling is a module plan.

## What an organisation on modules has

- **Its workspaces only.** The workspaces it bought are always on, and the others are off. Staff land on the workspace
  an operator chose with `--landing` when it is one of them, else on the first in the order above. Sign-in, `/auth/me`
  and the sign-up answer mark each bought workspace `only: true`.
- **No full admin.** Every full-admin address sends staff to their workspace (`fullAdminRedirect`). The access map
  (`AdminAccess`, `AccessMap::productsFor`) answers every other admin endpoint 403 `not_in_plan`. Allowed are the
  `account` product (Plan & products, Team, the caller's own profile) and the products named after the modules
  bought.
- **What a missing module would do stays off.** Without Loyalty there is no member portal, no points, no member
  sign-up, no guest made a member and no request alert on the staff app. Without Content there is no morning email.
  The checks are `holdsModule()` and `lacksModule()`.
- **In each workspace's Settings**, in place of "Full admin": the other workspaces it bought, then **Team** and
  **Plan & products**. When the plan has ended, the workspace says so and links to Plan & products.
- **SMS.** Loyalty's SMS page connects the venue's Twilio account itself (`PUT admin/loyalty/sms/connection`). It writes
  the same rows as the full admin's Settings → Integrations; the Auth Token is encrypted at rest and never shown back,
  and an empty token keeps the stored one.

## The pages

| Address | What it is |
|---|---|
| `/loyalty/register`, `/content/register` | Sign-up for that product. The full suite's sign-up screen (email code, industry, trial) with the product's own words and its three packages from `GET /v1/modules`, monthly or yearly, Standard picked first. The trial is of the package chosen. When billing does not sell it yet, the page says so and starts no trial. |
| `/loyalty/login`, `/content/login` (and `…/forgot-password`, `…/reset-password`) | The same accounts as `/login`. A signed-out visit to `/loyalty…` or `/content…` comes here. |
| `/account/products` | **Plan & products**: the plan and its packages, status, monthly and yearly price. Owners and managers can pay monthly or yearly (trial, or an ended plan), open Card and invoices (paid), add a product in a package, change a product's package, or remove a product from a plan of two. Staff can read it. It sits outside every workspace and outside the subscription check, so a plan that ended can be started again. |
| `/account/team` | **Team**: invite a colleague as manager or staff, change the role, switch someone off or on, send an invitation again. It uses the full admin's team endpoints (`admin/team`, product `account`), so the package's team limit applies. |

The umbrella `/register` and the full admin's Billing page still list only the full plans and Appointments, because
`/v1/plans` leaves the module plans to their own pages.

## The endpoints

| Route | Who | What |
|---|---|---|
| `GET /v1/modules` | public | Every module plan with its packages, monthly and yearly amounts, currency, trial, features and `available`. Billing's rows are used where it lists them, and the built-in prices otherwise. `available: false` means billing was read and does not sell that plan. |
| `GET /v1/auth/modules` | staff (`auth/modules`, product `account`) | The organisation's modules and packages, plan, subscription status, and for each product the packages it could move to or be added in, with prices. |
| `POST /v1/auth/modules/add {module, package}` | owner, manager | Adds a product in a package (Standard when none is named). |
| `POST /v1/auth/modules/package {module, package}` | owner, manager | Moves a product to another package. |
| `POST /v1/auth/modules/remove {module}` | owner, manager | Takes a product off a plan that holds two. Its data stays; adding it again brings it back. |
| `POST /v1/auth/modules/activate {interval}` | owner, manager | Pays for the current plan, `MONTHLY` or `YEARLY`, through Stripe Checkout, back to `/account/products?success=1`. An ended plan starts a new subscription to the same plan, as the full admin's Billing does. |
| `POST /v1/auth/modules/portal` | owner, manager | Stripe's customer portal (card, invoices, cancelling). |
| `POST /v1/auth/modules/refresh` | owner, manager | Reads billing again after Stripe sends the customer back. |

**Every change** (add, package, remove) moves the subscription to the plan of the new choice through billing's
`change-plan`. The client names a product and a package, never an amount.

| Case | What happens |
|---|---|
| Trial without a card | Billing swaps the plan. The customer pays the new price once they activate. |
| Card-paid subscription | The target plan must have its own Stripe price for the subscription's interval (monthly or yearly); otherwise `not_available`, and nothing changes. Stripe prorates: the difference for the rest of the period is charged or credited on the next invoice. |
| A smaller package than what the organisation holds | Refused with `over_limit` (with the limit and the count) while it has more members or active team members than the package allows. |
| Ended plan | Refused with `subscription_inactive`. The customer uses "Start again" first. |
| Billing does not sell the plan (e.g. `appointments-loyalty`) | Refused with `not_available`, and the page says "Contact HexaTech". |
| No billing application configured (local development only) | The organisation's own row changes. |

**Signing up for a module.** Billing's register answers an unknown plan with a Growth trial. The sign-up therefore
first checks that billing lists the plan. If billing is read and does not list it, the sign-up is refused
(`not_available`) before anything is made. The welcome email names the package and links to the product's own
sign-in page.

## Billing handover (the owner, in `hotel-tech-saas`)

The billing side is `docs/billing/2026-11-02-hotel-tech-saas-module-plans.patch`: two commits (`ee8d969`, `ddb4cf1`) on
branch `ccr-71f769f3-l5tyv4` of that repository. This session was refused push access there. The patch contains:

- **Two migrations.**
  - The products `content` (and `loyalty` where a database lacks it).
  - The 15 module plans: each product in each package, and both products in every pair. They are in EUR, with yearly
    amounts at 15 % off, a 7-day trial, their products and features, and the new feature `ai_monthly_cost_cents`.
  - They are **hidden and unpriced**, so nobody can sign up for one or be moved to one yet.
- **`stripe:sync --module-plans --publish`.** It creates each module plan's monthly and yearly Stripe prices, then
  publishes the plans that have them. `--plan=<slug>` limits it to named plans.
- **`SubscriptionService::changePlan` refuses** to move a Stripe-charged subscription to a plan with no price for the
  interval. Before, the local plan changed while Stripe kept charging the old price.

To sell the plans:

1. In a checkout of `hotel-tech-saas` `main`, run
   `git am <path to hotel-tech-loyalty>/docs/billing/2026-11-02-hotel-tech-saas-module-plans.patch`, then merge and
   deploy as usual. The deploy runs the two migrations.
2. In that application's environment, run once: `php artisan stripe:sync --module-plans --publish`.
3. This application is already deployed. Before step 2, its new pages say the products cannot be bought yet.

## Known limits (2026-11-02)

- **Appointments with Loyalty or Content** needs billing plans such as `appointments-loyalty` and
  `appointments-content`, with an Appointments price. The logic already handles them. Until they exist, Plan &
  products says "Not available online yet".
- **Changing monthly to yearly on a paid plan** is done in Stripe's customer portal (Card and invoices), where the
  owner's Stripe portal settings allow it. Plan & products asks monthly or yearly only when paying for a trial or
  starting a plan again.
- **Links into the full admin** from inside a workspace (for example campaign results) send a customer on modules back
  to its workspace.
- **The Appointments plan's staff** can pay for and restart their plan themselves on Plan & products, and manage their
  team on Team. Before 2026-11-02, HexaTech did this for them.

## Rules the code keeps (and the tests that keep them)

- `tests/Unit/Support/PlanModulesTest.php`: slugs, packages, prices (yearly 15 % less), features.
- `tests/Feature/AdminAccess/PlanModulesAccessTest.php`: workspaces, landing, access (Team included), loyalty off
  without the module, the operator's mark, the commands.
- `tests/Feature/Auth/PlanModulesControllerTest.php`: the catalogue (15 plans), Plan & products, adding in a package,
  changing package, removing, the limit guard, yearly payment, paid and unpriced plans, module sign-up, `/v1/plans`
  filtering.
- `tests/Feature/LoyaltyWorkspace/SmsConnectionTest.php`: the Twilio account from the workspace; the token is never
  answered or audited.
- Frontend: `workspace/lib/landing.test.ts`, `lib/api.refusals.test.ts`, `pages/productSignup.test.ts`,
  `pages/AccountProducts.test.tsx`, `pages/AccountTeam.test.tsx` and `pages/Login.product.test.tsx`.
- Billing: `tests/Feature/ModulePlansTest.php` in `hotel-tech-saas` (PostgreSQL). It covers the 15 plans, the
  features, `stripe:sync --module-plans` and the change-plan guard.

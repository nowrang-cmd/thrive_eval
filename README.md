# THRiVE Development Evaluation Registration

**Status:** Secure client cutover implemented; preview and production rollout pending
**Current fee:** **$30 CAD**  
**Current Vercel URL:** `https://thrive-eval.vercel.app`  
**Production domain target:** `https://start.thrivebasketball.org`

This repository hosts the new THRiVE Basketball Academy Development Evaluation Registration experience and preserves the legacy standalone evaluation/report tools already in the repository.

## Current architecture

After the cutover, Development Evaluation registrations follow this flow:

`Public GET EVALUATED CTA → start.thrivebasketball.org → thrive_eval browser → THRiVE OS /api/public-evaluation-intake → service-only intake RPC → evaluation_submissions + notification outbox → THRiVE OS Athlete Intake`

The registration itself remains the intake. Current browser builds send an allowlisted request directly to the THRiVE OS public boundary, which derives operational and payment state server-side. A compatibility-only `/api/evaluation-registration` forwarder remains for cached older bundles through December 31, 2026; it has no Supabase access and retires closed after that date.

## Client environment

Set the public, build-time endpoint for each environment:

```text
VITE_THRIVE_OS_PUBLIC_EVALUATION_INTAKE_URL=https://<thrive-os-host>/api/public-evaluation-intake
THRIVE_OS_PUBLIC_EVALUATION_INTAKE_URL=https://<thrive-os-host>/api/public-evaluation-intake
```

Both variables use the same endpoint: the `VITE_` value is for current browser builds, and the server-only value is for the temporary compatibility forwarder. The URL must use HTTPS and the exact `/api/public-evaluation-intake` path. Preview builds must point only to a THRiVE OS preview connected to non-production Supabase data. No Supabase key, service-role key, payment secret, or intake hash secret belongs in a `VITE_` variable.

The browser generates a 128-bit idempotency key with Web Crypto. A per-tab `sessionStorage` record contains only that random key and a SHA-256 payload fingerprint; it never stores the registration payload. An unchanged retry reuses the key, while an edited or reset registration receives a new one.

The compatibility forwarder accepts only same-origin HTTPS calls, forwards no cookies or authorization headers, and sends only the JSON body, original origin, and idempotency key to THRiVE OS. Cached bundles that predate browser idempotency keys receive a fresh compatibility key per request. Its response includes `Deprecation` and `Sunset` headers.

## Development Evaluation fee

**$30 CAD**

This supersedes all historical `$20` references.

Payment choices:

### Pay Now — $30

1. Save registration first.
2. Record the registration as unpaid / Stripe.
3. Redirect to the approved THRiVE Stripe Payment Link.
4. Pass the registration UUID as `client_reference_id`.
5. The existing THRiVE Supabase `stripe-credit-webhook` verifies the successful payment and updates the exact `evaluation_submissions` record to paid.

Approved live Payment Link:

`https://buy.stripe.com/4gM8wP8sNcoXdz270P2400i`

### Pay at Evaluation — $30

The registration is saved without a Stripe redirect using:

```text
payment_status = cash_due
payment_method = pay_at_session
amount_due = 30
amount_paid = 0
evaluation_fee_status = cash_due
evaluation_fee_paid = false
```

The athlete still proceeds into Athlete Intake and can receive evaluation-session options while payment remains due.

## DOB → Grade behavior

- Date of birth is required.
- Grade 4–12 is suggested from date of birth using the current school-year calculation.
- Grade / Level remains editable.
- Prep / College / University / Other remain manual options.
- Future DOBs are rejected.
- Invalid DOBs are not clamped into Grade 4 or Grade 12.
- Development Stage is **never** derived from age or grade.

## Development Stage rule

Families do not select:

`Discovery → Emerging → Foundations → Advanced → Elite → Performance`

The THRiVE Development Evaluation determines the appropriate starting stage.

## Supabase boundary

This application has no direct Supabase registration access. The THRiVE OS server boundary is the only component allowed to invoke the service-only intake RPC. It validates the origin, body allowlist, consent, idempotency key, rate limit, and payment choice before the database derives protected fields and writes `public.evaluation_submissions`.

## Stripe fulfillment

The active Stripe fulfillment implementation is **not a separate Vercel webhook for this app**.

The canonical active webhook is:

`nowrang-cmd/thrive-os/supabase/functions/stripe-credit-webhook/index.ts`

The Supabase Edge Function already receives successful Stripe Checkout events and now handles:

- THRiVE training-credit purchases; and
- `$30` Development Evaluation payments.

Evaluation payment fulfillment verifies:

- approved evaluation Payment Link ID;
- exactly `$30 CAD`;
- valid registration UUID in `client_reference_id`;
- matching `evaluation_submissions` record;
- source `thrive_evaluation_registration`;
- `$30` amount due.

## Historical end-to-end verification — 2026-08-19

The checks below verified the predecessor intake path. Before production cutover, repeat both payment paths through the new THRiVE OS boundary on a Vercel preview backed only by the staging Supabase project.

### Pay at Evaluation — PASS

Verified:

- live registration submission;
- Supabase record creation;
- `$30 cash_due / pay_at_session` state;
- athlete appeared in THRiVE OS Athlete Intake.

### Pay Now — PASS

Verified:

- registration saved before payment;
- correct live `$30 CAD` Stripe Payment Link;
- registration UUID carried into Stripe Checkout as `client_reference_id`;
- live Stripe payment completed;
- Supabase Stripe webhook marked the exact registration paid;
- athlete appeared in THRiVE OS Athlete Intake.

The payment/intake architecture should now be treated as stable unless a real defect or changed business requirement requires modification.

## Logo rule

The standard THRiVE logo rule applies:

- **white/light surface → black-and-gold THRiVE logo**;
- **dark/black surface → white-and-gold THRiVE logo**.

The normal registration header is white and therefore uses the black-and-gold light-background logo.

Do not redraw, regenerate, recolour, stretch, crop, or approximate the approved logo artwork.

## Legacy files preserved

Do not delete or replace these existing standalone tools unless there is a deliberate migration plan:

- `thrive-dashboard.html`
- `thrive-eval-form.html`
- `thrive-report.html`
- `thrive-self-eval.html`

They are separate from the new React/Vite registration experience.

## Canonical project documentation

The broader public-site source-of-truth documents live in `nowrang-cmd/thrive-public-website/docs`, especially:

- `THRiVE_CURRENT_OPERATIONAL_VALUES.md`
- `THRIVE_EVALUATION_REGISTRATION_CURRENT_STATE_20260819.md`
- `THRIVE_LOGO_USAGE_STANDARD.md`
- `THRiVE_APPROVED_MOCKUP_MANIFEST.md`
- `THRiVE_PUBLIC_WEBSITE_VISUAL_MASTER.md`

When older Word blueprints or mockups conflict with these current documents, follow the current operational/handoff documents.

## Cutover gate

1. Configure the feature-branch preview with the THRiVE OS staging preview endpoint.
2. Ensure that preview origin is explicitly allowed by the THRiVE OS intake boundary.
3. Verify Pay Now, Pay at Evaluation, exact retry, changed-payload retry, rate limiting, and the saved-registration/payment-link-unavailable path with synthetic staging data.
4. Confirm one submission and one intended outbox item per registration.
5. Record both commits, preview URLs, verification results, and rollback plan.
6. Obtain explicit approval before changing the production domain, production variables, or Supabase revocation migration.

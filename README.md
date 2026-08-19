# THRiVE Development Evaluation Registration

**Status:** Production-validated secure intake application  
**Current fee:** **$30 CAD**  
**Current Vercel URL:** `https://thrive-eval.vercel.app`  
**Production domain target:** `https://start.thrivebasketball.org`

This repository hosts the new THRiVE Basketball Academy Development Evaluation Registration experience and preserves the legacy standalone evaluation/report tools already in the repository.

## Current architecture

New Development Evaluation registrations follow this flow:

`Public GET EVALUATED CTA → start.thrivebasketball.org → thrive_eval → evaluation_submissions → THRiVE OS Athlete Intake`

The registration itself is the intake. New registrations write directly to `evaluation_submissions`; they do not require a new `evaluation_requests → evaluation_submissions` conversion step.

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

## Supabase

THRiVE project ref:

`nbofhqsjkbacwtwpwjai`

New registrations write to:

`public.evaluation_submissions`

The public registration API uses the controlled anonymous/public INSERT policy for the secure THRiVE intake origin. Private reads and management remain protected.

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

## End-to-end verification — 2026-08-19

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

## Next production step

Attach/confirm `start.thrivebasketball.org` on the `thrive-eval` Vercel project and route all new public GET EVALUATED actions to that secure domain.

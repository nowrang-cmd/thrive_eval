import Stripe from 'stripe'

export const config = { api: { bodyParser: false } }

const EVALUATION_FEE_CENTS = 3000
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_thrive_not_configured')
const clean = (value, max = 1200) => String(value ?? '').trim().slice(0, max)

async function rawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

function getSupabaseConfig() {
  const url = clean(process.env.SUPABASE_URL || process.env.THRIVE_SUPABASE_URL, 500).replace(/\/+$/, '')
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.THRIVE_SUPABASE_SERVICE_ROLE_KEY, 2000)
  if (!url || !key) throw new Error('THRiVE Supabase backend is not configured.')
  return { url, key }
}

async function markPaid(submissionId, session) {
  const { url, key } = getSupabaseConfig()
  const now = new Date().toISOString()
  const payload = {
    payment_status: 'paid',
    payment_method: 'stripe',
    amount_due: 30,
    amount_paid: 30,
    payment_provider: 'stripe',
    payment_reference: clean(session.payment_intent || session.id, 255),
    paid_at: now,
    payment_confirmed_at: now,
    payment_confirmed_by: 'Stripe webhook',
    evaluation_fee_status: 'paid',
    evaluation_fee_paid: true,
    evaluation_fee_waived: false,
    evaluation_fee_amount: 30,
    evaluation_fee_paid_at: now,
    evaluation_fee_note: 'Evaluation fee paid online through Stripe.',
    updated_at: now,
  }

  const response = await fetch(`${url}/rest/v1/evaluation_submissions?id=eq.${encodeURIComponent(submissionId)}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  const raw = await response.text()
  if (!response.ok) {
    console.error('THRiVE Stripe payment update failed:', response.status, raw)
    throw new Error('Could not update THRiVE evaluation payment status.')
  }
  return raw ? JSON.parse(raw) : null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  const secret = clean(process.env.THRIVE_STRIPE_WEBHOOK_SECRET, 1200)
  const signature = req.headers['stripe-signature']
  if (!secret || !signature) return res.status(400).json({ error: 'Stripe webhook is not configured.' })

  let event
  try {
    const body = await rawBody(req)
    event = stripe.webhooks.constructEvent(body, signature, secret)
  } catch (error) {
    console.error('THRiVE Stripe webhook signature verification failed:', error)
    return res.status(400).json({ error: 'Invalid Stripe signature.' })
  }

  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    return res.status(200).json({ received: true, ignored: true })
  }

  const session = event.data.object
  if (session.payment_status !== 'paid') return res.status(200).json({ received: true, pending: true })

  const submissionId = clean(session.client_reference_id, 200)
  if (!submissionId) return res.status(200).json({ received: true, ignored: true, reason: 'No THRiVE registration reference.' })

  if (Number(session.amount_total) !== EVALUATION_FEE_CENTS || String(session.currency || '').toLowerCase() !== 'cad') {
    console.error('THRiVE Stripe amount mismatch:', session.id, session.amount_total, session.currency)
    return res.status(400).json({ error: 'Unexpected evaluation payment amount.' })
  }

  try {
    await markPaid(submissionId, session)
    return res.status(200).json({ received: true, registrationId: submissionId })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Payment update failed.' })
  }
}

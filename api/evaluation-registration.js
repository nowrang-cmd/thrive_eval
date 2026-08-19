const EVALUATION_FEE = 30
const ALLOWED_PAYMENT_CHOICES = new Set(['online', 'at_session'])

const clean = (value, max = 3000) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max)
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getSupabaseConfig() {
  const url = clean(process.env.SUPABASE_URL || process.env.THRIVE_SUPABASE_URL, 500).replace(/\/+$/, '')
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.THRIVE_SUPABASE_SERVICE_ROLE_KEY, 2000)
  if (!url || !key) throw new Error('THRiVE intake backend is not configured.')
  return { url, key }
}

async function createSubmission(payload) {
  const { url, key } = getSupabaseConfig()
  const response = await fetch(`${url}/rest/v1/evaluation_submissions`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })
  const raw = await response.text()
  let body = null
  try { body = raw ? JSON.parse(raw) : null } catch { body = null }
  if (!response.ok) {
    console.error('THRiVE evaluation registration insert failed:', response.status, raw)
    throw new Error('We could not save the evaluation registration. Please try again.')
  }
  return Array.isArray(body) ? body[0] : body
}

function paymentUrlFor(submissionId) {
  const link = clean(process.env.THRIVE_EVALUATION_PAYMENT_LINK, 1200)
  if (!link) return null
  const url = new URL(link)
  url.searchParams.set('client_reference_id', submissionId)
  return url.toString()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  const data = req.body || {}
  if (clean(data.website, 200)) return res.status(200).json({ ok: true })

  const athleteFirstName = clean(data.athleteFirstName, 100)
  const athleteLastName = clean(data.athleteLastName, 100)
  const dateOfBirth = clean(data.dateOfBirth, 20)
  const grade = clean(data.grade, 80)
  const parentFirstName = clean(data.parentFirstName, 100)
  const parentLastName = clean(data.parentLastName, 100)
  const parentEmail = clean(data.parentEmail, 320).toLowerCase()
  const parentPhone = clean(data.parentPhone, 80)
  const athleteEmail = clean(data.athleteEmail, 320).toLowerCase()
  const paymentChoice = clean(data.paymentChoice, 30).toLowerCase()

  if (!athleteFirstName || !athleteLastName || !dateOfBirth || !grade || !parentFirstName || !parentLastName || !parentEmail || !parentPhone) {
    return res.status(400).json({ error: 'Please complete all required fields.' })
  }
  if (!emailPattern.test(parentEmail) || (athleteEmail && !emailPattern.test(athleteEmail))) {
    return res.status(400).json({ error: 'Enter a valid email address.' })
  }
  if (athleteEmail && athleteEmail === parentEmail) {
    return res.status(400).json({ error: 'Athlete and parent emails must be different when both are provided.' })
  }
  if (!ALLOWED_PAYMENT_CHOICES.has(paymentChoice)) {
    return res.status(400).json({ error: 'Choose Pay Now or Pay at Evaluation.' })
  }
  if (data.consent !== true) {
    return res.status(400).json({ error: 'Please confirm the registration consent.' })
  }

  const birthYear = /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) ? dateOfBirth.slice(0, 4) : ''
  if (!birthYear) return res.status(400).json({ error: 'Enter a valid date of birth.' })

  const online = paymentChoice === 'online'
  const now = new Date().toISOString()

  const payload = {
    athlete_first_name: athleteFirstName,
    athlete_last_name: athleteLastName,
    athlete_name: `${athleteFirstName} ${athleteLastName}`.trim(),
    athlete_email: athleteEmail || null,
    birth_year: birthYear,
    grade,
    evaluation_group: grade,
    position: clean(data.position, 100) || null,
    school: clean(data.school, 200) || null,
    parent_first_name: parentFirstName,
    parent_last_name: parentLastName,
    parent_name: `${parentFirstName} ${parentLastName}`.trim(),
    parent_email: parentEmail,
    parent_phone: parentPhone,
    email: parentEmail,
    phone: parentPhone,
    years_of_experience: clean(data.yearsExperience, 200) || null,
    years_experience: clean(data.yearsExperience, 200) || null,
    highest_level_played: clean(data.highestLevelPlayed, 300) || null,
    improvement_goals: clean(data.improvementGoals, 3000) || null,
    what_does_the_athlete_want_to_improve: clean(data.improvementGoals, 3000) || null,
    goals: clean(data.improvementGoals, 3000),
    notes: clean(data.notes, 3000) || null,
    status: 'new',
    workflow_status: 'New Submission',
    payment_status: online ? 'unpaid' : 'cash_due',
    payment_method: online ? 'stripe' : 'pay_at_session',
    amount_due: EVALUATION_FEE,
    amount_paid: 0,
    currency: 'CAD',
    payment_provider: online ? 'stripe' : 'in_person',
    evaluation_fee_status: online ? 'unpaid' : 'cash_due',
    evaluation_fee_paid: false,
    evaluation_fee_waived: false,
    evaluation_fee_amount: 0,
    evaluation_fee_paid_at: null,
    evaluation_fee_note: online
      ? `Registration received. $${EVALUATION_FEE} evaluation fee pending Stripe payment.`
      : `Registration received. $${EVALUATION_FEE} evaluation fee due at the scheduled evaluation.`,
    source: 'thrive_evaluation_registration',
    submitted_from: 'thrive_evaluation_registration',
    submitted_origin: 'https://start.thrivebasketball.org',
    submitted_at: now,
    updated_at: now,
  }

  try {
    const submission = await createSubmission(payload)
    const paymentUrl = online ? paymentUrlFor(submission?.id) : null

    if (online && !paymentUrl) {
      return res.status(503).json({
        ok: false,
        registrationId: submission?.id,
        error: 'Registration was saved, but online payment is not configured yet. Please choose Pay at Evaluation or contact THRiVE.',
      })
    }

    return res.status(200).json({
      ok: true,
      registrationId: submission?.id,
      paymentChoice,
      paymentUrl,
    })
  } catch (error) {
    console.error('THRiVE evaluation registration failure:', error)
    return res.status(500).json({ error: error?.message || 'Registration could not be completed.' })
  }
}

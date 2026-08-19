import { useMemo, useState } from 'react'

const EVALUATION_FEE = 30
const LIGHT_BACKGROUND_LOGO = 'https://os.thrivebasketball.org/logos/white_logo.jpg'

const initialForm = {
  athleteFirstName: '', athleteLastName: '', dateOfBirth: '', grade: '', position: '', school: '', athleteEmail: '',
  parentFirstName: '', parentLastName: '', parentEmail: '', parentPhone: '',
  yearsExperience: '', highestLevelPlayed: '', improvementGoals: '', notes: '', paymentChoice: 'online', consent: false, website: '',
}

const grades = ['Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12','Prep','College / University','Other']

function currentSchoolYearStart() {
  const today = new Date()
  return today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1
}

function suggestedGradeFromBirthYear(birthYear) {
  const grade = currentSchoolYearStart() - Number(birthYear) - 5
  if (!Number.isFinite(grade)) return ''
  return `Grade ${Math.min(12, Math.max(4, grade))}`
}

export default function App() {
  const [form, setForm] = useState(initialForm)
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  const athleteName = useMemo(() => `${form.athleteFirstName} ${form.athleteLastName}`.trim(), [form.athleteFirstName, form.athleteLastName])

  function change(event) {
    const { name, value, type, checked } = event.target
    setForm((current) => {
      const next = { ...current, [name]: type === 'checkbox' ? checked : value }

      if (name === 'dateOfBirth') {
        const birthYear = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Number(value.slice(0, 4)) : NaN
        next.grade = suggestedGradeFromBirthYear(birthYear)
      }

      return next
    })
    setMessage('')
  }

  async function submit(event) {
    event.preventDefault()
    setStatus('submitting')
    setMessage('')

    try {
      const response = await fetch('/api/evaluation-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Registration could not be submitted.')

      if (payload.paymentUrl) {
        window.location.assign(payload.paymentUrl)
        return
      }

      setStatus('success')
      setMessage(`Registration received for ${athleteName || 'the athlete'}. The $${EVALUATION_FEE} evaluation fee will be collected at the scheduled evaluation session.`)
    } catch (error) {
      setStatus('error')
      setMessage(error.message)
    }
  }

  if (status === 'success') {
    return (
      <main className="page-shell">
        <section className="success-card">
          <img className="brand-logo" src={LIGHT_BACKGROUND_LOGO} alt="THRiVE Basketball Academy" />
          <span className="eyebrow">Registration received</span>
          <h1>YOUR EVALUATION JOURNEY HAS STARTED.</h1>
          <p>{message}</p>
          <p>THRiVE will follow up with upcoming evaluation session options.</p>
          <button className="button secondary" onClick={() => { setForm(initialForm); setStatus('idle'); setMessage('') }}>Register another athlete</button>
        </section>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <img className="brand-logo" src={LIGHT_BACKGROUND_LOGO} alt="THRiVE Basketball Academy" />
        <div className="topbar-copy"><strong>Development Evaluation Registration</strong><span>Mind • Body • Skill</span></div>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow">Every athlete has a starting point.</span>
          <h1>DISCOVER <span>YOURS.</span></h1>
          <p>Register for a THRiVE Development Evaluation. Our coaches use Mind • Body • Skill to identify strengths, Development Priorities, Next Steps, and the athlete's appropriate starting stage.</p>
        </div>
        <aside className="fee-card"><span>Development Evaluation</span><strong>${EVALUATION_FEE}</strong><small>Pay online now or at the scheduled evaluation.</small></aside>
      </section>

      <form className="registration-form" onSubmit={submit}>
        <section className="form-section">
          <div className="section-heading"><span>01</span><div><h2>Athlete Information</h2><p>Tell us who is coming for the evaluation.</p></div></div>
          <div className="grid two">
            <Field label="First Name *"><input name="athleteFirstName" value={form.athleteFirstName} onChange={change} required /></Field>
            <Field label="Last Name *"><input name="athleteLastName" value={form.athleteLastName} onChange={change} required /></Field>
            <Field label="Date of Birth *"><input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={change} required /></Field>
            <Field label="Grade / Level *">
              <select name="grade" value={form.grade} onChange={change} required>
                <option value="">Select</option>
                {grades.map((grade) => <option key={grade}>{grade}</option>)}
              </select>
              <small className="field-help">Suggested automatically from date of birth. Change it if the athlete's current grade is different.</small>
            </Field>
            <Field label="Position"><input name="position" value={form.position} onChange={change} placeholder="Guard, Wing, Forward..." /></Field>
            <Field label="School"><input name="school" value={form.school} onChange={change} /></Field>
            <Field label="Athlete Email"><input type="email" name="athleteEmail" value={form.athleteEmail} onChange={change} /></Field>
          </div>
        </section>

        <section className="form-section alt">
          <div className="section-heading"><span>02</span><div><h2>Parent / Guardian</h2><p>Primary contact for evaluation scheduling and follow-up.</p></div></div>
          <div className="grid two">
            <Field label="First Name *"><input name="parentFirstName" value={form.parentFirstName} onChange={change} required /></Field>
            <Field label="Last Name *"><input name="parentLastName" value={form.parentLastName} onChange={change} required /></Field>
            <Field label="Email *"><input type="email" name="parentEmail" value={form.parentEmail} onChange={change} required /></Field>
            <Field label="Mobile Number *"><input type="tel" name="parentPhone" value={form.parentPhone} onChange={change} required /></Field>
          </div>
        </section>

        <section className="form-section">
          <div className="section-heading"><span>03</span><div><h2>Basketball Background</h2><p>Context helps our coaches understand the athlete before evaluation.</p></div></div>
          <div className="grid two">
            <Field label="Years of Experience"><input name="yearsExperience" value={form.yearsExperience} onChange={change} /></Field>
            <Field label="Highest Level Played"><input name="highestLevelPlayed" value={form.highestLevelPlayed} onChange={change} /></Field>
            <Field label="What does the athlete want to improve?" full><textarea name="improvementGoals" rows="5" value={form.improvementGoals} onChange={change} /></Field>
            <Field label="Additional Notes" full><textarea name="notes" rows="4" value={form.notes} onChange={change} /></Field>
          </div>
        </section>

        <section className="form-section alt">
          <div className="section-heading"><span>04</span><div><h2>Evaluation Fee</h2><p>Choose how you would like to pay the ${EVALUATION_FEE} Development Evaluation fee.</p></div></div>
          <div className="payment-grid">
            <PaymentOption selected={form.paymentChoice === 'online'} onClick={() => setForm((v) => ({ ...v, paymentChoice: 'online' }))} title={`Pay Now — $${EVALUATION_FEE}`} copy="Continue to secure Stripe Checkout after registration." />
            <PaymentOption selected={form.paymentChoice === 'at_session'} onClick={() => setForm((v) => ({ ...v, paymentChoice: 'at_session' }))} title={`Pay at Evaluation — $${EVALUATION_FEE}`} copy={`Bring $${EVALUATION_FEE} to the scheduled evaluation session.`} />
          </div>
          <label className="consent"><input type="checkbox" name="consent" checked={form.consent} onChange={change} required /><span>I confirm the information above is accurate and authorize THRiVE Basketball Academy to contact me about this athlete's evaluation.</span></label>
          <input className="honeypot" name="website" value={form.website} onChange={change} tabIndex="-1" autoComplete="off" />
          {message && <div className="form-error">{message}</div>}
          <button className="button primary" disabled={status === 'submitting'}>{status === 'submitting' ? 'Submitting...' : form.paymentChoice === 'online' ? `Register & Pay $${EVALUATION_FEE}` : 'Register & Pay at Evaluation'}</button>
          <p className="secure-note">Your Development Stage is determined through evaluation. Families do not select a stage during registration.</p>
        </section>
      </form>

      <footer><strong>THRiVE Basketball Academy</strong><span>Developing Athletes. Building Better People.</span></footer>
    </main>
  )
}

function Field({ label, full = false, children }) {
  return <label className={full ? 'field full' : 'field'}><span>{label}</span>{children}</label>
}

function PaymentOption({ selected, onClick, title, copy }) {
  return <button type="button" className={selected ? 'payment-option selected' : 'payment-option'} onClick={onClick}><span className="radio-dot" /><div><strong>{title}</strong><small>{copy}</small></div></button>
}

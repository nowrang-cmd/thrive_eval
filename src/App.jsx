import { useMemo, useState } from 'react'
import evaluationHero from './evaluationHeroData'

const EVALUATION_FEE = 30
const LOGO = 'https://os.thrivebasketball.org/logos/white_logo.jpg'
const SITE = 'https://thrive-public-website.vercel.app'

const grades = ['Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12','Prep','College / University','Other']
const facilities = ['Sport for Life Centre','Garden City Collegiate','University of Winnipeg','Canadian Mennonite University','University of Manitoba']
const levels = ['New to organized basketball','Recreational','School team','Club / community team','Provincial / elite','Prep / post-secondary','Other']
const todayIso = new Date().toISOString().slice(0, 10)

const initialForm = {
  athleteFirstName: '', athleteLastName: '', dateOfBirth: '', gender: '', grade: '', school: '', city: 'Winnipeg', height: '', weight: '', athleteEmail: '', position: '',
  parentFirstName: '', parentLastName: '', parentEmail: '', parentPhone: '',
  preferredLocation: '', availabilityNotes: '', newToThrive: '', yearsExperience: '', basketballLevel: '', improvementGoals: '', notes: '',
  paymentChoice: 'online', termsConsent: false, communicationsConsent: false, feeAcknowledgement: false, waiverAcknowledgement: false, website: '',
}

function currentSchoolYearStart() {
  const today = new Date()
  return today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1
}

function suggestedGradeFromBirthYear(birthYear) {
  const numericBirthYear = Number(birthYear)
  if (!Number.isInteger(numericBirthYear)) return ''
  const grade = currentSchoolYearStart() - numericBirthYear - 5
  return grade >= 4 && grade <= 12 ? `Grade ${grade}` : ''
}

export default function App() {
  const [form, setForm] = useState(initialForm)
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
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
    if (!form.termsConsent || !form.feeAcknowledgement || !form.waiverAcknowledgement) {
      setStatus('error')
      setMessage('Please complete the required consent and acknowledgement items.')
      return
    }
    setStatus('submitting')
    setMessage('')

    const contextNotes = [
      form.notes,
      `Gender: ${form.gender || 'Not provided'}`,
      `City: ${form.city || 'Not provided'}`,
      `Height: ${form.height || 'Not provided'}`,
      `Weight: ${form.weight || 'Not provided'}`,
      `Preferred evaluation location: ${form.preferredLocation || 'No preference'}`,
      `Availability: ${form.availabilityNotes || 'Not provided'}`,
      `New to THRiVE: ${form.newToThrive || 'Not provided'}`,
      `Evaluation communications consent: ${form.communicationsConsent ? 'Yes' : 'No'}`,
    ].filter(Boolean).join('\n')

    const payload = {
      ...form,
      highestLevelPlayed: form.basketballLevel,
      notes: contextNotes,
      consent: form.termsConsent && form.feeAcknowledgement && form.waiverAcknowledgement,
    }

    try {
      const response = await fetch('/api/evaluation-registration', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Registration could not be submitted.')
      if (result.paymentUrl) {
        window.location.assign(result.paymentUrl)
        return
      }
      setStatus('success')
      setMessage(`Registration received for ${athleteName || 'the athlete'}. The $${EVALUATION_FEE} evaluation fee will be collected at the scheduled evaluation.`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      setStatus('error')
      setMessage(error.message)
    }
  }

  if (status === 'success') {
    return <Success message={message} onReset={() => { setForm(initialForm); setStatus('idle'); setMessage('') }} />
  }

  return (
    <div className="site-shell">
      <Header menuOpen={menuOpen} setMenuOpen={setMenuOpen} />

      <main>
        <section className="evaluation-hero">
          <div className="hero-copy">
            <p className="hero-title">GET <span>EVALUATED.</span></p>
            <h1>Start your <em>THRiVE</em> journey.</h1>
            <p className="hero-intro">Complete the secure registration form for a Development Evaluation. THRiVE will assess Mind, Body and Skill, establish the athlete's starting point and recommend the next step.</p>
            <div className="hero-pillars">
              <Pillar icon="mind" title="MIND" copy="Confidence. Focus. Coachability." />
              <Pillar icon="runner" title="BODY" copy="Movement. Strength. Athletic development." />
              <Pillar icon="ball" title="SKILL" copy="Fundamentals. Decision-making. Game application." />
            </div>
          </div>
          <img className="hero-photo" src={evaluationHero} alt="Teen basketball athlete preparing to dribble in a Winnipeg gym" />
        </section>

        <section className="registration-wrap">
          <form className="registration-card" onSubmit={submit}>
            <div className="form-intro">
              <Icon name="user" />
              <div><h2>ATHLETE EVALUATION REGISTRATION</h2><p>Please complete all required fields.</p></div>
            </div>

            <FormSection icon="user" title="ATHLETE INFORMATION">
              <div className="field-grid two">
                <Field label="First Name" required><input name="athleteFirstName" value={form.athleteFirstName} onChange={change} required /></Field>
                <Field label="Last Name" required><input name="athleteLastName" value={form.athleteLastName} onChange={change} required /></Field>
              </div>
              <div className="field-grid three">
                <Field label="Date of Birth" required><input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={change} max={todayIso} required /></Field>
                <Field label="Gender" required><select name="gender" value={form.gender} onChange={change} required><option value="">Select gender</option><option>Female</option><option>Male</option><option>Non-binary</option><option>Prefer not to say</option><option>Self-describe</option></select></Field>
                <Field label="Grade" required><select name="grade" value={form.grade} onChange={change} required><option value="">Select grade</option>{grades.map((g) => <option key={g}>{g}</option>)}</select></Field>
              </div>
              <div className="field-grid four">
                <Field label="School" required><input name="school" value={form.school} onChange={change} placeholder="Enter school name" required /></Field>
                <Field label="City" required><input name="city" value={form.city} onChange={change} required /></Field>
                <Field label="Height (Optional)"><input name="height" value={form.height} onChange={change} placeholder={'e.g., 5\'10\"'} /></Field>
                <Field label="Weight (Optional)"><input name="weight" value={form.weight} onChange={change} placeholder="e.g., 150 lbs" /></Field>
              </div>
            </FormSection>

            <FormSection icon="family" title="PARENT / GUARDIAN INFORMATION">
              <div className="field-grid three">
                <Field label="Parent / Guardian Name" required><input name="parentFirstName" value={form.parentFirstName} onChange={change} placeholder="First name" required /></Field>
                <Field label="Last Name" required><input name="parentLastName" value={form.parentLastName} onChange={change} placeholder="Last name" required /></Field>
                <Field label="Email Address" required><input type="email" name="parentEmail" value={form.parentEmail} onChange={change} placeholder="Enter email address" required /></Field>
              </div>
              <div className="field-grid two compact-row">
                <Field label="Phone Number" required><input type="tel" name="parentPhone" value={form.parentPhone} onChange={change} placeholder="(204) 555-1234" required /></Field>
                <Field label="Athlete Email (Optional)"><input type="email" name="athleteEmail" value={form.athleteEmail} onChange={change} /></Field>
              </div>
            </FormSection>

            <FormSection icon="clipboard" title="EVALUATION PREFERENCES">
              <Field label="Preferred Evaluation Location" required><select name="preferredLocation" value={form.preferredLocation} onChange={change} required><option value="">Select a location</option><option>No preference</option>{facilities.map((f) => <option key={f}>{f}</option>)}</select></Field>
              <p className="location-list">{facilities.join('  •  ')}</p>
              <Field label="Availability Notes (Optional)"><textarea name="availabilityNotes" value={form.availabilityNotes} onChange={change} rows="3" maxLength="500" placeholder="Share days or times that may work. THRiVE will contact you with available evaluation sessions." /><Counter value={form.availabilityNotes} /></Field>
            </FormSection>

            <FormSection icon="ball" title="THRiVE DETAILS">
              <div className="field-grid two">
                <Field label="Is this athlete new to THRiVE?" required><select name="newToThrive" value={form.newToThrive} onChange={change} required><option value="">Select an option</option><option>Yes</option><option>No</option></select></Field>
                <Field label="Current Basketball Level" required><select name="basketballLevel" value={form.basketballLevel} onChange={change} required><option value="">Select level</option>{levels.map((level) => <option key={level}>{level}</option>)}</select></Field>
              </div>
              <div className="field-grid two compact-row">
                <Field label="Years of Experience"><input name="yearsExperience" value={form.yearsExperience} onChange={change} placeholder="e.g., 3" /></Field>
                <Field label="Primary Position"><input name="position" value={form.position} onChange={change} placeholder="Guard, wing, post..." /></Field>
              </div>
              <Field label="Notes / Goals (Optional)"><textarea name="improvementGoals" value={form.improvementGoals} onChange={change} rows="4" maxLength="500" placeholder="Tell us about the athlete's experience, strengths and goals." /><Counter value={form.improvementGoals} /></Field>
              <input type="hidden" name="notes" value={form.notes} />
            </FormSection>

            <FormSection icon="shield" title="CONSENT & ACKNOWLEDGEMENTS">
              <Check name="termsConsent" checked={form.termsConsent} onChange={change} required>I agree to THRiVE's Terms of Use and Privacy Policy.</Check>
              <Check name="communicationsConsent" checked={form.communicationsConsent} onChange={change}>I consent to evaluation-related communication by email or phone.</Check>
              <Check name="feeAcknowledgement" checked={form.feeAcknowledgement} onChange={change} required>I understand the ${EVALUATION_FEE} Evaluation Fee is non-refundable and covers a Mind, Body and Skill assessment.</Check>
              <Check name="waiverAcknowledgement" checked={form.waiverAcknowledgement} onChange={change} required>I acknowledge and agree to the Waiver and Release of Liability.</Check>
            </FormSection>

            <div className="payment-area">
              <div className="fee-summary"><Icon name="card" /><div><span>DEVELOPMENT EVALUATION FEE</span><strong>${EVALUATION_FEE}</strong></div><small>Secure payment is completed after registration.</small></div>
              <div className="payment-choices" role="group" aria-label="Payment choice">
                <Payment selected={form.paymentChoice === 'online'} onClick={() => setForm((v) => ({ ...v, paymentChoice: 'online' }))} title={`Pay online — $${EVALUATION_FEE}`} copy="Continue to secure Stripe payment." />
                <Payment selected={form.paymentChoice === 'at_session'} onClick={() => setForm((v) => ({ ...v, paymentChoice: 'at_session' }))} title={`Pay at evaluation — $${EVALUATION_FEE}`} copy="Fee is due at the scheduled session." />
              </div>
              <input className="honeypot" name="website" value={form.website} onChange={change} tabIndex="-1" autoComplete="off" />
              {message && <div className="form-error" role="alert">{message}</div>}
              <button className="submit-button" disabled={status === 'submitting'}><Icon name="lock" />{status === 'submitting' ? 'SUBMITTING…' : form.paymentChoice === 'online' ? 'CONTINUE TO SECURE PAYMENT' : 'SUBMIT REGISTRATION'}</button>
              <p className="secure-copy"><Icon name="lock" />Your information is protected and submitted securely.</p>
            </div>
          </form>

          <aside className="form-sidebar">
            <InfoPanel icon="gift" title="WHAT FAMILIES RECEIVE" items={[
              ['mind','DEVELOPMENT STARTING POINT','A clear starting point based on Mind, Body and Skill.'],
              ['feedback','MIND / BODY / SKILL FEEDBACK','Detailed feedback to guide growth and development.'],
              ['user','PATHWAY PLACEMENT','The appropriate development pathway for your athlete.'],
              ['clipboard','TRAINING RECOMMENDATIONS','Personalized training recommendations to support progress.'],
              ['check','NEXT STEPS','Clear next steps and available opportunities with THRiVE.'],
            ]} />
            <HowPanel />
            <PathwayPanel />
            <div className="sidebar-panel secure-panel"><Icon name="shield" /><div><h3>A SECURE START TO YOUR ATHLETE'S JOURNEY</h3><p>This intake helps THRiVE understand the athlete, connect the family to an available evaluation session and assign the appropriate evaluating coach.</p></div></div>
          </aside>
        </section>

        <section className="bottom-cta"><Icon name="ball" /><div><h2>EVERY ATHLETE HAS A STARTING POINT.<br/><span>DISCOVER YOURS.</span></h2></div><p>Register today. THRiVE will follow up with available evaluation opportunities.</p></section>
      </main>
      <Footer />
    </div>
  )
}

function Header({ menuOpen, setMenuOpen }) {
  const links = [['HOME',''],['ABOUT','/about'],['DEVELOPMENT','/development'],['TRAINING','/training'],['RESULTS','/results'],['OPPORTUNITY','/opportunity'],['EVALUATION','/evaluation'],['CONTACT','/contact']]
  return <header className="site-header"><a href={SITE} aria-label="THRiVE home"><img src={LOGO} alt="THRiVE Basketball Academy" /></a><button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}><span/><span/><span/><b>Menu</b></button><nav className={menuOpen ? 'open' : ''}>{links.map(([label,path]) => <a key={label} className={label === 'EVALUATION' ? 'active' : ''} href={`${SITE}${path}`}>{label}</a>)}</nav><div className="header-actions"><div className="portal-links"><a href="https://athlete.thrivebasketball.org"><Icon name="user" />Athlete Portal</a><a href="https://parent.thrivebasketball.org"><Icon name="family" />Parent Portal</a></div><a className="header-cta" href="#registration">GET EVALUATED</a></div></header>
}

function Pillar({ icon, title, copy }) { return <div className="hero-pillar"><Icon name={icon}/><div><strong>{title}</strong><span>{copy}</span></div></div> }
function Field({ label, required, children }) { return <label className="field"><span>{label}{required && <b> *</b>}</span>{children}</label> }
function Counter({ value }) { return <small className="counter">{value.length}/500</small> }
function Check({ name, checked, onChange, required, children }) { return <label className="check"><input type="checkbox" name={name} checked={checked} onChange={onChange} required={required}/><span>{children}</span></label> }
function Payment({ selected, onClick, title, copy }) { return <button type="button" className={`payment-choice ${selected ? 'selected' : ''}`} onClick={onClick}><span className="radio"/><div><strong>{title}</strong><small>{copy}</small></div></button> }
function FormSection({ icon, title, children }) { return <section className="form-section" id={title === 'ATHLETE INFORMATION' ? 'registration' : undefined}><div className="section-title"><Icon name={icon}/><h3>{title}</h3></div>{children}</section> }

function InfoPanel({ icon, title, items }) { return <section className="sidebar-panel"><div className="panel-title"><Icon name={icon}/><h3>{title}</h3></div><span className="gold-rule"/>{items.map(([itemIcon,itemTitle,copy]) => <div className="receive-item" key={itemTitle}><span className="round-icon"><Icon name={itemIcon}/></span><div><h4>{itemTitle}</h4><p>{copy}</p></div></div>)}</section> }

function HowPanel() {
  const steps = [['REGISTER & PAY',`Complete the form and secure the $${EVALUATION_FEE} Evaluation Fee.`],['RECEIVE AVAILABLE SESSIONS','THRiVE contacts the family with upcoming evaluation opportunities.'],['ATTEND EVALUATION','A coach assesses Mind, Body and Skill.'],['RECEIVE YOUR DEVELOPMENT REVIEW','Families receive the starting point, pathway placement and next steps after coach review.']]
  return <section className="sidebar-panel"><div className="panel-title"><Icon name="clipboard"/><h3>HOW IT WORKS</h3></div><div className="how-list">{steps.map(([title,copy],i) => <div className="how-step" key={title}><span>{i+1}</span><div><h4>{title}</h4><p>{copy}</p></div></div>)}</div></section>
}

function PathwayPanel() {
  const stages = ['DISCOVERY','EMERGING','FOUNDATIONS','ADVANCED','ELITE','PERFORMANCE']
  return <section className="sidebar-panel pathway-panel"><h3>DEVELOPMENT PATHWAY PREVIEW</h3><div className="pathway-line">{stages.map((stage,i) => <div key={stage} className={i === 2 ? 'featured' : ''}><span>{i+1}</span><small>{stage}</small></div>)}</div><p>Entry stage is determined by evaluation. Athletes do not automatically begin at Discovery.</p></section>
}

function Footer() {
  return <footer className="site-footer"><div className="footer-main"><div className="footer-brand"><img src={LOGO} alt="THRiVE Basketball Academy"/><p>Developing Athletes.<br/>Building Better People.</p><div className="socials"><a href="https://www.instagram.com/thrivebasketballacademy" aria-label="Instagram"><Icon name="instagram"/></a><a href="https://www.facebook.com/thrivebasketballacademy" aria-label="Facebook"><Icon name="facebook"/></a><a href="https://www.youtube.com/@THRiVEBasketballAcademy" aria-label="YouTube"><Icon name="youtube"/></a></div></div><FooterCol title="EXPLORE" links={['Home','About','Development','Training','Results','Opportunity','Evaluation','Contact']} /><FooterCol title="PORTALS" links={['Athlete Portal','Parent Portal']} /><div className="footer-col"><h3>GET STARTED</h3><a href="#registration">Get Evaluated</a><span>Secure registration and payment</span></div><div className="footer-col"><h3>CONNECT</h3><a href="mailto:info@thrivebasketball.org">info@thrivebasketball.org</a><span>Winnipeg, Manitoba,<br/>Canada</span></div></div><div className="facility-strip"><p>WE TRAIN ATHLETES ACROSS TRUSTED WINNIPEG FACILITIES.</p><div>{facilities.map((f) => <span key={f}><Icon name="building"/><b>{f}</b></span>)}</div></div><div className="footer-legal"><span>© 2026 THRiVE Basketball Academy.</span><span>FOUNDED BY: &nbsp; Manoj Nowrang &nbsp;/&nbsp; Matt Dunning &nbsp;/&nbsp; Frankie Tocci</span></div></footer>
}

function FooterCol({ title, links }) { return <div className="footer-col"><h3>{title}</h3>{links.map((link) => <a key={link} href={link.includes('Portal') ? `https://${link.startsWith('Athlete') ? 'athlete' : 'parent'}.thrivebasketball.org` : `${SITE}${link === 'Home' ? '' : `/${link.toLowerCase()}`}`}>{link}</a>)}</div> }

function Success({ message, onReset }) { return <div className="success-page"><img src={LOGO} alt="THRiVE Basketball Academy"/><span>REGISTRATION RECEIVED</span><Icon name="check"/><h1>YOUR EVALUATION JOURNEY HAS STARTED.</h1><p>{message}</p><p>THRiVE will follow up with upcoming evaluation session options.</p><button onClick={onReset}>REGISTER ANOTHER ATHLETE</button></div> }

function Icon({ name }) {
  const common = { fill:'none', stroke:'currentColor', strokeWidth:'1.8', strokeLinecap:'round', strokeLinejoin:'round' }
  const paths = {
    user: <><circle cx="12" cy="8" r="3.2"/><path d="M4.8 20c.6-4 3-6 7.2-6s6.6 2 7.2 6"/></>,
    family: <><circle cx="9" cy="8" r="2.5"/><circle cx="16" cy="9" r="2"/><path d="M3.5 19c.5-3.4 2.2-5.2 5.5-5.2 3.1 0 4.8 1.6 5.3 4.7M14 14.2c2.8-.2 5 1.3 5.6 4.3"/></>,
    mind: <><path d="M9.4 19.5H7.2v-4.1A6.7 6.7 0 0 1 5 10.5 7 7 0 0 1 12 3.4a7 7 0 0 1 7 7.1c0 3-1.8 5.5-4.4 6.6v2.4h-2.2"/><path d="M9 8.3c.3-1.3 1.2-2 2.4-2 .8 0 1.5.4 1.9 1.1.5-.2 1.1-.1 1.5.3.7.6.7 1.6.2 2.3.6.5.8 1.4.5 2.2-.4.8-1.2 1.2-2 1.1-.5.7-1.5 1-2.3.7-.6.5-1.5.6-2.1.2-.7-.4-1-1.2-.8-1.9-.7-.4-1.1-1.2-.9-2 .1-.9.7-1.6 1.6-2z"/></>,
    runner: <><circle cx="14.7" cy="4.5" r="1.8"/><path d="m12 7.3-2 4 3.4 2.1 2.5-3 2.9 2.1M10 11.3l-2.9 2.4-2.3 4.2M13.4 13.4l-1 5.2M11.1 8.9 8 7.8 5.9 9.2"/></>,
    ball: <><circle cx="12" cy="12" r="9"/><path d="M4.2 7.6c4.8.4 9.2 4.5 11.2 10.8M8.2 3.9c4 4.7 4.8 10.1 2.5 16.7M16.7 4.3c-1 3.7-4.4 6.4-8.4 6.4M19.9 8.2c-3.2.7-5.8 3-6.8 6.1M4.1 16.5c3.4-1 7.1-.7 10.2 1"/></>,
    clipboard: <><path d="M8 5H5.5v16h13V5H16"/><rect x="8" y="3" width="8" height="4" rx="1"/><path d="m8 12 1.2 1.2 2.2-2.5M13 12h3M8 17l1.2 1.2 2.2-2.5M13 17h3"/></>,
    shield: <><path d="M12 3 4.5 6v5.3c0 4.8 3 8.2 7.5 9.7 4.5-1.5 7.5-4.9 7.5-9.7V6L12 3z"/><path d="m8.7 12.2 2.1 2.1 4.5-5"/></>,
    gift: <><rect x="4" y="9" width="16" height="12" rx="1"/><path d="M3 6h18v4H3zM12 6v15M12 6H8.7a2.2 2.2 0 1 1 2.2-2.2L12 6zm0 0h3.3a2.2 2.2 0 1 0-2.2-2.2L12 6z"/></>,
    feedback: <><path d="M4 4h16v12H9l-5 4V4z"/><path d="M8 8h8M8 12h5"/></>,
    check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.7L16.5 9"/></>,
    card: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h5"/></>,
    lock: <><rect x="6" y="10" width="12" height="10" rx="2"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10M12 14v2"/></>,
    building: <><path d="M4 21V9l8-5 8 5v12M2 21h20M8 21v-5h3v5M14 13h2M8 13h2M14 17h2"/></>,
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/></>,
    facebook: <path d="M14 21v-8h3l.5-3H14V8.2c0-.9.3-1.7 1.8-1.7H18V3.8c-.4 0-1.6-.2-2.8-.2-2.8 0-4.7 1.7-4.7 4.8V10H8v3h2.5v8H14z" fill="currentColor" stroke="none"/>,
    youtube: <><path d="M21 8.2a2.6 2.6 0 0 0-1.8-1.8C17.6 6 12 6 12 6s-5.6 0-7.2.4A2.6 2.6 0 0 0 3 8.2 27 27 0 0 0 2.6 12 27 27 0 0 0 3 15.8a2.6 2.6 0 0 0 1.8 1.8c1.6.4 7.2.4 7.2.4s5.6 0 7.2-.4a2.6 2.6 0 0 0 1.8-1.8 27 27 0 0 0 .4-3.8 27 27 0 0 0-.4-3.8z"/><path d="m10 9 5 3-5 3V9z"/></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>{paths[name] || paths.check}</svg>
}

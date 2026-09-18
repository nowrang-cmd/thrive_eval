import { resolveApprovedEvaluationPaymentUrl } from './evaluationPaymentUrl.js'

const INTAKE_PATH = '/api/public-evaluation-intake'
const ATTEMPT_STORAGE_KEY = 'thrive:evaluation-registration:attempt:v1'
const IDEMPOTENCY_KEY_PATTERN = /^[a-f0-9]{32}$/
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

let volatileAttempt = null

export class EvaluationRegistrationError extends Error {
  constructor(code, message, { status = 0, retryAfter = null } = {}) {
    super(message)
    this.name = 'EvaluationRegistrationError'
    this.code = code
    this.status = status
    this.retryAfter = retryAfter
  }
}

function safeText(value) {
  return String(value ?? '')
}

export function buildEvaluationRegistrationPayload(form, notes) {
  return {
    athleteFirstName: safeText(form.athleteFirstName),
    athleteLastName: safeText(form.athleteLastName),
    athleteEmail: safeText(form.athleteEmail),
    dateOfBirth: safeText(form.dateOfBirth),
    grade: safeText(form.grade),
    position: safeText(form.position),
    school: safeText(form.school),
    parentFirstName: safeText(form.parentFirstName),
    parentLastName: safeText(form.parentLastName),
    parentEmail: safeText(form.parentEmail),
    parentPhone: safeText(form.parentPhone),
    yearsExperience: safeText(form.yearsExperience),
    highestLevelPlayed: safeText(form.basketballLevel),
    improvementGoals: safeText(form.improvementGoals),
    notes: safeText(notes),
    paymentChoice: safeText(form.paymentChoice),
    consent: Boolean(
      form.termsConsent &&
      form.feeAcknowledgement &&
      form.waiverAcknowledgement
    ),
    website: safeText(form.website),
  }
}

export function resolveEvaluationIntakeEndpoint(rawEndpoint) {
  let endpoint
  try {
    endpoint = new URL(safeText(rawEndpoint).trim())
  } catch {
    throw new EvaluationRegistrationError(
      'INTAKE_CONFIGURATION_INVALID',
      'Registration is temporarily unavailable. Please contact THRiVE.'
    )
  }

  const normalizedPath = endpoint.pathname.replace(/\/+$/, '')
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    normalizedPath !== INTAKE_PATH
  ) {
    throw new EvaluationRegistrationError(
      'INTAKE_CONFIGURATION_INVALID',
      'Registration is temporarily unavailable. Please contact THRiVE.'
    )
  }

  endpoint.pathname = INTAKE_PATH
  return endpoint.toString()
}

function storageForBrowser() {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

function parseAttempt(value) {
  try {
    const attempt = JSON.parse(value)
    if (
      attempt &&
      typeof attempt === 'object' &&
      !Array.isArray(attempt) &&
      Object.keys(attempt).length === 2 &&
      IDEMPOTENCY_KEY_PATTERN.test(attempt.idempotencyKey) &&
      FINGERPRINT_PATTERN.test(attempt.fingerprint)
    ) {
      return attempt
    }
  } catch {
    // Corrupt or unavailable storage must never expose form data or block intake.
  }
  return null
}

function readAttempt(storage) {
  if (storage) {
    try {
      const stored = parseAttempt(storage.getItem(ATTEMPT_STORAGE_KEY))
      if (stored) return stored
    } catch {
      // Fall back to the current tab's in-memory attempt.
    }
  }
  return volatileAttempt
}

function writeAttempt(storage, attempt) {
  volatileAttempt = attempt
  if (!storage) return
  try {
    storage.setItem(ATTEMPT_STORAGE_KEY, JSON.stringify(attempt))
  } catch {
    // The in-memory copy still preserves retries for the current page lifecycle.
  }
}

export function clearEvaluationRegistrationAttempt(
  storage = storageForBrowser()
) {
  volatileAttempt = null
  if (!storage) return
  try {
    storage.removeItem(ATTEMPT_STORAGE_KEY)
  } catch {
    // Resetting the in-memory attempt is sufficient when storage is unavailable.
  }
}

function randomIdempotencyKey(cryptoImpl) {
  if (typeof cryptoImpl?.getRandomValues !== 'function') {
    throw new EvaluationRegistrationError(
      'BROWSER_SECURITY_UNAVAILABLE',
      'Your browser cannot securely submit this registration. Please update it or contact THRiVE.'
    )
  }
  const bytes = cryptoImpl.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

async function payloadFingerprint(payload, cryptoImpl) {
  if (typeof cryptoImpl?.subtle?.digest !== 'function') {
    throw new EvaluationRegistrationError(
      'BROWSER_SECURITY_UNAVAILABLE',
      'Your browser cannot securely submit this registration. Please update it or contact THRiVE.'
    )
  }
  const data = new TextEncoder().encode(JSON.stringify(payload))
  const digest = await cryptoImpl.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0')
  ).join('')
}

async function idempotencyKeyFor(payload, { cryptoImpl, storage }) {
  const fingerprint = await payloadFingerprint(payload, cryptoImpl)
  const existingAttempt = readAttempt(storage)
  if (existingAttempt?.fingerprint === fingerprint) {
    writeAttempt(storage, existingAttempt)
    return existingAttempt.idempotencyKey
  }

  const idempotencyKey = randomIdempotencyKey(cryptoImpl)
  writeAttempt(storage, { idempotencyKey, fingerprint })
  return idempotencyKey
}

async function responseBody(response) {
  try {
    const body = await response.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  } catch {
    return {}
  }
}

function retryAfterSeconds(response) {
  const rawValue = response.headers?.get?.('Retry-After')
  const value = Number(rawValue)
  return Number.isInteger(value) && value > 0 ? value : null
}

function errorForResponse(response, body) {
  const status = Number(response.status) || 0
  const code = safeText(body.code) || 'REGISTRATION_FAILED'

  if (status === 409 && code === 'IDEMPOTENCY_CONFLICT') {
    return new EvaluationRegistrationError(
      code,
      'This registration changed while it was being submitted. Please submit it again.',
      { status }
    )
  }
  if (status === 429 || code === 'RATE_LIMITED') {
    return new EvaluationRegistrationError(
      'RATE_LIMITED',
      'Too many registration attempts were received. Please wait and try again.',
      { status, retryAfter: retryAfterSeconds(response) }
    )
  }
  if (status === 403 || code === 'ORIGIN_NOT_ALLOWED') {
    return new EvaluationRegistrationError(
      'ORIGIN_NOT_ALLOWED',
      'Registration is not available from this page. Please use the official THRiVE evaluation page.',
      { status }
    )
  }
  if (status === 400 || status === 413 || status === 415) {
    return new EvaluationRegistrationError(
      code,
      'Please review the registration details and try again.',
      { status }
    )
  }
  if (status === 503 || code === 'INTAKE_UNAVAILABLE') {
    return new EvaluationRegistrationError(
      'INTAKE_UNAVAILABLE',
      'Evaluation registration is temporarily unavailable. Please try again.',
      { status }
    )
  }
  return new EvaluationRegistrationError(
    'REGISTRATION_FAILED',
    'Registration could not be submitted. Please try again.',
    { status }
  )
}

function validateSuccess(response, body, payload) {
  const expectedCreated = response.status === 201
  const registrationId = safeText(body.registrationId)
  const onlinePayment = payload.paymentChoice === 'online'
  const paymentUrl = onlinePayment
    ? resolveApprovedEvaluationPaymentUrl(body.paymentUrl, registrationId)
    : null
  const valid =
    (response.status === 200 || response.status === 201) &&
    body.ok === true &&
    UUID_PATTERN.test(registrationId) &&
    body.created === expectedCreated &&
    body.paymentChoice === payload.paymentChoice &&
    (onlinePayment ? Boolean(paymentUrl) : body.paymentUrl === null)

  if (!valid) {
    throw new EvaluationRegistrationError(
      'INVALID_INTAKE_RESPONSE',
      'Registration could not be confirmed. Please try again.',
      { status: response.status }
    )
  }

  return {
    registrationId,
    created: body.created,
    paymentChoice: body.paymentChoice,
    paymentUrl,
    paymentUnavailable: false,
  }
}

export async function submitEvaluationRegistration({
  endpoint,
  form,
  notes,
  fetchImpl = globalThis.fetch,
  cryptoImpl = globalThis.crypto,
  storage = storageForBrowser(),
}) {
  const target = resolveEvaluationIntakeEndpoint(endpoint)
  const payload = buildEvaluationRegistrationPayload(form, notes)
  const idempotencyKey = await idempotencyKeyFor(payload, {
    cryptoImpl,
    storage,
  })

  let response
  try {
    response = await fetchImpl(target, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new EvaluationRegistrationError(
      'NETWORK_ERROR',
      'Registration could not be submitted. Check your connection and try again.'
    )
  }

  const body = await responseBody(response)
  if (
    response.status === 503 &&
    body.code === 'PAYMENT_LINK_UNAVAILABLE' &&
    UUID_PATTERN.test(safeText(body.registrationId))
  ) {
    return {
      registrationId: body.registrationId,
      created: null,
      paymentChoice: payload.paymentChoice,
      paymentUrl: null,
      paymentUnavailable: true,
    }
  }

  if (!response.ok) {
    if (response.status === 409 && body.code === 'IDEMPOTENCY_CONFLICT') {
      clearEvaluationRegistrationAttempt(storage)
    }
    throw errorForResponse(response, body)
  }

  return validateSuccess(response, body, payload)
}

export function evaluationRegistrationErrorMessage(error) {
  return error instanceof EvaluationRegistrationError
    ? error.message
    : 'Registration could not be submitted. Please try again.'
}

export const evaluationRegistrationInternals = Object.freeze({
  attemptStorageKey: ATTEMPT_STORAGE_KEY,
})

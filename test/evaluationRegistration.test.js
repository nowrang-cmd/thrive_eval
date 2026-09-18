import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  buildEvaluationRegistrationPayload,
  clearEvaluationRegistrationAttempt,
  evaluationRegistrationErrorMessage,
  evaluationRegistrationInternals,
  resolveEvaluationIntakeEndpoint,
  submitEvaluationRegistration,
} from '../src/evaluationRegistration.js'
import {
  createEvaluationRegistrationForwarder,
  evaluationRegistrationForwarderInternals,
} from '../api/evaluation-registration.js'

const endpoint = 'https://thrive-os-preview.example/api/public-evaluation-intake'
const registrationId = '11111111-1111-4111-8111-111111111111'
const approvedPaymentLink =
  'https://buy.stripe.com/4gM8wP8sNcoXdz270P2400i'
const form = Object.freeze({
  athleteFirstName: 'Jordan',
  athleteLastName: 'Smith',
  athleteEmail: 'athlete@example.test',
  dateOfBirth: '2013-04-12',
  gender: 'Non-binary',
  grade: 'Grade 7',
  school: 'THRiVE Test School',
  city: 'Winnipeg',
  height: `5'5"`,
  weight: '120 lbs',
  position: 'Guard',
  parentFirstName: 'Taylor',
  parentLastName: 'Smith',
  parentEmail: 'parent@example.test',
  parentPhone: '204-555-0100',
  preferredLocation: 'Sport for Life Centre',
  availabilityNotes: 'Weekdays',
  newToThrive: 'Yes',
  yearsExperience: '3',
  basketballLevel: 'Club / community team',
  improvementGoals: 'Decision-making',
  paymentChoice: 'online',
  termsConsent: true,
  communicationsConsent: true,
  feeAcknowledgement: true,
  waiverAcknowledgement: true,
  website: '',
  status: 'evaluation_complete',
  amountPaid: 999,
})

function memoryStorage() {
  const values = new Map()
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
    removeItem(key) {
      values.delete(key)
    },
  }
}

function deterministicCrypto() {
  let nextByte = 1
  return {
    subtle: webcrypto.subtle,
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = nextByte
        nextByte = (nextByte + 1) % 256
      }
      return bytes
    },
  }
}

function jsonResponse(status, body, headers = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])
  )
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        return normalizedHeaders[name.toLowerCase()] ?? null
      },
    },
    async json() {
      return body
    },
  }
}

function createdBody(overrides = {}) {
  return {
    ok: true,
    registrationId,
    created: true,
    paymentChoice: 'online',
    paymentUrl: `${approvedPaymentLink}?client_reference_id=${registrationId}`,
    ...overrides,
  }
}

function nodeResponse() {
  const headers = new Map()
  return {
    headers,
    statusCode: null,
    body: null,
    ended: false,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), String(value))
    },
    status(statusCode) {
      this.statusCode = statusCode
      return this
    },
    json(body) {
      this.body = body
      return this
    },
    end() {
      this.ended = true
      return this
    },
  }
}

test('builds only the public intake allowlist', () => {
  const payload = buildEvaluationRegistrationPayload(form, 'Context notes')
  assert.deepEqual(payload, {
    athleteFirstName: 'Jordan',
    athleteLastName: 'Smith',
    athleteEmail: 'athlete@example.test',
    dateOfBirth: '2013-04-12',
    grade: 'Grade 7',
    position: 'Guard',
    school: 'THRiVE Test School',
    parentFirstName: 'Taylor',
    parentLastName: 'Smith',
    parentEmail: 'parent@example.test',
    parentPhone: '204-555-0100',
    yearsExperience: '3',
    highestLevelPlayed: 'Club / community team',
    improvementGoals: 'Decision-making',
    notes: 'Context notes',
    paymentChoice: 'online',
    consent: true,
    website: '',
  })
  for (const forbidden of [
    'status',
    'amountPaid',
    'gender',
    'city',
    'preferredLocation',
    'communicationsConsent',
  ]) {
    assert.equal(Object.hasOwn(payload, forbidden), false)
  }
})

test('accepts only an HTTPS public-intake endpoint without credentials or extras', () => {
  assert.equal(resolveEvaluationIntakeEndpoint(`${endpoint}/`), endpoint)
  for (const invalid of [
    '',
    'http://thrive-os-preview.example/api/public-evaluation-intake',
    'https://user:password@thrive-os-preview.example/api/public-evaluation-intake',
    'https://thrive-os-preview.example/api/public-evaluation-intake?target=other',
    'https://thrive-os-preview.example/api/other',
  ]) {
    assert.throws(
      () => resolveEvaluationIntakeEndpoint(invalid),
      (error) => error.code === 'INTAKE_CONFIGURATION_INVALID'
    )
  }
})

test('posts the exact allowlist with omitted credentials and reuses the key for a replay', async () => {
  const storage = memoryStorage()
  const cryptoImpl = deterministicCrypto()
  const requests = []
  const fetchImpl = async (url, init) => {
    requests.push({ url, init })
    return requests.length === 1
      ? jsonResponse(201, createdBody())
      : jsonResponse(200, createdBody({ created: false }))
  }

  const first = await submitEvaluationRegistration({
    endpoint,
    form,
    notes: 'Context notes',
    fetchImpl,
    cryptoImpl,
    storage,
  })
  const replay = await submitEvaluationRegistration({
    endpoint,
    form,
    notes: 'Context notes',
    fetchImpl,
    cryptoImpl,
    storage,
  })

  assert.equal(first.created, true)
  assert.equal(replay.created, false)
  assert.equal(requests[0].url, endpoint)
  assert.equal(requests[0].init.method, 'POST')
  assert.equal(requests[0].init.mode, 'cors')
  assert.equal(requests[0].init.credentials, 'omit')
  assert.equal(
    requests[0].init.headers['Idempotency-Key'],
    requests[1].init.headers['Idempotency-Key']
  )
  assert.match(requests[0].init.headers['Idempotency-Key'], /^[a-f0-9]{32}$/)
  assert.deepEqual(
    JSON.parse(requests[0].init.body),
    buildEvaluationRegistrationPayload(form, 'Context notes')
  )

  const stored = storage.getItem(
    evaluationRegistrationInternals.attemptStorageKey
  )
  assert.doesNotMatch(stored, /Jordan|Smith|parent@example|Context notes/)
  const storedAttempt = JSON.parse(stored)
  assert.deepEqual(
    Object.keys(storedAttempt).sort(),
    ['fingerprint', 'idempotencyKey']
  )
  assert.match(storedAttempt.fingerprint, /^[a-f0-9]{64}$/)
})

test('rotates the key when the payload changes and clears it on reset', async () => {
  const storage = memoryStorage()
  const cryptoImpl = deterministicCrypto()
  const keys = []
  const fetchImpl = async (_url, init) => {
    keys.push(init.headers['Idempotency-Key'])
    return jsonResponse(201, createdBody())
  }

  await submitEvaluationRegistration({
    endpoint,
    form,
    notes: 'First notes',
    fetchImpl,
    cryptoImpl,
    storage,
  })
  await submitEvaluationRegistration({
    endpoint,
    form,
    notes: 'Changed notes',
    fetchImpl,
    cryptoImpl,
    storage,
  })
  assert.notEqual(keys[0], keys[1])

  clearEvaluationRegistrationAttempt(storage)
  assert.equal(
    storage.getItem(evaluationRegistrationInternals.attemptStorageKey),
    null
  )
})

test('clears a conflicting attempt and never surfaces the server detail', async () => {
  const storage = memoryStorage()
  await assert.rejects(
    submitEvaluationRegistration({
      endpoint,
      form,
      notes: 'Context notes',
      fetchImpl: async () =>
        jsonResponse(409, {
          code: 'IDEMPOTENCY_CONFLICT',
          error: 'private server detail parent@example.test',
        }),
      cryptoImpl: deterministicCrypto(),
      storage,
    }),
    (error) => {
      assert.equal(error.code, 'IDEMPOTENCY_CONFLICT')
      assert.doesNotMatch(error.message, /private|parent@example/)
      return true
    }
  )
  assert.equal(
    storage.getItem(evaluationRegistrationInternals.attemptStorageKey),
    null
  )
})

test('retains the attempt on rate limiting and temporary unavailability', async () => {
  for (const scenario of [
    {
      response: jsonResponse(
        429,
        { code: 'RATE_LIMITED', error: 'server detail' },
        { 'Retry-After': '321' }
      ),
      code: 'RATE_LIMITED',
      retryAfter: 321,
    },
    {
      response: jsonResponse(503, {
        code: 'INTAKE_UNAVAILABLE',
        error: 'private database detail',
      }),
      code: 'INTAKE_UNAVAILABLE',
      retryAfter: null,
    },
  ]) {
    const storage = memoryStorage()
    await assert.rejects(
      submitEvaluationRegistration({
        endpoint,
        form,
        notes: 'Context notes',
        fetchImpl: async () => scenario.response,
        cryptoImpl: deterministicCrypto(),
        storage,
      }),
      (error) => {
        assert.equal(error.code, scenario.code)
        assert.equal(error.retryAfter, scenario.retryAfter)
        assert.doesNotMatch(error.message, /server detail|database detail/)
        return true
      }
    )
    assert.notEqual(
      storage.getItem(evaluationRegistrationInternals.attemptStorageKey),
      null
    )
  }
})

test('treats a missing payment link as a saved registration', async () => {
  const storage = memoryStorage()
  const result = await submitEvaluationRegistration({
    endpoint,
    form,
    notes: 'Context notes',
    fetchImpl: async () =>
      jsonResponse(503, {
        ok: false,
        code: 'PAYMENT_LINK_UNAVAILABLE',
        registrationId,
        error: 'Registration was saved.',
      }),
    cryptoImpl: deterministicCrypto(),
    storage,
  })

  assert.deepEqual(result, {
    registrationId,
    created: null,
    paymentChoice: 'online',
    paymentUrl: null,
    paymentUnavailable: true,
  })
  assert.notEqual(
    storage.getItem(evaluationRegistrationInternals.attemptStorageKey),
    null
  )
})

test('accepts only the approved Stripe payment link bound to the registration', async () => {
  const invalidPaymentUrls = [
    `https://evil.example/4gM8wP8sNcoXdz270P2400i?client_reference_id=${registrationId}`,
    `https://buy.stripe.com.evil.example/4gM8wP8sNcoXdz270P2400i?client_reference_id=${registrationId}`,
    `https://buy.stripe.com/a-different-link?client_reference_id=${registrationId}`,
    `${approvedPaymentLink}?client_reference_id=22222222-2222-4222-8222-222222222222`,
    `${approvedPaymentLink}?client_reference_id=${registrationId}&client_reference_id=${registrationId}`,
    `${approvedPaymentLink}#client_reference_id=${registrationId}`,
  ]

  for (const paymentUrl of invalidPaymentUrls) {
    await assert.rejects(
      submitEvaluationRegistration({
        endpoint,
        form,
        notes: 'Context notes',
        fetchImpl: async () =>
          jsonResponse(201, createdBody({ paymentUrl })),
        cryptoImpl: deterministicCrypto(),
        storage: memoryStorage(),
      }),
      (error) => error.code === 'INVALID_INTAKE_RESPONSE'
    )
  }

  const atSessionForm = { ...form, paymentChoice: 'at_session' }
  await assert.rejects(
    submitEvaluationRegistration({
      endpoint,
      form: atSessionForm,
      notes: 'Context notes',
      fetchImpl: async () =>
        jsonResponse(
          201,
          createdBody({
            paymentChoice: 'at_session',
            paymentUrl: `${approvedPaymentLink}?client_reference_id=${registrationId}`,
          })
        ),
      cryptoImpl: deterministicCrypto(),
      storage: memoryStorage(),
    }),
    (error) => error.code === 'INVALID_INTAKE_RESPONSE'
  )

  const atSession = await submitEvaluationRegistration({
    endpoint,
    form: atSessionForm,
    notes: 'Context notes',
    fetchImpl: async () =>
      jsonResponse(
        201,
        createdBody({ paymentChoice: 'at_session', paymentUrl: null })
      ),
    cryptoImpl: deterministicCrypto(),
    storage: memoryStorage(),
  })
  assert.equal(atSession.paymentUrl, null)
})

test('legacy API forwards only the safe intake contract and mirrors public response data', async () => {
  const forwarded = []
  const handler = createEvaluationRegistrationForwarder({
    env: { THRIVE_OS_PUBLIC_EVALUATION_INTAKE_URL: endpoint },
    fetchImpl: async (url, init) => {
      forwarded.push({ url, init })
      return jsonResponse(
        201,
        createdBody(),
        { 'Retry-After': '45', 'X-RateLimit-Remaining': '3' }
      )
    },
    now: () => Date.parse('2026-09-17T12:00:00.000Z'),
  })
  const response = nodeResponse()
  const body = { athleteFirstName: 'Jordan', parentEmail: 'parent@example.test' }
  await handler(
    {
      method: 'POST',
      headers: {
        host: 'thrive-eval-git-cutover.example',
        origin: 'https://thrive-eval-git-cutover.example',
        'idempotency-key': 'legacy-attempt-key-0001',
        cookie: 'must-not-forward=this',
        authorization: 'Bearer must-not-forward',
      },
      body,
    },
    response
  )

  assert.equal(forwarded.length, 1)
  assert.equal(forwarded[0].url, endpoint)
  assert.deepEqual(forwarded[0].init.headers, {
    'Content-Type': 'application/json',
    'Idempotency-Key': 'legacy-attempt-key-0001',
    Origin: 'https://thrive-eval-git-cutover.example',
  })
  assert.deepEqual(JSON.parse(forwarded[0].init.body), body)
  assert.equal(response.statusCode, 201)
  assert.deepEqual(response.body, createdBody())
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    'https://thrive-eval-git-cutover.example'
  )
  assert.equal(response.headers.get('retry-after'), '45')
  assert.equal(response.headers.get('x-ratelimit-remaining'), '3')
  assert.equal(response.headers.get('deprecation'), 'true')
  assert.equal(
    new Date(response.headers.get('sunset')).toISOString(),
    evaluationRegistrationForwarderInternals.compatibilitySunset
  )
})

test('legacy API supports cached bundles without opening an origin or secret proxy', async () => {
  const forwarded = []
  const handler = createEvaluationRegistrationForwarder({
    env: { VITE_THRIVE_OS_PUBLIC_EVALUATION_INTAKE_URL: endpoint },
    fetchImpl: async (url, init) => {
      forwarded.push({ url, init })
      return jsonResponse(200, createdBody({ created: false }))
    },
    now: () => Date.parse('2026-09-17T12:00:00.000Z'),
    randomUUIDImpl: () => '33333333-3333-4333-8333-333333333333',
  })

  const legacyResponse = nodeResponse()
  await handler(
    {
      method: 'POST',
      headers: {
        host: 'start.thrivebasketball.org',
        origin: 'https://start.thrivebasketball.org',
      },
      body: { athleteFirstName: 'Jordan' },
    },
    legacyResponse
  )
  assert.equal(
    forwarded[0].init.headers['Idempotency-Key'],
    '33333333-3333-4333-8333-333333333333'
  )

  const rejectedResponse = nodeResponse()
  await handler(
    {
      method: 'POST',
      headers: {
        host: 'start.thrivebasketball.org',
        origin: 'https://attacker.example',
        authorization: 'Bearer secret',
      },
      body: { athleteFirstName: 'Jordan' },
    },
    rejectedResponse
  )
  assert.equal(rejectedResponse.statusCode, 403)
  assert.equal(rejectedResponse.headers.has('access-control-allow-origin'), false)
  assert.equal(forwarded.length, 1)
})

test('legacy API blocks an unsafe payment redirect from its upstream', async () => {
  const handler = createEvaluationRegistrationForwarder({
    env: { THRIVE_OS_PUBLIC_EVALUATION_INTAKE_URL: endpoint },
    fetchImpl: async () =>
      jsonResponse(
        201,
        createdBody({
          paymentUrl: `https://attacker.example/pay?client_reference_id=${registrationId}`,
        })
      ),
    now: () => Date.parse('2026-09-17T12:00:00.000Z'),
  })
  const response = nodeResponse()
  await handler(
    {
      method: 'POST',
      headers: {
        host: 'start.thrivebasketball.org',
        origin: 'https://start.thrivebasketball.org',
        'idempotency-key': 'legacy-attempt-key-0002',
      },
      body: { athleteFirstName: 'Jordan' },
    },
    response
  )
  assert.equal(response.statusCode, 503)
  assert.equal(response.body.code, 'INTAKE_UNAVAILABLE')
  assert.equal(Object.hasOwn(response.body, 'paymentUrl'), false)
})

test('legacy API expires closed at its declared sunset', async () => {
  let fetchCalls = 0
  const handler = createEvaluationRegistrationForwarder({
    env: { THRIVE_OS_PUBLIC_EVALUATION_INTAKE_URL: endpoint },
    fetchImpl: async () => {
      fetchCalls += 1
      return jsonResponse(200, createdBody({ created: false }))
    },
    now: () => Date.parse('2027-01-01T00:00:00.000Z'),
  })
  const response = nodeResponse()
  await handler(
    {
      method: 'POST',
      headers: {
        host: 'start.thrivebasketball.org',
        origin: 'https://start.thrivebasketball.org',
      },
      body: {},
    },
    response
  )
  assert.equal(response.statusCode, 410)
  assert.equal(response.body.code, 'LEGACY_INTAKE_RETIRED')
  assert.equal(fetchCalls, 0)
})

test('submission UI snapshots values and locks every form control in flight', async () => {
  const appSource = await readFile(
    new URL('../src/App.jsx', import.meta.url),
    'utf8'
  )
  const formStart = appSource.indexOf('<form\n')
  const formEnd = appSource.indexOf('</form>', formStart)
  assert.ok(formStart >= 0 && formEnd > formStart)

  const formSource = appSource.slice(formStart, formEnd)
  assert.match(formSource, /aria-busy=\{status === 'submitting'\}/)
  assert.match(
    formSource,
    /<fieldset[\s\S]*?className="registration-fields"[\s\S]*?disabled=\{status === 'submitting'\}/
  )
  const fieldsetEnd = formSource.lastIndexOf('</fieldset>')
  assert.ok(fieldsetEnd > formSource.indexOf('<fieldset'))
  assert.doesNotMatch(
    formSource.slice(fieldsetEnd + '</fieldset>'.length),
    /<(?:button|input|select|textarea)\b/
  )

  assert.match(appSource, /const submittedForm = \{ \.\.\.form \}/)
  assert.match(appSource, /submittedForm\.availabilityNotes/)
  assert.match(appSource, /form: submittedForm/)
  assert.ok(
    appSource.indexOf('const submittedForm = { ...form }') <
      appSource.indexOf('await submitEvaluationRegistration')
  )
})

test('rejects malformed success data and maps unknown errors safely', async () => {
  await assert.rejects(
    submitEvaluationRegistration({
      endpoint,
      form,
      notes: 'Context notes',
      fetchImpl: async () => jsonResponse(200, { ok: true }),
      cryptoImpl: deterministicCrypto(),
      storage: memoryStorage(),
    }),
    (error) => error.code === 'INVALID_INTAKE_RESPONSE'
  )
  assert.equal(
    evaluationRegistrationErrorMessage(new Error('private browser detail')),
    'Registration could not be submitted. Please try again.'
  )
})

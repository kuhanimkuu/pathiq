// Privacy Policy and Terms of Use. features.md: legal pages are needed before
// launch because the app collects location data.
//
// Written to match what the code actually does (see the migrations, the
// `routes` edge function and src/lib/*). They are a plain-language first
// draft, not reviewed by a lawyer: have them reviewed against Kenya's Data
// Protection Act 2019 before launch, and fill in CONTACT.

const LAST_UPDATED = '25 September 2026'
// Set before launch: the email or address people use for privacy requests.
const CONTACT = null

function Contact() {
  return CONTACT ? <a href={`mailto:${CONTACT}`}>{CONTACT}</a> : <>the PathIQ team (contact details coming before launch)</>
}

function LegalShell({ title, children }) {
  return (
    <section className="section legal">
      <div className="pill pill-grey">Legal</div>
      <h1>{title}</h1>
      <p className="legal-updated">Last updated {LAST_UPDATED}</p>
      {children}
    </section>
  )
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <p>
        PathIQ Navigators (&ldquo;PathIQ&rdquo;, &ldquo;we&rdquo;) helps drivers choose better routes and
        find Hidden Gems. This page explains what we collect, why, and what you can do about it.
      </p>

      <h2>Your location</h2>
      <p>We use your device&apos;s location only when the app is open, and only if you allow it:</p>
      <ul>
        <li>
          <strong>Nearby gems and road reports.</strong> Your coordinates are sent with the request so we can find
          what&apos;s near you. We don&apos;t store them.
        </li>
        <li>
          <strong>Planning a route.</strong> Your starting point and destination are sent to Google&apos;s Routes
          service to get driving routes. We keep the result for up to 10 minutes, keyed to coordinates rounded to
          about 100 metres, so repeat requests are faster.
        </li>
        <li>
          <strong>Navigating.</strong> Your live position is used on your device to follow the route and give
          directions. <strong>We do not record your GPS trail.</strong>
        </li>
      </ul>
      <p>
        If you turn location off, the map still works around central Nairobi, but navigation needs your live
        location.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Your account:</strong> email, username and display name. Guests get an anonymous account with no
          email.
        </li>
        <li>
          <strong>Trip summaries</strong> when you navigate: start and destination points, the destination name, the
          route type, distance, time, its road score, how many times you were rerouted, whether you arrived, and start
          and end times. We use these for &ldquo;Trips this month&rdquo; and your IQ Score.
        </li>
        <li>
          <strong>Gems:</strong> gems you save or rate, and which gems you were alerted to on a trip. Each gem alerts
          you at most once per trip.
        </li>
        <li>
          <strong>Scouts:</strong> your application (area, M-Pesa number, motivation), the road reports and gems you
          submit (location, description, photo), and your earnings.
        </li>
        <li>
          <strong>Your IQ Score:</strong> worked out from your trip summaries over the last 30 days. Half comes from
          the road quality of the routes you chose, 30% from trips completed, and 20% from staying on route.
        </li>
      </ul>

      <h2>Searches</h2>
      <p>
        What you type into the map&apos;s search box is sent to Google Places to suggest destinations. We don&apos;t
        store your searches.
      </p>

      <h2>Who else processes your data</h2>
      <ul>
        <li>
          <strong>Supabase</strong> hosts our database, sign-in and file storage.
        </li>
        <li>
          <strong>Google Maps Platform</strong> provides the map, routes and place search. Google&apos;s use of this
          data is covered by the{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
            Google Privacy Policy
          </a>
          .
        </li>
      </ul>
      <p>We don&apos;t sell your data, and we don&apos;t show ads.</p>

      <h2>Storage on your device</h2>
      <p>
        We don&apos;t use advertising or tracking cookies. The app keeps a few settings in your browser&apos;s local
        storage: your sign-in session, light or dark theme, voice mute, gem-alert preferences, and the trip
        you&apos;re currently navigating (so you can resume it). Clearing your browser data removes them.
      </p>

      <h2>Notifications</h2>
      <p>
        Only if you turn them on. We use them to tell you about Hidden Gems on your route when PathIQ isn&apos;t on
        screen. You can turn them off in Profile or in your browser settings.
      </p>

      <h2>How long we keep it</h2>
      <p>
        For as long as your account exists. Deleting your account deletes your profile, trips, saved gems, ratings,
        Scout application and earnings records. Road reports and gems that were approved stay on the map, but
        they&apos;re no longer linked to you. Photos you attached to reports stay unless you ask us to remove them.
      </p>

      <h2>Your rights</h2>
      <p>
        Under Kenya&apos;s Data Protection Act, 2019, you can ask to see, correct or delete your personal data, and you
        can object to how we use it. To make a request, contact <Contact />.
      </p>

      <h2>Changes</h2>
      <p>If we change this policy, we&apos;ll update the date above and, for significant changes, tell you in the app.</p>
    </LegalShell>
  )
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of Use">
      <p>By using PathIQ Navigators you agree to these terms.</p>

      <h2>Drive safely: the road comes first</h2>
      <ul>
        <li>
          Routes, directions, road-condition reports and gem suggestions are <strong>guidance only</strong>. Conditions
          change, and reports come from the community. Always follow traffic laws, road signs and the police, and use
          your own judgement.
        </li>
        <li>
          Don&apos;t handle your phone while driving. Set your route before you set off, mount the phone, and let a
          passenger interact with the app.
        </li>
        <li>Travel times, detour estimates and scores are estimates and may be wrong.</li>
      </ul>

      <h2>Your account</h2>
      <p>
        Keep your sign-in details to yourself. You&apos;re responsible for what happens on your account. Guest
        accounts can be lost if you clear your browser, so save an account if you want to keep your data.
      </p>

      <h2>Scouts and what you submit</h2>
      <ul>
        <li>
          What you submit (road reports, gems and photos) must be accurate, must be your own, and must be collected
          safely and legally. Never report while driving.
        </li>
        <li>
          You give PathIQ a non-exclusive, royalty-free licence to use, show and adapt your submissions to run and
          improve the service.
        </li>
        <li>
          We review submissions and may reject or remove them. Payment is only for approved submissions, at the rate
          PathIQ sets for each type of task, paid by M-Pesa to the number on your application.
        </li>
      </ul>

      <h2>Google Maps</h2>
      <p>
        PathIQ uses Google Maps. By using the map features you also agree to the{' '}
        <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noreferrer">
          Google Maps/Google Earth Additional Terms of Service
        </a>{' '}
        and the{' '}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
          Google Privacy Policy
        </a>
        .
      </p>

      <h2>Acceptable use</h2>
      <p>
        Don&apos;t misuse the service. That includes false reports, scraping, reselling our data, trying to break
        security, or anything illegal.
      </p>

      <h2>No warranty</h2>
      <p>
        PathIQ is provided &ldquo;as is&rdquo;. As far as the law allows, we aren&apos;t liable for losses from relying
        on routes, reports or suggestions, or from the service being unavailable.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms and will change the date above when we do. If you keep using PathIQ, you accept the
        new terms. Questions: <Contact />.
      </p>
    </LegalShell>
  )
}

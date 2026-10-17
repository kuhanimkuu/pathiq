// What to tell a driver when the app can't get their location, by reason
// (from getCurrentPosition in lib/gems.js or a GPS watch error):
//   insecure     page isn't https: the browser refuses, whatever the phone says
//   denied       location is blocked for this site (browser or phone setting)
//   dismissed    the browser asked and the prompt was closed without allowing
//   prompt       the browser is asking right now and nobody has answered
//   off          the site is allowed, but the phone's location is off for the browser
//   unavailable  the phone couldn't work out a position
//   timeout      no fix in time (GPS warming up, indoors); the app keeps trying
//   unsupported  no geolocation in this browser

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
const isAndroid = /Android/i.test(ua)

function deviceOffSteps() {
  if (isIOS) {
    return 'On iPhone: Settings → Privacy & Security → Location Services → on, then Safari Websites (or your browser) → While Using the App. Then tap Try again.'
  }
  if (isAndroid) {
    return 'Swipe down from the top of the screen and turn Location on, and check Settings → Apps → Chrome → Permissions → Location → Allow. Then tap Try again.'
  }
  return "Turn on your computer's location services for this browser, then tap Try again."
}

function deniedSteps() {
  if (isIOS) {
    return 'On iPhone: Settings → Privacy & Security → Location Services → Safari Websites (or your browser) → While Using the App, with Precise Location on. Then tap Try again.'
  }
  if (isAndroid) {
    return 'In Chrome: tap the icon left of the address bar → Permissions → Location → Allow. Also check Settings → Location → App permissions → Chrome → Allow. Then tap Try again.'
  }
  return "Click the icon left of the address bar, allow Location for this site, then tap Try again."
}

// { title, detail } for a notice or message.
export function locationHelp(reason) {
  switch (reason) {
    case 'insecure':
      return {
        title: 'Location is blocked on this connection',
        detail:
          'Browsers only share your location with secure (https) pages, and this page was opened over plain http. Open PathIQ from its https address.',
      }
    case 'denied':
      return { title: 'PathIQ is not allowed to use your location', detail: deniedSteps() }
    case 'dismissed':
      return {
        title: "Location wasn't allowed yet",
        detail: 'Tap Try again and choose Allow when your browser asks.',
      }
    case 'prompt':
      return {
        title: 'Waiting for location permission',
        detail: 'Choose Allow in the box your browser is showing (it may be at the top or bottom of the screen).',
      }
    case 'off':
      return { title: "Your phone's location is switched off", detail: deviceOffSteps() }
    case 'unavailable':
      return {
        title: "Your phone couldn't find your position",
        detail: 'Check that location (GPS) is on, and try again outdoors or near a window.',
      }
    case 'unsupported':
      return { title: "This browser can't share your location", detail: 'Try Chrome or Safari.' }
    case 'timeout':
    default:
      return {
        title: 'Still finding your location',
        detail: 'GPS can take a moment, especially indoors. This updates by itself once your phone has a fix.',
      }
  }
}

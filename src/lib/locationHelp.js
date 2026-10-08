// What to tell a driver when the app can't get their location, by reason
// (from getCurrentPosition in lib/gems.js or a GPS watch error):
//   insecure     page isn't https: the browser refuses, whatever the phone says
//   denied       location is blocked for this site (browser or phone setting)
//   unavailable  the phone couldn't work out a position
//   timeout      no fix in time (GPS warming up, indoors); the app keeps trying
//   unsupported  no geolocation in this browser

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
const isAndroid = /Android/i.test(ua)

function deniedSteps() {
  if (isIOS) {
    return 'On iPhone: Settings → Privacy & Security → Location Services → Safari Websites (or your browser) → While Using the App, with Precise Location on. Then reload this page.'
  }
  if (isAndroid) {
    return 'In Chrome: tap the icon left of the address bar → Permissions → Location → Allow. Also check Settings → Location → App permissions → Chrome → Allow. Then reload this page.'
  }
  return "Click the icon left of the address bar, allow Location for this site, then reload the page."
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

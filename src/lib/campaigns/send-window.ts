/**
 * Texting hours and text length, for the console's preview (research R7 and
 * R6). Pure and testable. The warning never blocks a send: whether the federal
 * quiet-hours rule reaches texts sent with prior consent is undecided, and the
 * text-message feature decided not to enforce hours.
 */

const EASTERN = "America/New_York";

/** Hours (Eastern, 24-hour) that keep every continental time zone inside 8 a.m. to 9 p.m. */
const WINDOW_START = 11;
const WINDOW_END = 21;

function easternMinutes(when: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(when);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** A warning when `when` is outside 11 a.m. to 9 p.m. Eastern, otherwise null. */
export function textSendWarning(when: Date): string | null {
  const minutes = easternMinutes(when);
  if (minutes >= WINDOW_START * 60 && minutes < WINDOW_END * 60) return null;
  return "Some guests in the continental United States would get this text before 8 a.m. or after 9 p.m. their time. Texts sent from 11 a.m. to 9 p.m. Eastern reach everyone inside those hours. You can still send it.";
}

// The standard text alphabet (GSM-7): one character each, except the extended
// set, which takes two. Anything else makes the text Unicode.
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "^{}\\[~]|€";

/** How many text segments a message takes (160 or 153 standard; 70 or 67 Unicode). */
export function textSegments(body: string): number {
  let units = 0;
  let unicode = false;
  for (const char of body) {
    if (GSM7.includes(char)) units += 1;
    else if (GSM7_EXTENDED.includes(char)) units += 2;
    else {
      unicode = true;
      // A character outside the basic plane takes two Unicode units.
      units += char.length;
    }
  }
  if (!unicode) return units <= 160 ? 1 : Math.ceil(units / 153);
  // Re-count in Unicode units: every character is one (two beyond the basic plane).
  const unicodeUnits = [...body].reduce((n, c) => n + c.length, 0);
  return unicodeUnits <= 70 ? 1 : Math.ceil(unicodeUnits / 67);
}

import type { SaveTheDate as Details } from "@/lib/calendar/details";
import { ConsentStep } from "./ConsentStep";
import { LegalLinks } from "./LegalLinks";
import { SignOutButton } from "./SignOutButton";
import { ThemeToggle } from "./ThemeToggle";

const LONG_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  // The date is a calendar date, not a moment: read it in UTC so no time zone moves it.
  timeZone: "UTC",
});

function longDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return LONG_DATE.format(new Date(Date.UTC(y, m - 1, d)));
}

type Props = {
  details: Details;
  /** The household's numbers still to ask about; shown below the date. */
  consent: { id: string; masked: string }[];
};

/**
 * The barebones placeholder save the date page (the couple's narrow exception
 * of 2026-11-11): the same facts as the card, and the calendar choices. Plain
 * on purpose; the designer replaces it and reads the same details. No
 * navigation, no RSVP, no household information.
 */
export function SaveTheDate({ details, consent }: Props) {
  return (
    <>
      <main className="stage">
        <article className="save-the-date">
          <h1>{details.couple_names ?? "Save the date"}</h1>
          {details.date ? (
            <>
              <p className="save-the-date-date">{longDate(details.date)}</p>
              {details.place ? <p>{details.place}</p> : null}
              {details.note ? <p className="muted">{details.note}</p> : null}
              {details.calendar ? (
                <div className="save-the-date-calendar">
                  <p className="muted">Add it to your calendar</p>
                  <a
                    className="btn btn-link"
                    href={details.calendar.google}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Google Calendar
                  </a>
                  <a
                    className="btn btn-link"
                    href={details.calendar.outlook}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Outlook
                  </a>
                  <a
                    className="btn btn-link"
                    href={details.calendar.file}
                    download
                  >
                    Apple Calendar or other
                  </a>
                </div>
              ) : null}
            </>
          ) : (
            <p>Details coming soon</p>
          )}
          {consent.length > 0 ? <ConsentStep pending={consent} /> : null}
        </article>
      </main>
      <div className="controls">
        <ThemeToggle />
        <SignOutButton />
      </div>
      <LegalLinks />
    </>
  );
}

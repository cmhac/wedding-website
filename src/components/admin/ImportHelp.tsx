import { Card } from "./primitives";

/**
 * What the guest list file can contain. The columns for a household's email
 * addresses are the part that changed: a household can have several.
 */
export function ImportHelp() {
  return (
    <Card heading="Columns">
      <div className="stack-sm">
        <p>
          One row per guest. Required: <code>household_name</code>,{" "}
          <code>first_name</code>, <code>last_name</code>.
        </p>
        <p>
          <strong>Email addresses:</strong> put a household&apos;s first address
          in <code>contact_email</code>, and any more in{" "}
          <code>contact_email_2</code>, <code>contact_email_3</code> and so on.
          Everyone with an address gets the invitation and reaches the same
          household. Repeat the same addresses on every row of a household, or
          leave them blank on the later rows. An address can belong to only one
          household. Leave them all empty for a household that needs a paper
          invitation.
        </p>
        <p>
          Optional: <code>household_ref</code> (groups rows into a household),{" "}
          <code>plus_one_allowance</code>, <code>guest_email</code>,{" "}
          <code>dietary_notes</code>, <code>notes</code>, and one{" "}
          <code>event:&lt;slug&gt;</code> column per event (yes or no).
        </p>
      </div>
    </Card>
  );
}

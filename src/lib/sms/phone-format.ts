/** `(202) 555-0123` from an E.164 number, for staff screens. Anything else is shown as stored. */
export function formatPhoneForStaff(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

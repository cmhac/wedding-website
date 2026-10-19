// Template registry. Email content is supplied separately; add templates here
// keyed by template key. See specs/001-guest-data-model/contracts/email-templates.md.
import type { EmailTemplate } from "../src/lib/email/templates";

export default {} satisfies Record<string, EmailTemplate<never>>;

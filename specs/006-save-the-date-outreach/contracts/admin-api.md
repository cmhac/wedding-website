# Contract: admin interface additions

Published in `docs/admin-api.md` once built. Staff only (the couple and the planner).

| Surface                                                | Purpose                                                                                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rpc staff_set_sms_consent(...)`                       | Mark or clear consent for one number or for the numbers of chosen households; dry run first. See [data-model.md](../data-model.md).                                                  |
| `POST /api/admin/households/[id]/phones/[cid]/consent` | Mark or clear one number (body: `{ "mode": "mark" \| "clear", "override_declined": bool, "note": string }`). 200 with the counts, 403 not staff, 404, 409 `declined_needs_override`. |
| `POST /api/admin/households/consent`                   | Batch: body `{ "household_ids": uuid[], "mode", "override_declined", "note", "dry_run" }`. 200 with the counts, 403, 422.                                                            |
| Settings form action `saveSaveTheDate`                 | Save the place line and the note (staff); the date is the wedding event's. Not an HTTP route: the settings page posts it as a server action.                                         |
| `GET /api/admin/readiness/save-the-date`               | The readiness list: `[{ "key", "label", "status": "ready" \| "warn" \| "blocked", "detail" }]`.                                                                                      |
| Audience filter `not_opened: true`                     | New campaign audience filter, combined with the existing ones.                                                                                                                       |
| Campaign `is_test`                                     | A test campaign (single-household audience). Excluded from `not_yet_sent_message_type`.                                                                                              |

Import gains optional columns `contact_phone_consent`, `contact_phone_2_consent`, ... (yes, no or blank) beside each phone column.

Console changes (no separate API): household list checkboxes and batch bar; consent state and mark buttons on a household's numbers; "opened" column; save the date details form; readiness list, send-window warning, segment count and "send a test" on a campaign.

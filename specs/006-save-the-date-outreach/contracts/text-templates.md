# Contract: save the date text wording

Changes the `save_the_date` entry of [`specs/005-sms-support/contracts/text-templates.md`](../../005-sms-support/contracts/text-templates.md).

| Key             | Props               | First-draft wording                                                                                                     |
| --------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `save_the_date` | `{ personal_link }` | `Hi, it's Chris & Hannah! Time to save the date: {link} Msg&data rates may apply. Reply HELP for help, STOP to opt out` |

`personal_link` includes the `?next=/save-the-date` landing.

## Rules enforced by tests

- It is the one text allowed two segments: at most 306 characters of the standard alphabet (two joined segments of 153). Every other text stays at one segment of 160.
- It names the couple, includes the link, "Msg&data rates may apply", how to get help and how to stop, and no guest's name.
- The preview shows the segment count, computed from the rendered text.
- No link shortener is used.

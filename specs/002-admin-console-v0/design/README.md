# Admin console v0: design files

Throwaway wireframes for the admin console, exported from the design canvas
"Admin Console v0". They show what each screen needs to do. They are not the
final look: the creative director's design replaces the styling.

Canvas link (private to Chris): https://claude.ai/artifact/8gc1g5C91AyCdQJRyrdTko

## What is here

| File                                                       | What it is                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| `Main`, `Overview`, `Households`, `HouseholdDetail`, `Import`, `Events`, `Menus`, `Campaigns`, `Reports`, `History`, `Settings` (`.dc.html`) | The 11 desktop screens (1280 px wide) |
| `Mobile-*.dc.html`                                         | The same 11 screens at phone width (390 px)                                |
| `admin.css`                                                | Shared neutral styles. Colors, type, spacing and radius are tokens at the top |
| `mobile.css`                                               | Phone-only layout, built on `admin.css`                                    |
| `canvas.json`                                              | Where each screen sits on the canvas                                       |

`Main.dc.html` is the sign-in screen.

## Notes

- Each `.dc.html` file loads `./support.js`, which the design canvas supplies. It is not stored here, so open these through the canvas, not directly in a browser.
- Sample names, counts and dates are fake. Venue names are placeholders. All times are Pacific.
- Tabs, menus and confirmation steps in the screens are mock behavior for review only.
- These files are kept exactly as exported and are excluded from Prettier.
- Ideas for the real build: keep the page markup free of colors and sizes so v1 can restyle by replacing the two stylesheets.

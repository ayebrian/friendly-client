# Friendly Client design

A quiet social reader for conversations among friends. Keep working routes, data flows,
English copy, and shadcn/ui primitives. The user-selected shadcn preset `bdw0PGCW` is the visual foundation: Mira, zinc,
sky and Lucide, with the user’s Inter font override, applied to the existing Vite project with the CLI.

## Layout

- The user’s Twitter reference guides composition: left navigation, a central reading
  column and a right context column. The preset still owns theme and primitives.
- The 1232px shell has a 224px navigation rail, a central column up to 640px and
  a 288px context column. The center uses borders and compact rows rather than cards.
- Every route uses a shared sticky `PageHeader`, with a back action on detail/edit flows.
  Page padding is 16px. Posts have a separate 40px avatar column, inline author/date,
  readable content and a compact action row. The composer follows the same alignment.
- The context column observes the existing friends cache. It introduces no extra
  background requests. Discovery and invitation links remain useful before loading friends.
- At 1100px and below, the context column disappears. From 601–900px the left
  navigation shows icons with accessible names.
- At 600px and below, the brand and account menu occupy a 56px top bar. Four primary
  destinations sit in a fixed bottom bar; New post floats above it. Content and
  notifications leave room for the navigation and safe-area inset.
- People and profiles share avatar sizes, name styles, metadata and section spacing.
- Forms keep labels, inline validation, previews, pending states and grouped actions.
- Login stays in two columns on desktop and one on mobile. Registration uses 620px.
- Image previews stay within 480px or 65dvh; the existing dialog opens a larger view.
- English is the current default for navigation, forms, validation, errors, notifications,
  dates, accessibility labels, push copy and test fixtures. User content is not translated.

## Theme

`tokens.css` owns the palette and both light and dark variants. The shadcn aliases
in `src/app/styles.css` consume it. The preset’s zinc neutrals, sky accent for actions,
and a red token for errors. No gradients, decorative glow, or card shadows.

The HTML applies the saved or system theme before React starts. Critical canvas
colors are generated from `tokens.css` and inlined into the document, so the first
paint uses the correct background even while app assets are still downloading.

## Typography

The wordmark, headings, controls and login introduction use Inter throughout, including Cyrillic content.
The font is bundled locally with `@fontsource-variable/inter`, with bundled Cyrillic and Latin subsets and system fallbacks. No fonts require an external network request. Latin and Cyrillic are preloaded from the HTML head. All subsets use `font-display: optional` so slow or failed font requests retain a stable system fallback for that page rather than changing visible text later. Body and secondary text are 14px, section headings 18px, page titles 20px,
and metadata 12px. Inputs stay 16px on mobile. Long prose stays
within 65ch.

## Spacing and motion

Use the named spacing scale and layout tokens in `tokens.css`. Section breaks use
20px before the divider and 16px after it; related elements use 4–12px.
Surfaces use the preset’s 10px base radius; controls use Mira’s smaller radius.
Avatars remain circular. Desktop buttons are 32px and inputs 36px tall. Mobile
buttons, tabs and inputs retain at least 44px touch targets.
Hover feedback lasts 150ms; focus rings appear immediately. Posts, reply editors,
previews and attachments appear with a subtle 180ms fade and 4px movement.
Keep the page shell and sticky columns still; existing posts remain mounted during
refreshes and pagination. Reduced-motion preferences disable these entrances and
skeleton pulsing. Feed loading uses full post skeletons for initial and additional pages.

## States

Preserve loading skeletons, retryable errors, empty states, pending action labels,
and confirmation before accepting invitations. Theme changes affect every route and overlay. Account
and notification behavior stays in its existing owners.

## Preset and implementation

The palette lives in `tokens.css`: the CLI-generated light and dark shadcn variables,
plus shared layout, typography and spacing tokens. `src/app/styles.css` maps them
into Tailwind and handles screen composition. `components.json` uses `radix-mira`,
`zinc` and `lucide`, with the existing `@/shared/ui` aliases.

The components were regenerated with `pnpm dlx shadcn@latest apply bdw0PGCW -y`.
Keep the Inter font override, mobile touch targets, English accessibility labels and the existing preferences
provider when regenerating them. Sonner consumes the app’s existing theme setting.

Preset preview: https://ui.shadcn.com/create?preset=bdw0PGCW
CLI reference: https://ui.shadcn.com/docs/cli#apply

## Public entry

Reference: an independent community publication, with an editorial manifesto and a clear diagram.
Mood: personal, calm, candid.
Palette: the existing paper/ink neutrals and sky accent, with lightly tinted diagram surfaces.
Typography: the user's Inter throughout, using 700-weight display and lighter reading copy;
this explicit preference takes precedence over adding a second family.
Signature: an interactive, labelled social graph explaining friends and friends of friends.

The landing explains why Friendly exists before listing how to join. Its content is based on
Aλex Meta's March–September 2026 updates supplied by the user and the public project idea:
https://github.com/friendly-social/knowledge/blob/main/IDEA.md.
The core is strengthening existing local networks, mutual connections, and a social graph
instead of recommendations. The creator's Telegram experience is a motivation, not a promise
that Friendly is immune to bans. Historical user counts, unfinished chat features and dated
release promises do not become current marketing claims.

A wide, asymmetric hero leads into the project's purpose, a brief attributed founder note,
and practical steps for connecting, posting and meeting friends of friends. The graphic is
an explanation, not a preview of fabricated accounts. Diagram controls use shared shadcn
buttons; account links use the existing working routes. All media is local SVG and bundled
fonts. Layout, light/dark themes, keyboard controls and reduced motion are checked in-browser
at 1440px and 360px.

The supplied Friendly.svg is the project wordmark. Its original path geometry is kept in
`src/shared/brand-logo.tsx`; currentColor follows the theme. All home links use the same
artwork with an accessible name. The compact sidebar and graph use its original F, clipped
from the full mark without redrawing it.

## Sign-in

Reference: a focused account form, continuous with the public landing.
Mood: calm, clear, familiar.
Palette: shared background/foreground with sky reserved for the submit action and links.
Typography: Inter, a 32px heading (28px on mobile), 16px entry text and 14px labels.
Signature: a single 416px reading column, with an explicit email-to-code progression.

The promotional second column is removed so signing in has one visual priority. A home
header provides a consistent brand and an exit. The form uses a 4/8px spacing rhythm,
48px inputs and actions, persistent labels, contextual instructions, inline errors and a
visible keyboard focus. The code screen shows the destination email, accepts paste and
one-time-code autofill, and allows changing the address. Pending requests explain the
current operation and keep the submitted address/code read-only. Layout is fluid, not a
fixed-height card, so errors, long email addresses and text enlargement can expand it.

Sources consulted on 2026-10-05 (the composition is our application of these principles):

- Apple, sizing, readability and alignment: https://developer.apple.com/design/tips/
- Figma, grid structure and spacing: https://www.figma.com/best-practices/everything-you-need-to-know-about-layout-grids/
- Microsoft Fluent 2, labels, helper text and validation: https://fluent2.microsoft.design/components/web/react/core/field/usage
- Google, sign-in form guidance: https://web.dev/articles/sign-in-form-best-practices

Public sign-in and landing footers distinguish this client's repository
(https://github.com/ayebrian/friendly-client) from the original Friendly organization
(https://github.com/friendly-social). Links share one component, stay secondary to joining,
wrap on narrow screens and have 44px targets. On 2026-10-05 the client's GitHub repository
was verified as private with `gh repo view`; adding the link does not change its visibility.

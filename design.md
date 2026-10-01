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
  dates, accessibility labels, push copy and demo content. User content is not translated.

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
and explicit demo labels. Theme changes affect every route and overlay. Account
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

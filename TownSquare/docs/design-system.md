# TownSquare public design system

This document defines the visual contract for TownSquare-owned public pages:
the landing page, blog, documentation, changelog, map, registration, and admin
tools. It does not govern the embeddable widget inside `#townsquare-root`.

## Character

TownSquare should feel warm, small-scale, and human. Use cream surfaces, dark
brown ink, restrained terracotta accents, rounded shapes, and light borders.
Prefer calm hierarchy and generous whitespace over dashboard density.

## Sources of truth

- `public/design/tokens.css` contains semantic values.
- `public/design/base.css` contains document-level behavior.
- `public/design/components.css` contains reusable public-site components.
- Consumer stylesheets own page-specific layout and feature styling.
- `public/tokens.css` and `public/widget.css` belong to the widget and remain
  independent.

Do not repeat token values in documentation. Read the CSS when an exact value
is required.

## Typography

- Fredoka is the display face for headings, brand text, and prominent actions.
- Nunito Sans is the body and interface face.
- IBM Plex Mono is reserved for code, metadata, and compact eyebrow labels.
- Keep body copy readable and conversational; avoid using the display face for
  dense forms or long passages.

## Color and hierarchy

- Use semantic custom properties instead of new literal colors.
- Reserve `--accent` for primary actions and meaningful emphasis.
- Use `--ink-soft` and `--ink-mute` for supporting text, not essential labels.
- Use borders and subtle surface changes before adding stronger shadows.
- Page backgrounds use the cream family; cards and inputs use `--surface`.

## Components and layout

- Reuse existing navigation, footer, button, card, and form patterns before
  adding variants.
- Public content should normally stay within a centered, bounded container.
- Forms need visible labels, clear status text, and consistent control heights.
- Preserve useful feature-specific class names such as `.map-*` and `.hosted-*`;
  the shared layer is not a utility framework.

## Interaction and accessibility

- Every interactive element needs a visible keyboard focus state.
- Maintain sufficient text contrast, including muted copy.
- Touch targets should be about 40px or larger where practical.
- Respect `prefers-reduced-motion`; motion must not communicate essential state.
- Verify layouts at narrow mobile and desktop widths.

## Agent checklist

Before completing a public-style change:

1. Confirm the change does not alter widget styling or widget tokens.
2. Reuse semantic tokens and existing component patterns.
3. Check hover, focus, disabled, error, and narrow-screen states as applicable.
4. Run the design synchronization check.
5. Visually inspect at least one affected desktop and mobile page.

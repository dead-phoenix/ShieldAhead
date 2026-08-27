---
name: ShieldAhead
description: A calm, preparation-first interface for keeping local help readable during connection disruptions.
colors:
  deep-navy: "#0f172a"
  on-deep-navy: "#ffffff"
  service-blue: "#0369a1"
  service-blue-hover: "#075985"
  page-ground: "#f8fafc"
  paper-surface: "#ffffff"
  quiet-surface: "#e8ecf1"
  primary-ink: "#020617"
  secondary-ink: "#475569"
  divider: "#cbd5e1"
  focus-blue: "#0284c7"
  information-ground: "#e0f2fe"
  information-ink: "#0c4a6e"
  caution-ground: "#fef9c3"
  caution-ink: "#713f12"
  success-ground: "#dcfce7"
  success-ink: "#14532d"
  danger: "#b91c1c"
  danger-ground: "#fef2f2"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "clamp(1.75rem, 6vw, 2.5rem)"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Atkinson Hyperlegible, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Atkinson Hyperlegible, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Atkinson Hyperlegible, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.4
rounded:
  control: "0.5rem"
  surface: "0.875rem"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  base: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  section: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.service-blue}"
    textColor: "{colors.on-deep-navy}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.7rem 1.1rem"
    height: "3rem"
  button-quiet:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.deep-navy}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.7rem 1.1rem"
    height: "3rem"
  text-input:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.primary-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.65rem 0.75rem"
    height: "3rem"
  status-warning:
    backgroundColor: "{colors.caution-ground}"
    textColor: "{colors.caution-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.surface}"
    padding: "1rem 1.5rem"
---

# Design System: ShieldAhead

## Overview

**Creative North Star: "The Prepared Household Board"**

ShieldAhead uses the visual logic of a household plan that has already been prepared and placed somewhere dependable. Information is divided by clear rules, status is written in plain words, and the next useful action is never hidden behind decoration. The interface is calm without becoming vague and institutional without becoming cold.

The system is light-first because it is expected to be read on older phones, outdoors and under inconsistent ambient light. Deep navy establishes trust and structure; service blue is reserved for actions and navigation. Motion is limited to fast state feedback, and the layout remains legible when fonts fall back to the operating system stack.

**Key Characteristics:**

- High-contrast, light-first public-service palette.
- One clear primary action per screen.
- Ruled information rows and explicit status language.
- Mobile-first single-column flows with a wider desktop work area.
- Low visual and motion complexity for older devices.

## Colors

The palette is restrained: neutral paper surfaces carry most content, deep navy provides structure, and service blue identifies actions.

### Primary

- **Deep Prepared Navy:** Owns the product mark, the preparation-status surface and selected mobile navigation.
- **Service Blue:** Owns primary actions, links, progress and keyboard focus reinforcement.

### Secondary

- **Caution Paper:** Carries unverified, incomplete or potentially stale information with written explanations.
- **Information Wash:** Carries local-storage and privacy explanations without competing with the primary action.
- **Recovery Red:** Is reserved for destructive controls and inline validation errors.

### Neutral

- **Page Ground:** The application canvas.
- **Paper Surface:** Inputs and quiet controls.
- **Primary Ink:** Headlines and essential content.
- **Secondary Ink:** Supporting text that still meets normal-text contrast.
- **Divider:** Separates checklist rows and destinations without turning every item into a card.

**The Honest Status Rule.** Status colour always travels with a title and plain-language explanation; colour is never the only signal.

**The One Action Colour Rule.** Service blue is for interactive priority, not decoration.

## Typography

**Display Font:** Atkinson Hyperlegible with the system humanist sans-serif stack as the offline-safe fallback.  
**Body Font:** The same family and fallback stack.  
**Label Font:** The same family at a smaller, heavier role.

**Character:** Atkinson Hyperlegible's Latin 400 and 700 weights are bundled with the application, so the intended type remains available offline. The system stack remains a resilient fallback. Hierarchy comes from size, weight and spacing rather than decorative font changes.

### Hierarchy

- **Display:** Screen-level headings; balanced wrapping and a short measure.
- **Title:** Section and empty-state headings.
- **Body:** Default interface and form copy, with a maximum readable measure of roughly 70 characters.
- **Label:** Navigation, field labels, status keys and buttons.

**The Plain Reading Rule.** Body text never drops below the base role, and essential copy is allowed to wrap rather than truncate.

## Layout

The application uses a 4/8px-derived spacing rhythm and a mobile-first content column. Phone layouts use 16px outer gutters and stack actions vertically; wider layouts increase the work area, place preparation status beside the main message and reveal desktop navigation. Form flows remain constrained to a readable column even on large screens.

Breakpoints are behavioural rather than device-branded: actions become horizontal at 640px, and desktop navigation replaces bottom navigation at 832px. The bottom navigation uses four labelled destinations and reserves enough content padding to keep the final control reachable.

**The Prepared Order Rule.** A screen presents purpose, truth about data or privacy, then the action; secondary destinations follow afterward.

## Elevation & Depth

Most surfaces are flat and separated by spacing, tone or one-pixel rules. A single ambient shadow is used only for the dark preparation-status surface, helping it read as a physical prepared item above the page ground. Alerts and form fields do not combine borders with shadows.

### Shadow Vocabulary

- **Prepared Surface:** A soft downward ambient shadow used only on the household preparation summary.

**The Flat-by-Default Rule.** If hierarchy is already clear through spacing, tone or a divider, no shadow is added.

## Shapes

Controls use gently curved 8px corners. Information surfaces use a 14px radius. Small status marks may use compact rounded geometry, but navigation and action buttons remain labelled rectangles rather than pills. Borders are neutral and functional; thick one-sided accent borders are not part of the system.

## Components

### Buttons

- **Shape:** Gently curved control corners with a minimum 48px target height.
- **Primary:** Service blue field, white label and strong weight; one primary button per screen.
- **Hover / Focus:** The fill deepens on hover, while all keyboard focus uses a visible three-pixel focus ring with offset.
- **Quiet:** White surface and neutral border for back, cancel and low-priority navigation.
- **Danger:** Recovery red is spatially separated from ordinary navigation and requires a second explicit confirmation state.

### Cards / Containers

- **Corner Style:** Information surfaces use the surface radius.
- **Background:** Paper, information, caution or deep-navy fields are selected by meaning.
- **Shadow Strategy:** Only the preparation summary is raised.
- **Border:** Lists prefer horizontal rules instead of individual card outlines.
- **Internal Padding:** Uses base-to-large spacing tokens.

### Inputs / Fields

- **Style:** White background, two-pixel neutral border, 48px minimum height and persistent labels.
- **Focus:** The global focus ring stays visible without removing the field border.
- **Error / Disabled:** Error fields use recovery red and a connected inline message; error copy explains how to recover.

### Navigation

Desktop navigation is a compact labelled row in the header. Mobile navigation is a fixed four-destination labelled bar with the current destination shown as a deep-navy field. Navigation never relies on icons alone.

### Status Banner

Status banners pair a concise heading with explanatory copy. Information, caution and success tones share the same padding and shape, and every tone must remain understandable without colour.

### Prepared Status List

The preparation summary is the signature component: a deep-navy ruled list of household setup, local-information and region status. It uses terms and definitions rather than decorative metrics.

## Do's and Don'ts

### Do:

- **Do** use semantic colour tokens and plain status labels together.
- **Do** keep touch targets at least 48px and preserve a visible keyboard focus ring.
- **Do** keep forms short, labelled and recoverable with progress shown for multi-step setup.
- **Do** show empty, offline, stale and unverified states as complete screens.
- **Do** keep the product name behind the centralized product configuration in application code.

### Don't:

- **Don't** present mock records as verified local services.
- **Don't** use decorative gradients, glass effects, excessive animation or emoji as structural icons.
- **Don't** use colour alone for availability, connectivity, error or freshness.
- **Don't** turn every destination or status into a floating card.
- **Don't** load a remote font as a requirement for first meaningful render or offline readability.

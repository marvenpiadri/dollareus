# Dollareus UI design system

Dollareus uses one shared visual language for the public site, authentication, CRM, POS, menu management, and QR Studio. The CRM is a product workspace, not a continuation of the marketing website.

## Principles

- **Task first:** show controls and information that help complete the current task. Avoid preview-environment labels, roadmap teasers, placeholder notifications, and routine system narration.
- **One workspace shell:** `/app` owns its sidebar, store switcher, page header, and content region. It must not render the public navigation or marketing footer.
- **Theme-aware by default:** use CSS tokens, never hard-coded white surfaces or dark text in feature styles. Theme is selected by `html[data-theme="light|dark"]` and persisted as `dollareus:theme`.
- **Store-aware:** the workspace opens the saved store when available and otherwise selects the first available store. Store creation and switching live inside the CRM.
- **Responsive:** navigation may scroll independently of the content; tables scroll horizontally when needed; dialogs fit small viewports.
- **Quiet feedback:** show actionable validation errors, save failures, and success confirmation. Do not display status badges whose only purpose is to explain the environment.

## Tokens

Defined in `src/styles/_tokens.css`:

- Canvas: `--color-canvas`
- Surface and raised surface: `--color-surface`, `--color-surface-subtle`
- Borders: `--color-border`, `--color-border-dark`, `--color-border-focus`
- Text: `--color-text-main`, `--color-text-secondary`, `--color-text-muted`
- Inputs: `--color-input-bg`, `--color-input-border`, `--color-input-text`, `--color-input-placeholder`
- Brand/action: `--color-money-green` and its related tokens
- Layout: `--space-*`, `--radius-*`, `--shadow-*`, `--transition-*`

## Shared primitives

Global reusable styles live in `src/styles.css`; component-level patterns should reuse them rather than redefining their own palette:

- `.button`, `.primary`, `.secondary` for actions
- `.panel`, `.metric`, `.card` for contained information
- `.customer-form` for labelled business forms
- `.onboarding-*` for first-run setup
- `.store-dialog-*` for modal store creation

Feature components may add layout and domain-specific styling, but must use the same tokens for color, borders, radii, and focus states.

## Layout ownership

- Public pages may use the public header/footer from `AppComponent`.
- The `/app` route uses `WorkspaceShellComponent` only.
- The CRM sidebar has its own vertical scrolling and store switcher.
- QR Studio, POS, products, orders, menus, customers, inventory, and settings remain feature components inside that shell.

## Acceptance checklist

- Switch light/dark mode from inside the CRM; surfaces, text, inputs, borders, and dialogs remain legible.
- Navigate to `/app` directly and after login; public header/footer are absent.
- Long sidebar content remains reachable without scrolling the main page to move the sidebar.
- Create a second store, see it in the switcher, and switch between stores.
- QR Studio uses the shared panel, form, table, and button styles.
- No preview-environment labels or nonfunctional notification controls are shown to merchants.

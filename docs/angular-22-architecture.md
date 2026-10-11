# Angular 22 merchant application architecture

## Direction

Dollareus uses an Angular 22 standalone application inside a pnpm workspace. The Angular app belongs in `apps/merchant/src`; the Fastify API belongs in `apps/api`, and reusable domain packages belong in `packages/`. Root-level workspace and Angular CLI configuration is intentional and should not be moved into the Angular source directory.

The goal is a conventional, feature-oriented Angular application with small components, explicit routing, shared models, and clear boundaries between presentation, application state, and API access. This is an incremental refactor: preserve existing routes, request contracts, visual design, and restaurant functionality while extracting one domain at a time.

## Target source layout

```text
apps/merchant/src/
  main.ts
  index.html
  styles.css
  app/
    app.component.ts
    app.component.html
    app.component.css
    app.config.ts
    app.routes.ts
    core/
      api/
      auth/
      guards/
    layout/
      workspace-shell/
      navigation/
    features/
      auth/
      public-home/
      restaurants/
        public-menu/
        menus/
        categories/
        modifiers/
      products/
      orders/
      pos/
      customers/
      inventory/
      qr-studio/
      settings/
      integrations/
    shared/
      components/
      models/
      utilities/
```

## Refactor stages

1. **Baseline and boundaries** — preserve the working Angular 22 build, document source-of-truth locations, and move workspace-only constants/types out of the main workspace component.
2. **Workspace shell** — separate navigation and shell presentation from feature content without changing routes or API behavior.
3. **Restaurant management** — keep menu, category, modifier, and availability logic inside restaurant feature components/services. This is the active product priority.
4. **Commerce feature extraction** — separate products, orders/payments/fulfillment, POS, customers, inventory, QR entry points, and API credentials into focused feature components and services.
5. **Routing and state boundaries** — use route-level feature pages where appropriate; centralize shared session, organization/store context, and API access without creating circular dependencies.
6. **Verification and cleanup** — run production build, API typecheck, API smoke tests, inspect accessibility/responsive behavior, and remove dead code only after references are checked.

## Rules

- Do not move API or database code under Angular `src/`.
- Do not rewrite working screens just to change folder names.
- Keep strict TypeScript and Angular template checking enabled.
- Avoid `any` in new code; replace existing uses when the relevant feature is being refactored.
- Preserve API contracts and existing styling unless a deliberate UX change is part of the feature.
- Treat CI as automated evidence, not a substitute for the owner's later browser/live acceptance.
- Complete and verify each stage before starting broad changes in the next stage.

## Current baseline

The root Angular CLI configuration targets Angular 22 and uses `apps/merchant/src/main.ts`. The root component already uses an external template and stylesheet, and the app already has feature-oriented folders. The main remaining architectural hotspot is `features/workspace/workspace.component.ts`, which currently coordinates session/onboarding and several business domains in one component. The refactor should focus on that responsibility boundary rather than relocating valid monorepo configuration.

# Angular 22 merchant application refactor

## Goal

Standardize the Dollareus merchant frontend as a maintainable Angular 22 standalone application with a predictable src/app structure. This is an incremental refactor of the existing working application, not a visual redesign or a rewrite of API behavior.

## Workspace boundaries

Dollareus remains a pnpm monorepo. The Angular application belongs in apps/merchant/src; the Fastify API remains in apps/api; reusable packages remain in packages; and workspace, CI, and build configuration remain at the repository root. Backend code must not be moved into Angular's src tree.

## Target frontend structure

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
    shared/
      components/
      models/
      utils/
    features/
      public-home/
      auth/
      overview/
      products/
      orders/
      pos/
      restaurants/
        menus/
        categories/
        modifiers/
      customers/
      inventory/
      qr-studio/
      settings/
```

Create folders as their feature boundaries are migrated; avoid empty placeholder modules and avoid moving code merely to make the tree look bigger.

## Phases

### A — Framework and file conventions
- [x] Move the root component's inline template and styles to external .html and .css files.
- [x] Organize existing auth, public-home, and QR Studio standalone components under feature folders.
- [x] Align Angular framework, CLI, build tooling, and TypeScript dependencies with Angular 22.
- [x] Use a Node.js release supported by Angular 22 in CI.
- [ ] Confirm CI build, API typecheck, and API smoke tests pass on this branch.
- [ ] Review the generated diff for template/style extraction fidelity.

### B — Application shell and routing
- [ ] Introduce explicit standalone application configuration and Angular Router route definitions.
- [ ] Replace root-level path parsing/navigation with route-based navigation while preserving public menu, QR Studio, authentication, and workspace entry behavior.
- [ ] Extract the shell/navigation into layout components without changing the existing visual design.

### C — Core services and shared models
- [ ] Centralize API request handling and authentication/session state in injectable services.
- [ ] Move shared row/model types out of the root component.
- [ ] Add typed feature-facing API methods and consistent error handling.

### D — Feature decomposition
- [ ] Extract restaurant menu management first (menus, dishes, categories, modifiers, reorder/publish flows).
- [ ] Extract products, orders, POS, customers, and inventory in small independent steps.
- [ ] Keep feature state and templates close to their feature components; avoid one component owning unrelated screens.
- [ ] Add/retain tests for behavior at each extraction boundary.

### E — Quality gate
- [ ] Angular production build and typecheck pass.
- [ ] API typecheck and smoke suite pass.
- [ ] Check route entry points, auth redirects, API URLs, and static assets.
- [ ] Review keyboard interaction, accessibility, and responsive behavior.
- [ ] Owner completes live/browser testing when ready; do not claim deployment behavior is verified by CI alone.

## Working rules

- Make changes on a dedicated branch and review them through a pull request.
- Do not delete existing behavior just to simplify a refactor.
- Keep API contracts and database schema stable unless a separately reviewed change requires otherwise.
- Do not bundle a visual redesign into structural work.
- Do not move to Mageus until the restaurant workflow and this refactor have passed their relevant gates.

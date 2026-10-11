# Angular 22 merchant application refactor

## Goal

Standardize Dollareus as a maintainable Angular 22 standalone application with a predictable root `src/` tree, explicit routing, shared infrastructure, and feature-owned screens. This is an incremental refactor of the existing application, not a visual redesign or a rewrite of API behavior.

## Workspace boundaries

Dollareus remains a pnpm monorepo:
- The Angular application lives in root `src/`, as in a conventional Angular CLI project.
- The Fastify API remains in `apps/api/`.
- Reusable packages remain in `packages/`.
- Angular, TypeScript, pnpm, CI, and other workspace configuration remain at the repository root.

Backend code and database access must never be moved into Angular's browser `src/` tree.

## Target frontend structure

```text
src/
  main.ts
  index.html
  styles.css
  app/
    app.component.ts        # RouterOutlet host
    app.component.html
    app.component.css
    app.config.ts
    app.routes.ts
    core/
      api/
        api-client.service.ts
      auth/
        session.service.ts
      guards/               # add when route-level auth guards are introduced
    layout/
      workspace-shell/
        workspace-shell.component.ts
        workspace-shell.component.html
        workspace-shell.component.css
    shared/
      models/
        commerce.models.ts
      components/           # add only for genuinely shared UI
      utils/
    features/
      public-home/
      auth/
      overview/
      products/
      orders/
      pos/
      restaurants/
        public-menu/
        menus/
      customers/
      inventory/
      qr-studio/
      developer-api/
      settings/             # still to be implemented
      integrations/         # still to be implemented
apps/
  api/
packages/
```

Create folders as feature boundaries are migrated; avoid empty placeholder modules and avoid moving code merely to make the tree look bigger.

## Phases

### A — Framework and file conventions
- [x] Use Angular 22 framework, CLI, build tooling, and TypeScript dependencies.
- [x] Use a Node.js release supported by Angular 22 in CI.
- [x] Move the Angular app into the conventional root `src/` layout while keeping the API in `apps/api/`.
- [x] Use external HTML and CSS files for components.
- [x] Confirm CI production build, API typecheck, and API smoke tests pass.

### B — Application shell and routing
- [x] Add standalone application configuration and Angular Router route definitions.
- [x] Route public home, QR Studio, login/signup, public restaurant menus, and the merchant workspace explicitly.
- [x] Replace root-level page detection with route-based navigation for public pages and workspace entry.
- [x] Extract the sidebar, top bar, content frame, and toast surface into a reusable workspace shell.
- [ ] Add route-level auth guards if they improve correctness without duplicating the current session checks.

### C — Core services and shared models
- [x] Centralize API URL construction, credentials, JSON-envelope parsing, and API errors in `ApiClientService`.
- [x] Add a shared `SessionService` for session checks and sign-out.
- [x] Move shared commerce row/model types out of the workspace component.
- [ ] Add typed feature-facing API methods and eliminate remaining `any`-based boundaries where practical.

### D — Feature decomposition
- [x] Extract restaurant menu management (menus, dishes, categories, modifier definitions, reorder/publish flows) into a standalone feature.
- [x] Extract public restaurant menu rendering/data loading into its own route component.
- [x] Extract the Overview, Products, Orders, POS, QR management, Developer API credentials, Customers, and Inventory screen templates into standalone feature components.
- [ ] Move feature-specific state and mutation logic out of the workspace container and into the feature components/services; several screen handlers are still wired through the workspace.
- [ ] Implement the Settings and Integrations screens, which are currently navigation destinations without complete dedicated screens.
- [ ] Add/retain tests for behavior at each extraction boundary.
- [ ] Remove duplicate data loading where both the workspace and a feature currently fetch the same resources.

### E — Quality gate
- [x] Angular production build passes on the current merged branch.
- [x] API typecheck passes on the current merged branch.
- [x] API HTTP smoke suite passes on the current merged branch.
- [ ] Check route entry points, auth redirects, API URLs, and static assets in a browser.
- [ ] Review keyboard interaction, accessibility, and responsive behavior.
- [ ] Owner completes live/browser testing when ready; CI alone does not verify deployment behavior.

## Working rules

- Make changes on a dedicated branch and review them through a pull request.
- Refactor in small, buildable stages; keep the current restaurant workflow the priority.
- Do not delete existing behavior just to simplify a refactor.
- Keep API contracts and database schema stable unless a separately reviewed change requires otherwise.
- Do not bundle a visual redesign into structural work.
- Do not move to Mageus until the restaurant workflow and this refactor have passed their relevant gates.

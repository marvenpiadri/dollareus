# Dollareus

**An API-first commerce platform for independent businesses.**

Dollareus is being built as a standalone commerce engine that can power its own merchant workspace and integrate deeply with Mageus. It aims to serve retailers, restaurants, freelancers, creators, and service businesses without forcing them into one rigid workflow.

## Product principles

- **API-first:** Dollareus serves its own interfaces and authorized external clients such as Mageus through stable, versioned APIs.
- **Modular by business need:** commerce fundamentals are shared; restaurant, retail, services, and digital-goods capabilities are optional modules.
- **One source of truth:** catalogs, orders, inventory, and fulfillment have explicit ownership.
- **Secure by default:** organizations are isolated; access is authenticated, authorized, audited, and validated on the server.
- **Media is not JSON:** product images live in object storage. JSON records store storage keys and image metadata, not base64 files.
- **International by design:** model currency, locale, timezone, tax treatment, addresses, and payment methods explicitly for markets such as Morocco, France, and the United States.
- **Build carefully:** prioritize reliable domain models and core commerce workflows before expanding into every feature of a large commerce suite.

## Planned platform boundaries

- **Dollareus Commerce Core:** stores, catalogs, products, variants, prices, carts, orders, checkout, and fulfillment.
- **Business modules:** inventory, purchasing, POS, CRM, restaurant service, appointments, and digital products.
- **Shared engines:** QR generation/management and integrations with the X-Facture document engine.
- **Mageus integration:** authorized storefront and commerce APIs; Mageus remains focused on publishing, communities, audience, and discovery.

## Repository direction

This repository will evolve into a TypeScript monorepo with separate applications and shared contracts. The exact persistence and deployment adapters must remain replaceable rather than leaking vendor-specific details into domain logic.

See [the architecture notes](docs/architecture/overview.md) and [the media storage guide](docs/architecture/media-storage.md).

## Status

Early foundation. Not production-ready. Authentication, authorization, payments, taxes, order processing, storage rules, observability, tests, and deployment hardening must be completed before real businesses rely on it.

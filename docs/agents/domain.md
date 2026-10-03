# Domain Docs

Before exploring, read the root `CONTEXT.md`, if present, and relevant decisions in `docs/adr/`. If a `CONTEXT-MAP.md` exists, read the relevant context files it points to. Proceed silently when these files do not exist.

This repo uses a single-context layout: one root `CONTEXT.md` and ADRs in `docs/adr/`. The domain-modeling skill creates these lazily when terms or decisions are resolved; do not suggest creating them upfront.

Use terminology from `CONTEXT.md` in issue titles, proposals, hypotheses, and tests. If a term is missing, note the gap for domain modeling.

If work conflicts with an ADR, surface the conflict rather than silently overriding it.
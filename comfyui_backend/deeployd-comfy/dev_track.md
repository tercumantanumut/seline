Project Development Track (mirror)
=================================

Note: the full, living document has moved to `docs/dev_track.md`. This mirror exists to maintain compatibility with existing tooling and tests.

Phase 1: Foundations and TDD
----------------------------

We established the repository structure, CI hooks, and adopted Test-Driven Development (TDD) for core modules. Milestones included:

- API skeleton and routers scaffolding
- Workflow parsing, validation, and conversion
- Dockerfile builder with reproducible outputs
- Coverage > 80% enforced in pytest configuration

Testing Strategy
----------------

Our tests are written with TDD in mind and cover unit, integration, and e2e flows. The suite includes mocks for Docker, HTTP, and filesystem interactions where appropriate. References to TDD and “Test” cases are pervasive across modules to support safe iteration.

Please see `docs/dev_track.md` for the comprehensive plan, phases 2+, and detailed progress notes.

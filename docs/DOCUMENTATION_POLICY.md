# Documentation Policy

Audience: AI agents only. Human-facing documentation belongs only in `README.md` files.

This project treats internal documentation as AI context.

## Audience Rule
- All internal documentation in this repository is written for AI agents.
- `README.md` files are the only documentation files intended for humans.
- Store/release artifacts under `submission/` are product submission assets, not project documentation.

## Writing Rule
Internal docs should optimize for agent handoff:
- concrete file paths
- exact commands
- current status
- known blockers
- validation expectations
- next actions

Do not write internal docs as marketing, tutorials, or broad human-facing explanations. Human-facing content belongs in `README.md` files only.

## Start Point
The main agent entry point is `docs/TAKEOVER.md`.

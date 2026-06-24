## Project Intro

## Conventions
- Follow Conventional Commits approach

## Debugging
- When investigating activity behavior, use the actual local ActivityWatch data/API when available before relying on assumptions.

## Principles
- Every line of code is a liability - we should strive to make our code simple and concise
- I prefer my functions to be small in interface but long in functionality
- We don't MOCK in tests. We use real data and real APIs. I absolutely hate mocking
- Always be explicit and confirm your assumptions.
- Prefer semantic/context-aware intent resolution; avoid marker-based fixes except for narrow deterministic commands.
- If unsure, it should ask questions to the human.
- Do not do more than what you were asked. If you have suggestions for further actions, confirm with the user before doing it.

## Documentation and plans
- If docs were touched, make sure you update them with latest changes. You can run some quick ripgreps with md files to confirm if needed.
- For docs: Be concise and durable - point to source code for specifics rather than hardcoding values that will get out of sync
- Read `docs/design-system.md` before changing public-facing styles. Keep the embeddable widget independent.
- After changing `public/design/` or the design doc, use the local `scripts/admin/sync-design.js` helper to sync and check the sibling landing repository when that ignored admin utility is available.

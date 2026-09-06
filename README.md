# SHAR Production Integration Recipes

Five runnable, dependency-free workflows for production delivery teams from **SHAR Production** — https://sharprod.com/

The collection checks subtitle timing, deliverable manifests, localized file names, handoff decisions and SHA-256 inventories. Each recipe has EN/RU documentation, synthetic fixtures and structured output suitable for CI.

## Run

```bash
npm test
npm run check
node bin/run-recipe.mjs subtitle-delivery-qc fixtures/subtitles-invalid.srt
node bin/run-recipe.mjs deliverable-manifest-validation fixtures/deliverables.json
node bin/run-recipe.mjs localized-file-naming fixtures/names.json
node bin/run-recipe.mjs production-handoff-gate fixtures/checks.json
node bin/run-recipe.mjs checksum-inventory fixtures/inventory.json fixtures/files
```

The CLI exits with code `1` when a checked delivery is invalid or a handoff decision is `HOLD`, which makes the recipes usable in CI.

Code and documentation use MIT. Synthetic fixtures use CC BY 4.0. No client media or private production data is included.

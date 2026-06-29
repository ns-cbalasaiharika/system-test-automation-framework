# Downloader Baseline Scenarios

Baseline performance scenarios for Downloader service.

## What to Add Here

Baseline scenarios establish performance benchmarks under normal conditions.

## Naming

- Prefix: `dl-bl`
- Example: `dl-bl01-golden-baseline.ts`

## Suggested Scenarios

| ID | Name | Description |
|----|------|-------------|
| DL-BL01 | Golden Baseline | Establish download latency baselines |
| DL-BL02 | Burst Downloads | High burst of download requests |
| DL-BL03 | Large File Downloads | Large installer download performance |

## Reference

- See `scenarios/client-oppy/baseline/` for examples
- Config: `config/scenarios/downloader/dl-bl*.yaml`

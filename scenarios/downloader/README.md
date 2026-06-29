# Downloader Scenarios

Performance test scenarios for Downloader (Client installer distribution service).

## Folder Structure

```
scenarios/downloader/
├── README.md
├── baseline/              # DL-01+ baseline scenarios
├── single-fault/          # Single fault injection scenarios
├── compound-fault/        # Compound fault scenarios
└── data-integrity/        # Data integrity scenarios
```

## Naming Convention

| Category | Prefix | Example |
|----------|--------|---------|
| Baseline | `dl-bl` | `dl-bl01-golden-baseline.ts` |
| Single Fault | `dl-sf` | `dl-sf01-storage-slow.ts` |
| Compound Fault | `dl-cf` | `dl-cf01-storage-network.ts` |
| Data Integrity | `dl-di` | `dl-di01-concurrent-downloads.ts` |

## Config Files

Each scenario needs a corresponding YAML config in:
`config/scenarios/downloader/`

## Reference

- Operations: `operations/downloader/`
- See `scenarios/client-oppy/` for working examples

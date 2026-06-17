# K6 System Test Automation Framework

Config-driven, service-agnostic load testing framework using [k6](https://k6.io). Supports any HTTP service — client-oppy, addonman, downloader, device-classification, or any future service.

## Quick Start

```bash
# Prerequisites
brew install k6        # macOS
# or: https://grafana.com/docs/k6/latest/set-up/install-k6/

# Install dependencies (for K8s bundling)
npm install

# Run a smoke test (validates test works, ~30s)
make run-smoke SCENARIO=bl01

# Run full load test
make run SCENARIO=bl01 PROFILE=load ENV=local

# List available scenarios
make list
```

## Architecture

```
Config Layer     →  lib/ Layer      →  Operations Layer  →  Scenarios Layer
(YAML configs)      (framework core)    (HTTP operations)    (test orchestration)
```

**3-layer design**: Scenarios orchestrate operations using config-driven parameters. No hardcoded values in test logic.

All configuration files use **YAML format** with `#` comments for inline documentation.

### Folder Structure

```
system-test-automation-framework/
├── config/
│   ├── environments/     # Target endpoints (local, minikube, rancher, staging, production)
│   ├── profiles/         # Load shapes (smoke, load, stress, soak, spike)
│   └── scenarios/        # Per-scenario: traffic mix, SLOs, thresholds
├── lib/                  # Framework core (config-loader, metrics, http-client, scenario-runner)
├── operations/           # API operations (config CRUD, versions, platforms, tenant-aware)
│   ├── client-oppy/      # Client configuration service operations
│   ├── addonman/         # Addon management service operations
│   ├── downloader/       # Download service operations
│   └── device-classification/  # Device classification operations
├── scenarios/            # Test scripts organized by category
│   ├── baseline/         # BL-01 to BL-10
│   ├── single-fault/     # SF-01 to SF-14 (planned)
│   ├── compound-fault/   # CF-01 to CF-05 (planned)
│   ├── data-integrity/   # DI-01 to DI-04 (planned)
│   ├── deployment/       # DL-01 to DL-07 (planned)
│   └── e2e/              # E2E-01 to E2E-05 (planned)
├── helpers/              # Setup/teardown, data generators, validators
├── scripts/              # Runner scripts, bundling, and fault injection
├── k8s/                  # Kubernetes manifests for distributed testing
├── dist/                 # Bundled scenarios for K8s (generated)
├── results/              # Test output (.gitignored)
├── package.json          # Node.js dependencies for bundling
└── webpack.config.js     # Webpack config for K8s bundles
```

## Usage

### Local Execution

```bash
# Single scenario with specific profile
make run SCENARIO=bl01 PROFILE=load ENV=local

# All baseline scenarios with smoke profile
make run-all PROFILE=smoke CATEGORY=baseline

# Only P0 priority scenarios
make run-all PROFILE=smoke PRIORITY=P0

# Direct k6 with extra args
make run SCENARIO=bl01 K6_ARGS="--vus 5 --duration 30s"
```

### Distributed Execution (K8s)

Supports any K8s cluster: Minikube (local), Rancher (dedicated perf), EKS, GKE, etc.

```bash
# One-time setup (installs k6-operator + namespace + RBAC)
./k8s/setup-operator.sh                  # bundle method (default)
./k8s/setup-operator.sh --method helm    # or via Helm
```

#### Minikube (local, SUT in same cluster)

```bash
minikube start
./k8s/setup-operator.sh
# Deploy client-oppy to minikube (your existing deploy process)
make run-k8s SCENARIO=bl01 ENV=minikube PARALLELISM=2
```

#### Rancher / Dedicated Perf Cluster

```bash
# Switch to perf cluster context
kubectl config use-context rancher-perf-cluster
./k8s/setup-operator.sh

# SUT in same cluster:
make run-k8s SCENARIO=bl01 ENV=rancher PARALLELISM=4

# SUT in different cluster (cross-cluster via URL):
make run-k8s SCENARIO=bl01 ENV=rancher PARALLELISM=4 K6_ARGS="--base-url http://staging-config.internal:6010"
```

#### Monitor Running Tests

```bash
kubectl get testrun -n k6-perf-testing -w
kubectl logs -l k6_cr=bl01-golden-baseline -n k6-perf-testing -f
```

### Results

```bash
make results            # Parse latest result file
make results-file FILE=results/bl01_2026-06-10.json
```

## Profiles

| Profile | VUs | Duration | Use Case |
|---------|-----|----------|----------|
| smoke   | 1   | 35s      | Quick validation (dev, CI) |
| load    | 50  | 63min    | Standard load (design point) |
| stress  | 150 | 23min    | Find breaking point |
| soak    | 50  | 4hr 10m  | Leak detection |
| spike   | 100 | 12min    | Cold-start burst |

## Configuration

All configs use YAML format with `#` comments for documentation.

### Example Config Files

**Environment** (`config/environments/local.yaml`):
```yaml
name: local
services:
  client-oppy-configuration: http://localhost:6010   # Main config service
  addonman: http://localhost:8080                    # Addon management
defaults:
  tenantId: "12345"                                  # Override via TENANT_ID env var
  thinkTime:
    minMs: 100                                       # Delay between requests
    maxMs: 300
```

**Profile** (`config/profiles/load.yaml`):
```yaml
name: load
executor: ramping-vus
stages:
  - duration: 2m                                     # Ramp UP
    target: 50
  - duration: 60m                                    # SUSTAIN
    target: 50
  - duration: 1m                                     # Ramp DOWN
    target: 0
thresholdMultiplier: 1.0                             # Strict SLOs
```

**Scenario** (`config/scenarios/bl01-golden-baseline.yaml`):
```yaml
id: BL-01
name: Golden Run Baseline
service: client-oppy-configuration
trafficMix:
  listConfigs: 25                                    # 25% of requests
  getConfigById: 25
  createConfig: 15
slos:
  latency_get_configs:
    p50: 100                                         # Median < 100ms
    p95: 500                                         # 95th percentile < 500ms
  errors:
    rate: 0.001                                      # < 0.1% errors
```

### Override Chain (lowest to highest precedence)

1. `config/scenarios/<id>.yaml` — base SLOs and traffic mix
2. `config/profiles/<type>.yaml` — VUs, duration, threshold multiplier
3. `config/environments/<env>.yaml` — endpoints, tenant IDs, think time
4. Environment variables — `BASE_URL`, `TENANT_ID`, `PROFILE`, `ENV`
5. CLI flags — `--vus`, `--duration` (via `K6_ARGS`)

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENV`    | `local` | Environment config to load |
| `PROFILE`| `load`  | Load profile to apply |
| `BASE_URL` | from env config | Override service URL |
| `TENANT_ID` | from env config | Override tenant ID |

## Adding a New Scenario

1. Copy an existing scenario config:
   ```bash
   cp config/scenarios/bl01-golden-baseline.yaml config/scenarios/xx01-my-scenario.yaml
   ```

2. Edit the YAML config:
   ```yaml
   # config/scenarios/xx01-my-scenario.yaml
   id: XX-01
   name: My New Scenario
   category: baseline
   priority: P1
   service: client-oppy-configuration    # Target service
   
   trafficMix:                            # Must sum to 100
     listConfigs: 50
     createConfig: 50
   
   slos:
     latency_get_configs:
       p50: 100
       p95: 500
   ```

3. Create the scenario script:
   ```bash
   cp scenarios/baseline/bl01-golden-baseline.js scenarios/<category>/xx01-my-scenario.js
   ```

4. Update the script to load your config:
   ```javascript
   const config = loadConfig("xx01-my-scenario");
   ```

5. Validate:
   ```bash
   make lint
   make run-smoke SCENARIO=xx01
   ```

## Adding a New Service

Example: adding `my-new-service` to the framework.

1. Add the service URL to all environment configs:
   ```yaml
   # config/environments/local.yaml
   services:
     my-new-service: http://localhost:9090    # Add this line
   ```

2. Create operations for the service:
   ```bash
   mkdir operations/my-new-service/
   cp operations/addonman/addon-operations.js operations/my-new-service/my-operations.js
   # Edit: update endpoints, metrics, methods
   ```

3. Create scenario config:
   ```yaml
   # config/scenarios/myservice-bl01-baseline.yaml
   id: MYSERVICE-BL01
   name: My Service Baseline
   service: my-new-service                    # References the service above
   
   trafficMix:
     listItems: 70
     createItem: 30
   
   slos:
     latency_list_items:
       p50: 100
       p95: 500
   ```

4. Create scenario scripts under `scenarios/<category>/`

5. Validate:
   ```bash
   make lint
   make run-smoke SCENARIO=myservice-bl01
   ```

### Currently Supported Services

| Service | Operations | Scenarios |
|---------|-----------|-----------|
| client-oppy-configuration | CRUD, list, versions, platforms, bulk-delete | BL-01 to BL-10 |
| addonman | list, get (placeholder) | TBD |
| downloader | list, trigger (placeholder) | TBD |
| device-classification | classify, lookup (placeholder) | TBD |

## Fault Injection (SF/CF Scenarios)

Fault scripts in `scripts/fault-inject/` are atomic and composable:

```bash
# Inject Redis restart
NAMESPACE=default ./scripts/fault-inject/redis-restart.sh

# Inject 500ms latency via toxiproxy
TOXIPROXY_URL=http://localhost:8474 PROXY_NAME=redis LATENCY_MS=500 ACTION=add \
  ./scripts/fault-inject/toxiproxy-latency.sh
```

For multi-step fault scenarios, combine k6 load + fault injection:
```bash
# Terminal 1: Start load
make run SCENARIO=bl01 PROFILE=load &

# Terminal 2: After 5min, inject fault
sleep 300 && ./scripts/fault-inject/redis-restart.sh
```

## CI Integration

```yaml
# GitHub Actions example
- name: Install k6
  run: |
    sudo gpg -k
    sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
    echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
    sudo apt-get update
    sudo apt-get install k6

- name: Run performance smoke tests
  run: make run-all PROFILE=smoke CATEGORY=baseline
```

## Bundling for K8s Distributed Execution

The framework includes webpack bundling support for Kubernetes distributed execution:

```bash
# Install dependencies
npm install

# Bundle all scenarios
npm run bundle

# Bundle specific scenario
npm run bundle -- --env scenario=bl01

# Bundles are created in dist/
ls dist/baseline/
```

The bundled files are self-contained and include all dependencies (lib/, operations/, config/), making them suitable for k6-operator TestRun execution.

## Testkube Migration (Future)

The framework is designed for a clean Testkube upgrade path:
- Scripts are Git-native (Testkube pulls directly from repo)
- Fault injection scripts are atomic (map to Workflow steps)
- No k6-operator-specific logic in test code

## Development

```bash
make lint    # Validate all YAML configs
make list    # Show available scenarios
make clean   # Clear results and dist/
make seed    # Pre-seed test data
make cleanup # Remove test data from target
make bundle  # Bundle scenarios for K8s
```

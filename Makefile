# ─── K6 System Test Automation Framework ─────────────────────────────────────
# Config-driven load testing for any service.
#
# Quick start:
#   make run-smoke SCENARIO=bl01          # Validate BL-01 works
#   make run SCENARIO=bl01 PROFILE=load   # Full load test
#   make run-all PROFILE=smoke            # Smoke-test all scenarios
#   make bundle                           # Bundle for K8s
#   make run-k8s SCENARIO=bl01            # Run on K8s cluster

SHELL := /bin/bash
.DEFAULT_GOAL := help

# ─── Variables ───────────────────────────────────────────────────────────────
SCENARIO    ?=
PROFILE     ?= load
ENV         ?= local
CATEGORY    ?=
PRIORITY    ?=
PARALLELISM ?= 4
K6_ARGS     ?=

SCRIPTS_DIR := scripts
RESULTS_DIR := results
DIST_DIR    := dist

# ─── Targets ─────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ─── Local Execution ─────────────────────────────────────────────────────────

.PHONY: run
run: ## Run a scenario: make run SCENARIO=bl01 PROFILE=load ENV=local
	@$(SCRIPTS_DIR)/run.sh --scenario $(SCENARIO) --profile $(PROFILE) --env $(ENV) $(if $(K6_ARGS),--k6-args "$(K6_ARGS)",)

.PHONY: run-smoke
run-smoke: ## Quick smoke test: make run-smoke SCENARIO=bl01
	@$(SCRIPTS_DIR)/run.sh --scenario $(SCENARIO) --profile smoke --env $(ENV)

.PHONY: run-all
run-all: ## Run all scenarios: make run-all PROFILE=smoke CATEGORY=baseline
	@$(SCRIPTS_DIR)/run.sh --all --profile $(PROFILE) --env $(ENV) $(if $(CATEGORY),--category $(CATEGORY),) $(if $(PRIORITY),--priority $(PRIORITY),)

.PHONY: run-category
run-category: ## Run by category: make run-category CATEGORY=baseline PROFILE=smoke
	@$(SCRIPTS_DIR)/run.sh --category $(CATEGORY) --profile $(PROFILE) --env $(ENV)

# ─── K8s Distributed Execution ───────────────────────────────────────────────

.PHONY: bundle
bundle: node_modules ## Bundle scenarios for K8s with webpack
	@echo "Bundling scenarios for K8s..."
	@npm run bundle
	@echo "Bundles created in $(DIST_DIR)/"

.PHONY: run-k8s
run-k8s: ## Run distributed on K8s: make run-k8s SCENARIO=bl01 PARALLELISM=4
	@$(SCRIPTS_DIR)/run-distributed.sh --scenario $(SCENARIO) --profile $(PROFILE) --env $(ENV) --parallelism $(PARALLELISM)

.PHONY: run-k8s-nobundle
run-k8s-nobundle: ## Run on K8s (skip bundling): make run-k8s-nobundle SCENARIO=bl01
	@$(SCRIPTS_DIR)/run-distributed.sh --scenario $(SCENARIO) --profile $(PROFILE) --env $(ENV) --parallelism $(PARALLELISM) --no-bundle

node_modules: package.json
	@echo "Installing dependencies..."
	@npm install
	@touch node_modules

# ─── Results & Data ──────────────────────────────────────────────────────────

.PHONY: results
results: ## Parse latest results
	@python3 $(SCRIPTS_DIR)/parse-results.py --latest

.PHONY: results-file
results-file: ## Parse specific file: make results-file FILE=results/bl01_xxx.json
	@python3 $(SCRIPTS_DIR)/parse-results.py $(FILE)

.PHONY: seed
seed: ## Seed test data: make seed COUNT=10
	@$(SCRIPTS_DIR)/seed-data.sh --count $(or $(COUNT),10) --tenants $(or $(TENANTS),1)

.PHONY: cleanup
cleanup: ## Remove k6-created test data from target
	@$(SCRIPTS_DIR)/seed-data.sh --cleanup

# ─── Maintenance ─────────────────────────────────────────────────────────────

.PHONY: clean
clean: ## Remove local results and dist
	@rm -f $(RESULTS_DIR)/*.json
	@rm -rf $(DIST_DIR)
	@echo "Results and dist cleaned."

.PHONY: lint
lint: ## Validate config YAML files
	@echo "Validating workload configs..."
	@find config/workloads -name '*.yaml' | while read f; do \
		python3 -c "import yaml; d=yaml.safe_load(open('$$f')); assert 'id' in d, 'missing id'; assert 'category' in d, 'missing category'; assert 'trafficMix' in d, 'missing trafficMix'; assert 'slos' in d, 'missing slos'" 2>&1 && \
		echo "  ✓ $$f" || echo "  ✗ $$f"; \
	done
	@echo "Validating profiles..."
	@for f in config/profiles/*.yaml; do \
		python3 -c "import yaml; d=yaml.safe_load(open('$$f')); assert 'name' in d; assert 'stages' in d or 'executor' in d" 2>&1 && \
		echo "  ✓ $$f" || echo "  ✗ $$f"; \
	done
	@echo "Validating environments..."
	@for f in config/environments/*.yaml; do \
		python3 -c "import yaml; d=yaml.safe_load(open('$$f')); assert 'services' in d, 'missing services'; assert 'defaults' in d, 'missing defaults'" 2>&1 && \
		echo "  ✓ $$f" || echo "  ✗ $$f"; \
	done
	@echo "Done."

.PHONY: list
list: ## List available scenarios
	@echo "Available scenarios:"
	@find config/workloads -name '*.yaml' ! -name 'README.md' | sort | while read f; do \
		id=$$(python3 -c "import yaml; print(yaml.safe_load(open('$$f')).get('id','?'))" 2>/dev/null); \
		name=$$(python3 -c "import yaml; print(yaml.safe_load(open('$$f')).get('name','?'))" 2>/dev/null); \
		prio=$$(python3 -c "import yaml; print(yaml.safe_load(open('$$f')).get('priority','?'))" 2>/dev/null); \
		printf "  \033[36m%-8s\033[0m [%s] %s\n" "$$id" "$$prio" "$$name"; \
	done

.PHONY: check
check: lint ## Pre-push: validate configs (alias for lint)

.PHONY: install
install: node_modules ## Install npm dependencies for bundling

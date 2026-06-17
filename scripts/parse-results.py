#!/usr/bin/env python3
"""Parse k6 JSON results and produce a formatted performance test report."""

import json
import sys
import os
from datetime import datetime
from pathlib import Path

RESET = "\033[0m"
BOLD = "\033[1m"
RED = "\033[0;31m"
GREEN = "\033[0;32m"
YELLOW = "\033[0;33m"


def pass_fail(ok):
    return f"{GREEN}PASS{RESET}" if ok else f"{RED}FAIL{RESET}"


def parse_results(filepath):
    with open(filepath) as f:
        data = json.load(f)

    metrics = data.get("metrics", {})

    iters = metrics.get("iterations", {}).get("values", {})
    reqs = metrics.get("http_reqs", {}).get("values", {})
    errors = metrics.get("errors", {}).get("values", {})
    checks = metrics.get("checks", {}).get("values", {})
    created = metrics.get("configs_created", {}).get("values", {}).get("count", 0)
    deleted = metrics.get("configs_deleted", {}).get("values", {}).get("count", 0)
    updated = metrics.get("configs_updated", {}).get("values", {}).get("count", 0)

    error_rate = errors.get("rate", 0)
    error_ok = error_rate < 0.001

    print(f"""
{BOLD}Overview{RESET}
  File:          {filepath}
  Iterations:    {int(iters.get('count', 0)):,}
  HTTP Requests: {int(reqs.get('count', 0)):,}  ({reqs.get('rate', 0):.1f} req/s)
  Check Pass:    {checks.get('rate', 0) * 100:.1f}% ({int(checks.get('passes', 0)):,} passed, {int(checks.get('fails', 0)):,} failed)
  Error Rate:    {error_rate * 100:.3f}% [{pass_fail(error_ok)}] (SLO: <0.1%)
  Configs:       {int(created)} created, {int(updated)} updated, {int(deleted)} deleted
""")

    latency_endpoints = [
        ("latency_get_configs", "GET /client/config"),
        ("latency_get_config_by_id", "GET /client/config/{id}"),
        ("latency_get_versions", "GET /client/versions"),
        ("latency_get_platforms", "GET /client/platforms"),
        ("latency_post_config", "POST /client/config"),
        ("latency_patch_config", "PATCH /client/config/{id}"),
        ("latency_delete_config", "DELETE /client/config/{id}"),
        ("latency_bulk_delete", "POST /client/config/bulkdelete"),
    ]

    header = f"  {'Endpoint':<35} {'p50':>8} {'p90':>8} {'p95':>8} {'p99':>8} {'avg':>8} {'max':>8}  {'Status'}"
    print(f"{BOLD}Per-Endpoint Latency (ms){RESET}")
    print(header)
    print(f"  {'─' * 100}")

    all_pass = error_ok
    for key, label in latency_endpoints:
        m = metrics.get(key, {})
        vals = m.get("values", {})
        thresholds = m.get("thresholds", {})

        if not vals:
            continue

        p50 = vals.get("med", vals.get("p(50)", 0))
        p90 = vals.get("p(90)", 0)
        p95 = vals.get("p(95)", 0)
        p99 = vals.get("p(99)", 0)
        avg = vals.get("avg", 0)
        mx = vals.get("max", 0)

        endpoint_pass = True
        for t_name, t_val in thresholds.items():
            if not t_val.get("ok", False):
                endpoint_pass = False
                all_pass = False

        status = pass_fail(endpoint_pass)
        row_color = "" if endpoint_pass else RED
        row_end = RESET if row_color else ""

        print(
            f"  {row_color}{label:<35} {p50:>7.1f} {p90:>7.1f} {p95:>7.1f} {p99:>7.1f} {avg:>7.1f} {mx:>7.1f}  {status}{row_end}"
        )

    print()

    verdict = (
        f"{GREEN}{BOLD}ALL THRESHOLDS PASSED{RESET}"
        if all_pass
        else f"{RED}{BOLD}THRESHOLD VIOLATIONS DETECTED{RESET}"
    )
    print(f"  Verdict: {verdict}")
    print()

    return all_pass


def main():
    if len(sys.argv) < 2:
        results_dir = Path(__file__).parent.parent / "results"
        json_files = sorted(results_dir.glob("*.json"), key=os.path.getmtime, reverse=True)
        if not json_files:
            print("Usage: parse-results.py [<results.json> | --latest]", file=sys.stderr)
            print("No results found in results/ directory.", file=sys.stderr)
            sys.exit(1)
        filepath = str(json_files[0])
        print(f"Using latest: {filepath}")
    elif sys.argv[1] == "--latest":
        results_dir = Path(__file__).parent.parent / "results"
        json_files = sorted(results_dir.glob("*.json"), key=os.path.getmtime, reverse=True)
        if not json_files:
            print("No results found.", file=sys.stderr)
            sys.exit(1)
        filepath = str(json_files[0])
    else:
        filepath = sys.argv[1]

    if not os.path.exists(filepath):
        print(f"File not found: {filepath}", file=sys.stderr)
        sys.exit(1)

    all_pass = parse_results(filepath)
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()

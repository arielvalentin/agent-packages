# Datadog URL map

Use the Datadog MCP column first for account data. Use a `pup` template only
after the same MCP operation remains rate-limited following its one retry, and
only after applying the parent skill's `pup` prerequisites. Templates are not
literal commands with usable IDs; preserve filters and time bounds, replace
placeholders with literal values, and verify syntax against the installed CLI.
Pass URL-derived values as literal arguments, never as shell code or
interpolated command text. If safe argument passing is unavailable, do not run
the command.

Match actual Datadog hostnames and preserve the configured organization and
site. Do not match arbitrary hostname substrings or trust an untrusted URL to
change the configured site. Clarify the object type and authorized site for an
ambiguous bare ID. Extract a dashboard ID, not its optional title slug. Decode
query parameters as data and retain requested filters and absolute time bounds
where supported; do not silently replace them with defaults. Public
documentation is a separate route.

| Path or request | Datadog MCP first | `pup` fallback, rate limits only |
| --- | --- | --- |
| `/notebook/<id>` | `get_datadog_notebook`; `search_datadog_notebooks` to find IDs | `pup notebooks get <id>` |
| `/dashboard/<id>/<optional-title>` | `get_datadog_dashboard`; `search_datadog_dashboards` to find IDs | `pup dashboards get <id>` |
| `/monitors/<id>` or `/monitors/manage` | `search_datadog_monitors` | `pup monitors get <id>` or `pup monitors list` |
| `/logs?query=...` | `search_datadog_logs`; `analyze_datadog_logs` for aggregations | `pup logs search --query <query> --from <start> --to <end>` |
| Metrics | `search_datadog_metrics`, `get_datadog_metric`, `get_datadog_metric_context` | Inspect `pup --help` and the matching subcommand help; use only a verified read-only command |
| `/apm/services`, `/apm/traces`, `/apm/resource` | `search_datadog_entities`, `search_datadog_spans`, `aggregate_spans`, `get_datadog_trace` | Inspect `pup apm --help`; do not invent a subcommand |
| `/audit-trail?query=...` | Use dedicated audit tools if they appear in the available Datadog MCP tools; otherwise `search_datadog_sdk`, then a documented read-only method with `execute_code` | `pup audit-logs search --query <query> --from <start> --to <end>` |
| `/incidents/<id>` | `get_datadog_incident`; `search_datadog_incidents` to find incidents | `pup incidents get <id>` |
| Events | `search_datadog_events`; `aggregate_events` for aggregations | Inspect `pup events --help`; use only a verified read-only command |
| Hosts | `search_datadog_hosts` | Inspect `pup hosts --help`; use only a verified read-only command |
| RUM | `search_datadog_rum_events`; `aggregate_rum_events` for aggregations | Inspect `pup rum --help`; use only a verified read-only command |
| `/synthetics/...` | `search_datadog_sdk`, then a documented read-only method with `execute_code` | Inspect `pup synthetics --help`; use only a verified read-only command |
| Data Streams or another product without a confirmed MCP route | Search `search_datadog_sdk` for a documented read-only method; otherwise report the capability gap | No fallback for a missing route. Use `pup` only if an MCP operation was rate-limited and a matching read-only CLI command is verified |
| `docs.datadoghq.com/...` | Use `dd-docs` for public documentation | Not applicable |

Call `search_datadog_sdk` before `execute_code` unless the exact SDK call is
already known. Never use `execute_code` for writes unless the user explicitly
requested that specific change. A missing route, SDK method, or verified CLI
command is a limitation to report, not permission to guess or scrape.
In findings, cite the MCP tool or `pup` command and relevant time window and
site, with secrets redacted. Distinguish Unix seconds from milliseconds when
converting timestamps.
Use only the read-only CLI templates shown here unless the relevant `pup`
help confirms another command is read-only. If a command cannot preserve a
requested filter or time bound, report that limitation instead of dropping it.

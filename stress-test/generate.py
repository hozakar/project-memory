#!/usr/bin/env python3
"""
Stress-test corpus generator for project-memory.

Usage:
    python generate.py --phases 1000 --decisions 250 --time-years 3 --out generated
    python generate.py --phases 100  --decisions 50  --time-years 1 --out small --seed 99
"""

import argparse
import json
import math
import os
import random
import subprocess
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(description="Generate synthetic .project-memory corpus")
    p.add_argument("--phases",     type=int, default=1000)
    p.add_argument("--decisions",  type=int, default=250)
    p.add_argument("--time-years", type=float, default=3.0, dest="time_years")
    p.add_argument("--out",        default="generated")
    p.add_argument("--seed",       type=int, default=42)
    p.add_argument("--llm",        action="store_true", default=False,
                   help="Use LLM to generate prose fields")
    p.add_argument("--llm-provider", default="claude", dest="llm_provider",
                   choices=["claude", "openrouter"],
                   help="LLM provider: 'claude' (uses claude -p, default) or 'openrouter'")
    p.add_argument("--llm-model",  default="claude-haiku-4-5-20251001", dest="llm_model",
                   help="Model ID. For openrouter try: google/gemini-flash-2.0, "
                        "meta-llama/llama-3.3-70b-instruct (default: claude-haiku-4-5-20251001)")
    p.add_argument("--llm-batch",  type=int, default=10, dest="llm_batch",
                   help="Items per API call batch (default: 10)")
    p.add_argument("--llm-workers", type=int, default=1, dest="llm_workers",
                   help="Parallel batch workers — openrouter supports >1 (default: 1)")
    p.add_argument("--api-key",    default=None, dest="api_key",
                   help="API key for openrouter provider (or set OPENROUTER_API_KEY env var)")
    return p.parse_args()

# ---------------------------------------------------------------------------
# Domain content tables
# ---------------------------------------------------------------------------

DOMAINS = [
    "auth", "database", "api", "caching", "messaging",
    "frontend", "infrastructure", "testing", "security", "payments",
    "search", "analytics", "storage", "monitoring", "notifications",
]

SERVICES = [
    "auth-service", "user-service", "billing-service", "notification-service",
    "search-service", "analytics-service", "gateway-service", "order-service",
    "inventory-service", "reporting-service", "worker-service",
]

PHASE_TEMPLATES = [
    # (domain, verb, subject, context_hint)
    ("auth",           "Implement",  "JWT refresh-token rotation",          "for user sessions"),
    ("auth",           "Migrate",    "session storage",                     "from cookie to Redis"),
    ("auth",           "Add",        "OAuth2 PKCE flow",                    "for mobile clients"),
    ("database",       "Migrate",    "PostgreSQL connection pooling",        "to PgBouncer"),
    ("database",       "Implement",  "read-replica routing",                "for analytics queries"),
    ("database",       "Add",        "database schema migrations",          "using Flyway"),
    ("database",       "Optimise",   "slow query patterns",                 "in reporting module"),
    ("api",            "Implement",  "GraphQL gateway",                     "over existing REST endpoints"),
    ("api",            "Add",        "API versioning strategy",             "via URL prefix"),
    ("api",            "Migrate",    "REST endpoints",                      "to gRPC for internal services"),
    ("caching",        "Implement",  "Redis cache invalidation",            "for user sessions"),
    ("caching",        "Add",        "distributed cache layer",             "for product catalogue"),
    ("caching",        "Migrate",    "local in-process cache",              "to Redis cluster"),
    ("messaging",      "Implement",  "Kafka topic partitioning",            "for event pipeline"),
    ("messaging",      "Add",        "dead-letter queue handling",          "for failed messages"),
    ("messaging",      "Migrate",    "RabbitMQ fanout exchange",            "to Kafka compacted topics"),
    ("frontend",       "Implement",  "React component library",             "with Storybook"),
    ("frontend",       "Add",        "server-side rendering",               "for SEO-critical pages"),
    ("frontend",       "Migrate",    "class components",                    "to functional with hooks"),
    ("infrastructure", "Implement",  "Kubernetes horizontal pod autoscaler","for API tier"),
    ("infrastructure", "Add",        "Terraform module",                    "for shared networking"),
    ("infrastructure", "Migrate",    "manual EC2 provisioning",             "to Terraform-managed ECS"),
    ("testing",        "Implement",  "Playwright E2E test suite",           "for checkout flow"),
    ("testing",        "Add",        "contract tests",                      "for inter-service boundaries"),
    ("testing",        "Migrate",    "Selenium tests",                      "to Cypress"),
    ("security",       "Implement",  "secrets rotation automation",         "via HashiCorp Vault"),
    ("security",       "Add",        "OWASP dependency scanning",           "to CI pipeline"),
    ("payments",       "Implement",  "Stripe webhook handling",             "for subscription events"),
    ("payments",       "Add",        "idempotency keys",                    "to payment API endpoints"),
    ("payments",       "Migrate",    "legacy payment processor",            "to Stripe Connect"),
    ("search",         "Implement",  "Elasticsearch index sharding",        "for product search"),
    ("search",         "Add",        "semantic vector search",              "for knowledge base"),
    ("analytics",      "Implement",  "dbt transformation pipeline",         "for data warehouse"),
    ("analytics",      "Add",        "real-time event tracking",            "via Segment"),
    ("storage",        "Implement",  "S3 multipart upload",                 "for large media files"),
    ("storage",        "Add",        "CDN integration",                     "for static asset delivery"),
    ("monitoring",     "Implement",  "distributed tracing",                 "with OpenTelemetry"),
    ("monitoring",     "Add",        "SLO dashboards",                      "for API latency"),
    ("notifications",  "Implement",  "push notification delivery",          "via FCM and APNs"),
    ("notifications",  "Add",        "notification preference centre",      "for user settings"),
]

PHASE_SUMMARIES = {
    "auth":           "Improved authentication reliability and security posture by {verb_lower} {subject}.",
    "database":       "Enhanced database performance and maintainability by {verb_lower} {subject}.",
    "api":            "Modernised API surface and developer experience by {verb_lower} {subject}.",
    "caching":        "Reduced latency and database load by {verb_lower} {subject}.",
    "messaging":      "Increased messaging reliability and throughput by {verb_lower} {subject}.",
    "frontend":       "Improved frontend developer productivity by {verb_lower} {subject}.",
    "infrastructure": "Increased infrastructure reproducibility by {verb_lower} {subject}.",
    "testing":        "Raised test coverage and reliability by {verb_lower} {subject}.",
    "security":       "Hardened security controls by {verb_lower} {subject}.",
    "payments":       "Improved payment reliability and compliance by {verb_lower} {subject}.",
    "search":         "Enhanced search relevance and performance by {verb_lower} {subject}.",
    "analytics":      "Expanded analytics capability by {verb_lower} {subject}.",
    "storage":        "Optimised storage throughput and cost by {verb_lower} {subject}.",
    "monitoring":     "Improved observability and incident response by {verb_lower} {subject}.",
    "notifications":  "Increased notification delivery reliability by {verb_lower} {subject}.",
}

DOMAIN_TAGS = {
    "auth":           ["auth", "security", "sessions"],
    "database":       ["database", "postgresql", "performance"],
    "api":            ["api", "rest", "grpc"],
    "caching":        ["caching", "redis", "performance"],
    "messaging":      ["messaging", "kafka", "async"],
    "frontend":       ["frontend", "react", "ux"],
    "infrastructure": ["infrastructure", "kubernetes", "terraform"],
    "testing":        ["testing", "e2e", "ci"],
    "security":       ["security", "compliance", "vault"],
    "payments":       ["payments", "stripe", "compliance"],
    "search":         ["search", "elasticsearch", "indexing"],
    "analytics":      ["analytics", "dbt", "warehouse"],
    "storage":        ["storage", "s3", "cdn"],
    "monitoring":     ["monitoring", "observability", "opentelemetry"],
    "notifications":  ["notifications", "push", "fcm"],
}

# ---------------------------------------------------------------------------
# Decision templates (25 required)
# ---------------------------------------------------------------------------

DECISION_TEMPLATES = [
    {
        "slug_base":  "session-strategy",
        "title_tmpl": "Session strategy for {service}",
        "touches":    ["auth", "security"],
        "context":    (
            "The {service} needed a stateless authentication mechanism compatible with our "
            "horizontal scaling requirements. Cookie-based sessions would require sticky routing "
            "or a shared session store, adding operational complexity."
        ),
        "options": [
            ("JWT with short-lived access tokens and refresh rotation",
             "Stateless, horizontally scalable. Risk: token revocation is non-trivial without a denylist."),
            ("Server-side sessions backed by Redis",
             "Simple revocation but requires shared state and Redis availability for auth path."),
            ("Opaque tokens with introspection endpoint",
             "Standards-compliant but adds latency on every request for the introspection call."),
        ],
        "chosen":    "JWT with short-lived access tokens and refresh rotation",
        "rationale": (
            "JWTs eliminate the shared-state dependency on the auth critical path. "
            "Short expiry windows and refresh rotation limit the blast radius of token leakage. "
            "A Redis-backed denylist is added only for explicit logout, keeping the common path stateless."
        ),
    },
    {
        "slug_base":  "password-hashing",
        "title_tmpl": "Password hashing algorithm for {service}",
        "touches":    ["auth", "security"],
        "context":    (
            "Storing user credentials securely in {service} required choosing a password hashing "
            "algorithm resistant to GPU-accelerated brute-force attacks. NIST SP 800-63B recommends "
            "memory-hard functions; our current bcrypt implementation predates this guidance."
        ),
        "options": [
            ("bcrypt with cost factor 12",
             "Well-understood, widely supported. CPU-bound only; vulnerable to modern GPU attacks at scale."),
            ("Argon2id with recommended parameters",
             "Winner of Password Hashing Competition; memory-hard. Slightly less library support in older runtimes."),
            ("scrypt",
             "Memory-hard alternative. Tuning is more complex; Argon2id is now preferred by most guidance."),
        ],
        "chosen":    "bcrypt with cost factor 12",
        "rationale": (
            "Existing {service} users already have bcrypt hashes; a migration would require "
            "rehashing on next login over an extended window. bcrypt at cost 12 remains acceptable "
            "for our current threat model. A roadmap item to migrate to Argon2id is recorded."
        ),
    },
    {
        "slug_base":  "primary-db",
        "title_tmpl": "Primary database selection for {service}",
        "touches":    ["database", "infrastructure"],
        "context":    (
            "The {service} required a primary data store capable of ACID transactions, "
            "complex relational queries, and a strong operational ecosystem. "
            "The team evaluated three leading options before settling on a choice."
        ),
        "options": [
            ("PostgreSQL",
             "ACID-compliant, rich feature set, strong community. Operationally familiar to the team."),
            ("MySQL 8",
             "Mature, widely hosted. InnoDB provides ACID guarantees but JSON support lags PostgreSQL."),
            ("MongoDB",
             "Flexible schema for rapid iteration. Eventual-consistency defaults require careful configuration for strong guarantees."),
        ],
        "chosen":    "PostgreSQL",
        "rationale": (
            "PostgreSQL's superior JSON operators, full-text search, and window functions reduce "
            "the need for auxiliary services in {service}. The team has deep operational experience "
            "with PostgreSQL, reducing on-call risk."
        ),
    },
    {
        "slug_base":  "schema-migration-tool",
        "title_tmpl": "Schema migration tooling for {service}",
        "touches":    ["database", "infrastructure"],
        "context":    (
            "Running schema migrations safely in {service} required a tool with repeatable, "
            "versioned, and reviewable migration scripts. Ad-hoc ALTER TABLE statements in "
            "application startup code had caused several production incidents."
        ),
        "options": [
            ("Flyway",
             "SQL-first, minimal abstraction, strong CI integration. Java runtime dependency."),
            ("Liquibase",
             "Supports XML/YAML/SQL. More expressive but higher learning curve and larger footprint."),
            ("golang-migrate / Alembic (language-native)",
             "Tight coupling to the service language; avoids JVM dependency but limits shared tooling."),
        ],
        "chosen":    "Flyway",
        "rationale": (
            "Flyway's SQL-first approach keeps migrations readable in version control without "
            "an ORM abstraction layer. Its Docker image removes the JVM dependency from "
            "application containers; migrations run as a dedicated init container in Kubernetes."
        ),
    },
    {
        "slug_base":  "connection-pooling",
        "title_tmpl": "Database connection pooling strategy for {service}",
        "touches":    ["database", "infrastructure"],
        "context":    (
            "Under peak load {service} exhausted PostgreSQL's max_connections limit, "
            "causing connection timeout errors. Application-level pooling was inconsistent "
            "across services connecting to the same database cluster."
        ),
        "options": [
            ("PgBouncer in transaction-mode pooling",
             "Low memory overhead, excellent throughput. Prepared statements and advisory locks require workarounds."),
            ("pgpool-II",
             "Load balancing and replication management. More complex to configure; higher latency per query."),
            ("Application-level HikariCP / node-postgres pool",
             "No additional infrastructure. Each service instance holds its own pool, limiting total connection sharing."),
        ],
        "chosen":    "PgBouncer in transaction-mode pooling",
        "rationale": (
            "PgBouncer reduces total PostgreSQL connections from O(instances × pool_size) to a "
            "fixed ceiling, solving the immediate exhaustion problem for {service}. "
            "Transaction-mode pooling fits our workload; long-running transactions and advisory "
            "locks are confined to batch jobs that use a dedicated session-mode pool."
        ),
    },
    {
        "slug_base":  "api-protocol",
        "title_tmpl": "API protocol selection for {service}",
        "touches":    ["api", "infrastructure"],
        "context":    (
            "The {service} needed to expose both public-facing and internal APIs. "
            "Protocol choice affects client ergonomics, performance, tooling, and the "
            "ability to evolve the API without breaking consumers."
        ),
        "options": [
            ("REST over HTTPS with JSON",
             "Universal client support, human-readable, easy to cache. Lacks strict schema enforcement without OpenAPI tooling."),
            ("GraphQL",
             "Client-driven queries reduce over-fetching. Higher server complexity; N+1 query risk without dataloaders."),
            ("gRPC with Protocol Buffers",
             "Strongly typed, efficient binary encoding, built-in code generation. Poor browser support; requires HTTP/2."),
        ],
        "chosen":    "REST over HTTPS with JSON",
        "rationale": (
            "Public-facing APIs for {service} prioritise broad client compatibility. "
            "REST with OpenAPI 3.0 spec provides sufficient schema enforcement and codegen. "
            "Internal service-to-service calls migrate to gRPC incrementally where latency justifies it."
        ),
    },
    {
        "slug_base":  "api-versioning",
        "title_tmpl": "API versioning strategy for {service}",
        "touches":    ["api"],
        "context":    (
            "As {service} evolves, breaking changes to the API must not force all clients "
            "to upgrade simultaneously. A consistent versioning strategy is needed to "
            "balance stability for existing consumers with development velocity."
        ),
        "options": [
            ("URL-path prefix (/v1/, /v2/)",
             "Explicit, cacheable, easy to route at the gateway. Version proliferation risk over time."),
            ("Accept header versioning",
             "RESTful and clean URLs. Harder to test in browsers; some proxies strip custom headers."),
            ("Query parameter (?version=2)",
             "Simple to implement. Pollutes query strings and is easy to omit accidentally."),
        ],
        "chosen":    "URL-path prefix (/v1/, /v2/)",
        "rationale": (
            "URL-path versioning is the most operationally transparent choice for {service}: "
            "it is unambiguous in logs, easy to route at the API gateway, and requires no "
            "special client configuration. We enforce a maximum of two active major versions simultaneously."
        ),
    },
    {
        "slug_base":  "cache-invalidation",
        "title_tmpl": "Cache invalidation strategy for {service}",
        "touches":    ["caching", "database"],
        "context":    (
            "The {service} caches frequently-read entities to reduce database load. "
            "Stale cache entries have caused user-visible inconsistencies when upstream "
            "data changes. A principled invalidation strategy is required."
        ),
        "options": [
            ("Write-through with TTL fallback",
             "Cache updated synchronously on write; TTL handles edge cases. Increases write latency slightly."),
            ("Event-driven invalidation via message bus",
             "Cache updated asynchronously on domain events. Small staleness window between event publish and consume."),
            ("TTL-only eviction",
             "Simple to implement. Staleness window equals TTL; not suitable for consistency-sensitive data."),
        ],
        "chosen":    "Write-through with TTL fallback",
        "rationale": (
            "Write-through minimises the staleness window for {service} without introducing "
            "a messaging dependency on the cache path. The TTL fallback ensures eventual "
            "consistency even if the write-through update fails due to a transient error."
        ),
    },
    {
        "slug_base":  "cache-backend",
        "title_tmpl": "Cache backend selection for {service}",
        "touches":    ["caching", "infrastructure"],
        "context":    (
            "The {service} required a distributed cache to share state across multiple "
            "application instances. The cache must support atomic operations, expiry, "
            "and cluster-mode for high availability."
        ),
        "options": [
            ("Redis Cluster",
             "Rich data structures, Lua scripting, cluster mode. Requires careful memory sizing."),
            ("Memcached",
             "Simpler operational model, excellent raw throughput. No persistence, no complex data types."),
            ("DynamoDB DAX",
             "Fully managed, transparent API-compatible cache. Vendor lock-in; higher cost at scale."),
        ],
        "chosen":    "Redis Cluster",
        "rationale": (
            "Redis's sorted sets and pub/sub primitives cover future {service} use cases "
            "beyond simple key-value caching. Cluster mode provides the availability and "
            "horizontal scaling we need without operational overhead of a managed DAX layer."
        ),
    },
    {
        "slug_base":  "async-broker",
        "title_tmpl": "Async message broker selection for {service}",
        "touches":    ["messaging", "infrastructure"],
        "context":    (
            "The {service} needs to publish domain events to downstream consumers with "
            "guaranteed at-least-once delivery and replay capability for new consumers "
            "onboarding after the fact."
        ),
        "options": [
            ("Apache Kafka",
             "Durable, replayable, high-throughput. Heavier operational footprint; Zookeeper/KRaft dependency."),
            ("RabbitMQ",
             "Flexible routing via exchanges. Messages not retained after consumption; replay requires plugins."),
            ("AWS SQS + SNS",
             "Fully managed, low ops overhead. 14-day retention limit; no consumer-group semantics natively."),
        ],
        "chosen":    "Apache Kafka",
        "rationale": (
            "Kafka's log-based retention allows new {service} consumers to replay historical "
            "events without re-publishing. This is a hard requirement for the data pipeline "
            "and audit log consumers. The operational overhead is justified given the replay requirement."
        ),
    },
    {
        "slug_base":  "frontend-framework",
        "title_tmpl": "Frontend framework selection for {service}",
        "touches":    ["frontend", "infrastructure"],
        "context":    (
            "The {service} frontend needed a component model that supports SSR for SEO, "
            "strong TypeScript integration, and a rich ecosystem of third-party components "
            "to reduce build time."
        ),
        "options": [
            ("Next.js (React)",
             "SSR/SSG, large ecosystem, Vercel deployment simplicity. React learning curve for new engineers."),
            ("SvelteKit",
             "Smaller bundle, less boilerplate. Smaller ecosystem; fewer component libraries available."),
            ("Nuxt (Vue 3)",
             "Good SSR support, gentle learning curve. Smaller TypeScript community compared to React."),
        ],
        "chosen":    "Next.js (React)",
        "rationale": (
            "Next.js provides the SSR and ISR features required by {service} out of the box. "
            "The broader React ecosystem means component libraries and hiring are less constrained. "
            "The team already has React experience, reducing ramp-up time."
        ),
    },
    {
        "slug_base":  "state-management",
        "title_tmpl": "Frontend state management for {service}",
        "touches":    ["frontend"],
        "context":    (
            "As the {service} frontend grew, prop-drilling and inconsistent local state "
            "patterns caused bugs. A shared state management layer is needed for cross-component "
            "state with predictable update semantics."
        ),
        "options": [
            ("Redux Toolkit (RTK)",
             "Opinionated, predictable, excellent DevTools. Boilerplate even with RTK; over-engineered for simple apps."),
            ("Zustand",
             "Minimal API, no boilerplate, works outside React. Less opinionated; patterns can diverge across teams."),
            ("React Query + Context",
             "Separates server state from client state cleanly. Requires discipline to avoid context overuse."),
        ],
        "chosen":    "Zustand",
        "rationale": (
            "Zustand's minimal API lets {service} teams adopt shared state incrementally without "
            "committing to a full Redux architecture. React Query handles server-state caching "
            "alongside Zustand, keeping each library focused on its strength."
        ),
    },
    {
        "slug_base":  "container-orchestration",
        "title_tmpl": "Container orchestration platform for {service}",
        "touches":    ["infrastructure"],
        "context":    (
            "The {service} deployment grew beyond what docker-compose could manage reliably. "
            "A container orchestration platform is needed for self-healing, rolling deployments, "
            "and resource scheduling."
        ),
        "options": [
            ("Kubernetes (EKS/GKE/self-managed)",
             "Industry standard, rich ecosystem. High operational complexity; steep learning curve."),
            ("AWS ECS with Fargate",
             "Managed compute, simpler than Kubernetes. AWS lock-in; less portable."),
            ("Nomad",
             "Lighter than Kubernetes, supports non-container workloads. Smaller community; less tooling."),
        ],
        "chosen":    "Kubernetes (EKS/GKE/self-managed)",
        "rationale": (
            "Kubernetes's operator ecosystem and broad tooling coverage are worth the operational "
            "cost for {service} at our current scale. EKS reduces the control-plane burden. "
            "The investment in Kubernetes knowledge is portable and not tied to a single cloud provider."
        ),
    },
    {
        "slug_base":  "iac-tool",
        "title_tmpl": "Infrastructure-as-code tooling for {service}",
        "touches":    ["infrastructure"],
        "context":    (
            "Manual cloud resource management in {service} environments was causing drift "
            "between staging and production. A declarative IaC tool is needed to enforce "
            "consistency and enable peer review of infrastructure changes."
        ),
        "options": [
            ("Terraform with HCL",
             "Mature, provider coverage is comprehensive, large community. State management complexity."),
            ("Pulumi",
             "General-purpose language (TypeScript/Python), strong type safety. Younger ecosystem."),
            ("AWS CDK",
             "Language-native constructs, tight AWS integration. AWS-only; CDK version churn has caused breakages."),
        ],
        "chosen":    "Terraform with HCL",
        "rationale": (
            "Terraform's declarative model and remote state in S3 with DynamoDB locking give "
            "{service} teams a well-understood, auditable infrastructure workflow. "
            "HCL's simplicity is appropriate for our infrastructure complexity level."
        ),
    },
    {
        "slug_base":  "e2e-test-framework",
        "title_tmpl": "E2E test framework for {service}",
        "touches":    ["testing", "frontend"],
        "context":    (
            "The {service} had no reliable E2E test coverage for critical user journeys. "
            "Existing Selenium tests were flaky and slow, reducing developer trust in CI. "
            "A modern framework with better reliability characteristics was needed."
        ),
        "options": [
            ("Playwright",
             "Multi-browser, auto-wait, trace viewer, network mocking. Microsoft-maintained; strong reliability reputation."),
            ("Cypress",
             "Excellent DX, component testing support. Single-tab limitation; iframes are cumbersome."),
            ("Selenium with Selenide",
             "Language-agnostic, large community. Inherently flaky on timing without careful explicit waits."),
        ],
        "chosen":    "Playwright",
        "rationale": (
            "Playwright's auto-wait model eliminates most of the explicit sleep calls that made "
            "the {service} Selenium suite flaky. The trace viewer dramatically reduces debugging "
            "time for CI failures. Multi-browser coverage satisfies the QA team's requirements."
        ),
    },
    {
        "slug_base":  "load-testing-tool",
        "title_tmpl": "Load testing tooling for {service}",
        "touches":    ["testing", "infrastructure"],
        "context":    (
            "Before launching {service} features to production we need to validate performance "
            "under peak traffic. Previous manual JMeter scripts were unmaintained and not "
            "integrated into the CI/CD pipeline."
        ),
        "options": [
            ("k6",
             "JavaScript scripting, low resource usage, CI-friendly. Results export to Grafana via InfluxDB."),
            ("Gatling",
             "Scala DSL, high-performance. Steeper learning curve; JVM runtime adds complexity."),
            ("Locust",
             "Python scripting, simple distributed mode. Performance overhead from Python GIL at very high RPS."),
        ],
        "chosen":    "k6",
        "rationale": (
            "k6's JavaScript scripting model is familiar to the {service} backend team and "
            "integrates cleanly with our GitHub Actions CI pipeline. Results feed into Grafana "
            "for comparison against baseline runs, enabling regression detection."
        ),
    },
    {
        "slug_base":  "secret-management",
        "title_tmpl": "Secret management approach for {service}",
        "touches":    ["security", "infrastructure"],
        "context":    (
            "Secrets for {service} were stored in plaintext environment variables in "
            "deployment manifests committed to version control. A dedicated secret management "
            "solution is required to meet our security baseline."
        ),
        "options": [
            ("HashiCorp Vault with Kubernetes auth",
             "Secrets injected at pod start via sidecar. Dynamic secrets, fine-grained leases. Self-hosted complexity."),
            ("AWS Secrets Manager",
             "Managed, rotation built-in, IAM-integrated. AWS-specific; rotation limited to supported engines."),
            ("Sealed Secrets (Bitnami)",
             "Encrypted secrets committed to git; decrypted only inside cluster. Controller dependency."),
        ],
        "chosen":    "HashiCorp Vault with Kubernetes auth",
        "rationale": (
            "Vault's dynamic secrets model means {service} database credentials are short-lived "
            "and automatically rotated without application restarts. Kubernetes auth ties credential "
            "access to pod identity, not long-lived IAM keys."
        ),
    },
    {
        "slug_base":  "payment-processor",
        "title_tmpl": "Payment processor selection for {service}",
        "touches":    ["payments", "security"],
        "context":    (
            "The {service} required a payment processor capable of handling subscription billing, "
            "marketplace payouts, and strong fraud-detection tooling, all with PCI DSS SAQ-A "
            "compliance scope minimisation."
        ),
        "options": [
            ("Stripe",
             "Excellent developer experience, mature subscription and Connect APIs. Higher per-transaction fees."),
            ("Adyen",
             "Strong global coverage, lower fees at volume. Integration complexity; steeper learning curve."),
            ("Braintree (PayPal)",
             "Flexible vault, PayPal acceptance. Fewer modern features than Stripe; slower API iteration."),
        ],
        "chosen":    "Stripe",
        "rationale": (
            "Stripe's webhook reliability, idempotency key support, and pre-built {service} UI "
            "components reduce our PCI scope to SAQ-A. The higher per-transaction fee is "
            "acceptable at our current volume and the developer velocity gain is significant."
        ),
    },
    {
        "slug_base":  "search-engine",
        "title_tmpl": "Search engine selection for {service}",
        "touches":    ["search", "infrastructure"],
        "context":    (
            "The {service} product catalogue required full-text search with faceting, typo "
            "tolerance, and sub-100ms query latency at the p99. PostgreSQL full-text search "
            "was too slow and lacked faceting support."
        ),
        "options": [
            ("Elasticsearch",
             "Mature, powerful aggregations, large ecosystem. Significant operational and licensing complexity."),
            ("Typesense",
             "Purpose-built for search UX, easy to operate, open source. Fewer advanced aggregation features."),
            ("Meilisearch",
             "Typo-tolerant, fast, simple API. Less feature-complete for complex aggregation pipelines."),
        ],
        "chosen":    "Elasticsearch",
        "rationale": (
            "Elasticsearch's aggregation framework is required for the faceted navigation in "
            "{service}. The operational complexity is mitigated by using Elastic Cloud. "
            "Typesense will be re-evaluated if Elastic costs become prohibitive at scale."
        ),
    },
    {
        "slug_base":  "analytics-warehouse",
        "title_tmpl": "Analytics data warehouse for {service}",
        "touches":    ["analytics", "storage"],
        "context":    (
            "The {service} analytics team needed a scalable warehouse capable of ad-hoc "
            "SQL queries over billions of rows with sub-minute query latency. "
            "The current PostgreSQL reporting database cannot scale further."
        ),
        "options": [
            ("Snowflake",
             "Elastic compute, zero-copy cloning, strong SQL compatibility. Per-second compute billing can spike."),
            ("BigQuery",
             "Serverless, no infrastructure management, excellent for Google Cloud shops. Vendor lock-in."),
            ("Redshift",
             "Tight AWS integration, familiar PostgreSQL dialect. Cluster management overhead; scaling is slower."),
        ],
        "chosen":    "Snowflake",
        "rationale": (
            "Snowflake's separation of storage and compute lets {service} analytics scale query "
            "capacity independently of data volume. Zero-copy cloning enables safe data exploration "
            "without ETL duplication. Cloud-agnostic positioning protects against future cloud migrations."
        ),
    },
    {
        "slug_base":  "object-storage",
        "title_tmpl": "Object storage selection for {service}",
        "touches":    ["storage", "infrastructure"],
        "context":    (
            "The {service} required durable, scalable object storage for user uploads, "
            "model artefacts, and export files. Local disk storage had caused data loss "
            "during instance replacements."
        ),
        "options": [
            ("AWS S3",
             "Industry standard, extensive SDK support, lifecycle policies. AWS dependency."),
            ("Cloudflare R2",
             "S3-compatible, no egress fees. Smaller ecosystem; some S3 features not yet supported."),
            ("MinIO (self-hosted)",
             "S3-compatible, on-prem or cloud-agnostic. Operational overhead of managing the cluster."),
        ],
        "chosen":    "AWS S3",
        "rationale": (
            "S3's mature lifecycle management, cross-region replication, and event notification "
            "features cover all current {service} requirements. The egress cost is acceptable "
            "given our CDN offloads most reads. Switching to R2 is recorded as a cost-reduction option."
        ),
    },
    {
        "slug_base":  "observability-stack",
        "title_tmpl": "Observability stack for {service}",
        "touches":    ["monitoring", "infrastructure"],
        "context":    (
            "Debugging {service} production incidents required correlating logs, metrics, and "
            "traces that were spread across three separate tools with no unified query interface. "
            "A converged observability platform is needed."
        ),
        "options": [
            ("Grafana + Prometheus + Loki + Tempo (LGTM stack)",
             "Open source, unified UI, strong Kubernetes integration. Self-hosted operational burden."),
            ("Datadog",
             "Full-featured SaaS, APM, excellent dashboards. High cost at scale; vendor lock-in."),
            ("New Relic",
             "Generous free tier, full-stack observability. UI complexity; pricing model changes frequently."),
        ],
        "chosen":    "Grafana + Prometheus + Loki + Tempo (LGTM stack)",
        "rationale": (
            "The LGTM stack gives {service} unified log/metric/trace correlation in a single "
            "Grafana UI without per-seat or per-GB SaaS pricing. Prometheus operator and "
            "OpenTelemetry collector auto-instrument our Kubernetes workloads with minimal code changes."
        ),
    },
    {
        "slug_base":  "rate-limiting",
        "title_tmpl": "Rate limiting strategy for {service}",
        "touches":    ["api", "security"],
        "context":    (
            "The {service} public API was vulnerable to abuse and accidental misconfigured "
            "client loops. Rate limiting is needed at the API gateway level to protect "
            "downstream services and enforce fair usage."
        ),
        "options": [
            ("Token bucket via Redis at the API gateway",
             "Smooth burst handling, shared state across gateway instances. Redis availability on the request path."),
            ("Fixed window counter in gateway memory",
             "No Redis dependency. Burst-at-boundary problem; not shared across gateway replicas."),
            ("Third-party service (Kong Rate Limiting Advanced, AWS WAF)",
             "Managed, feature-rich. Cost and configuration complexity; vendor dependency."),
        ],
        "chosen":    "Token bucket via Redis at the API gateway",
        "rationale": (
            "Token buckets smooth legitimate burst traffic for {service} consumers while still "
            "enforcing limits. Sharing state in Redis ensures consistent enforcement across "
            "all gateway replicas. Redis is already in our infrastructure, adding no new dependency."
        ),
    },
    {
        "slug_base":  "feature-flags",
        "title_tmpl": "Feature flag tooling for {service}",
        "touches":    ["infrastructure", "frontend"],
        "context":    (
            "Deploying {service} features behind flags allows trunk-based development and "
            "gradual rollouts. Current approach of environment variable flags requires "
            "redeployment to change flag state."
        ),
        "options": [
            ("LaunchDarkly",
             "Real-time flag evaluation, rich targeting rules, SDK coverage. Ongoing SaaS cost."),
            ("Unleash (self-hosted)",
             "Open source, full feature set, data stays on-prem. Operational overhead of hosting."),
            ("Flagsmith",
             "Open source or cloud, simple API. Fewer advanced targeting features than LaunchDarkly."),
        ],
        "chosen":    "Unleash (self-hosted)",
        "rationale": (
            "Unleash gives {service} real-time flag evaluation without SaaS subscription cost. "
            "Self-hosting means flag evaluation never leaves our network, satisfying data residency "
            "requirements. The operational overhead is low given Unleash's Docker Compose deployment model."
        ),
    },
    {
        "slug_base":  "data-retention",
        "title_tmpl": "Data retention policy for {service}",
        "touches":    ["analytics", "security"],
        "context":    (
            "Regulatory requirements and storage cost pressures require a defined data retention "
            "policy for {service}. Different data categories have different legal holds: "
            "financial records differ from behavioural analytics."
        ),
        "options": [
            ("Tiered retention: hot 90d / warm 1yr / cold 7yr archive",
             "Balances cost, query performance, and compliance. Complex lifecycle automation required."),
            ("Flat 7-year retention for all data",
             "Simple policy, no lifecycle automation. High storage cost; GDPR erasure requests harder to fulfill."),
            ("Delete after 90 days except explicit legal holds",
             "Minimises storage and GDPR surface. Risk of deleting data needed for dispute resolution."),
        ],
        "chosen":    "Tiered retention: hot 90d / warm 1yr / cold 7yr archive",
        "rationale": (
            "The tiered model satisfies {service} compliance requirements (7-year financial record "
            "retention) while controlling storage cost through S3 lifecycle transitions. "
            "GDPR erasure requests are fulfilled by deleting hot-tier rows; cold-tier holds "
            "anonymised aggregates only."
        ),
    },
    {
        "slug_base":  "event-sourcing-strategy",
        "title_tmpl": "Event sourcing vs append-only audit log for {service}",
        "touches":    ["database", "messaging", "architecture"],
        "context":    (
            "Early architecture decisions for {service} assumed a simple CRUD model with a "
            "relational store. As audit trail requirements grew, the team re-evaluated whether "
            "full event sourcing would conflict with existing schema decisions or whether a "
            "lighter append-only pattern could satisfy the new constraints."
        ),
        "options": [
            ("Full event sourcing with event store",
             "Complete audit log, temporal queries, replay capability. Conflicts with existing "
             "CRUD schema decisions; event schema evolution and snapshot management add significant complexity."),
            ("Append-only audit_events table",
             "Low migration cost, compatible with existing relational schema, satisfies compliance audit "
             "requirements. Does not support arbitrary temporal queries or event replay for projections."),
            ("CQRS without event sourcing",
             "Separates read and write models for scalability. Adds synchronisation complexity without "
             "the full audit benefit of event sourcing; partial solution to both problems."),
        ],
        "chosen":    "Append-only audit_events table",
        "rationale": (
            "Full event sourcing would contradict the primary-db and schema-migration decisions already "
            "in place for {service} — rebuilding the write model solely for audit would be disproportionate. "
            "The append-only audit_events table satisfies compliance requirements within the existing "
            "architecture. Event sourcing remains an option for new domains where temporal query patterns "
            "justify the added complexity from the outset."
        ),
    },
]

# ---------------------------------------------------------------------------
# Discussion templates (10 required)
# ---------------------------------------------------------------------------

DISCUSSION_TEMPLATES = [
    {
        "slug":    "microservices-vs-monolith",
        "title":   "Microservices vs monolith architecture",
        "tags":    ["architecture", "infrastructure"],
        "summary": "Evaluated service decomposition strategy for the platform",
        "outcome_summary": "Adopted a modular monolith with clear domain boundaries as the starting point",
        "context": (
            "As the engineering team grew it became unclear whether the current monolithic "
            "application structure would scale. The discussion was triggered by a proposal "
            "to split the auth and billing domains into separate services."
        ),
        "points": (
            "The team debated operational complexity of microservices at our scale, the risk of "
            "distributed system failures, and the development velocity cost of cross-service "
            "changes. The modular monolith pattern was raised as a middle ground that preserves "
            "domain isolation without the networking and deployment overhead of true microservices."
        ),
        "conclusions": (
            "The team aligned on a modular monolith approach: clear domain modules with strict "
            "import boundaries, but deployed as a single artefact. Domain boundaries are designed "
            "to allow extraction to microservices when a specific domain's scaling need justifies it."
        ),
    },
    {
        "slug":    "event-sourcing-feasibility",
        "title":   "Event sourcing feasibility for audit trail",
        "tags":    ["architecture", "database", "messaging"],
        "summary": "Assessed whether event sourcing is appropriate for the core domain",
        "outcome_summary": "Decided against full event sourcing; adopted append-only audit log pattern instead",
        "context": (
            "A proposal was raised to rebuild the core domain using event sourcing to support "
            "temporal queries and audit requirements. The discussion assessed whether the benefits "
            "justified the migration complexity and learning curve."
        ),
        "points": (
            "Event sourcing provides a complete audit log and temporal query capability, but "
            "introduces complexity around event schema evolution, snapshot management, and eventual "
            "consistency. The team assessed our current audit requirements and found them satisfiable "
            "with a simpler append-only audit log table rather than full event sourcing."
        ),
        "conclusions": (
            "Full event sourcing was ruled out for the core domain. An append-only audit_events "
            "table captures the business events we need for compliance. The decision leaves open "
            "the possibility of event sourcing for new domains where the query patterns justify it."
        ),
    },
    {
        "slug":    "sql-vs-nosql",
        "title":   "SQL vs NoSQL for the user profile domain",
        "tags":    ["database", "architecture"],
        "summary": "Evaluated relational vs document store for flexible user profile attributes",
        "outcome_summary": "Retained PostgreSQL with JSONB column for flexible attributes",
        "context": (
            "The user profile domain needed to support arbitrary key-value attributes that varied "
            "by product line and customer segment. A proposal was made to move profile storage to "
            "MongoDB for schema flexibility."
        ),
        "points": (
            "MongoDB's flexible document model simplifies storing variable profile attributes but "
            "introduces a second database engine to operate. PostgreSQL's JSONB column type provides "
            "schema flexibility while keeping data co-located with related relational data, "
            "simplifying JOIN-based queries that cross profile and transactional data."
        ),
        "conclusions": (
            "The team decided to stay on PostgreSQL and use a JSONB column for flexible profile "
            "attributes. GIN indexing on the JSONB column provides adequate query performance. "
            "The decision avoids a second database engine at the cost of some schema discipline."
        ),
    },
    {
        "slug":    "sync-vs-async-api",
        "title":   "Synchronous vs asynchronous API design for order processing",
        "tags":    ["api", "messaging", "architecture"],
        "summary": "Debated request-response vs event-driven patterns for order submission",
        "outcome_summary": "Adopted async with polling for order submission; sync for read paths",
        "context": (
            "Order processing involves multiple downstream steps (inventory reservation, payment, "
            "fulfilment) that cannot all complete within a synchronous HTTP timeout. The team "
            "discussed how to design the order submission API."
        ),
        "points": (
            "Synchronous processing is simpler for clients but risks timeout errors on slow "
            "downstream steps. An async model with a job ID and polling endpoint adds client "
            "complexity but decouples order submission from downstream processing time. "
            "WebSocket push was also considered for real-time status updates."
        ),
        "conclusions": (
            "Order submission returns a 202 Accepted with an order ID immediately. Clients poll "
            "a status endpoint or subscribe to a webhook. Read paths (order history, catalogue) "
            "remain synchronous. WebSocket push is deferred to a future phase."
        ),
    },
    {
        "slug":    "team-ownership-boundaries",
        "title":   "Engineering team ownership boundaries",
        "tags":    ["process", "architecture"],
        "summary": "Defined service ownership boundaries to reduce cross-team contention",
        "outcome_summary": "Adopted domain-aligned team topology with explicit API contracts between teams",
        "context": (
            "Multiple teams were modifying shared modules and creating merge conflicts and "
            "coordination overhead. A discussion was held to define clearer ownership boundaries "
            "and reduce the blast radius of cross-team changes."
        ),
        "points": (
            "Conway's Law argues that system architecture mirrors communication structure. "
            "The team discussed domain-aligned ownership (each team owns a business domain end-to-end) "
            "vs layer-aligned ownership (frontend team, backend team, data team). Domain alignment "
            "reduces cross-team dependencies at the cost of requiring full-stack skills in each team."
        ),
        "conclusions": (
            "Domain-aligned teams were adopted. Each domain team owns its API contract, database "
            "schema, and deployment pipeline. Cross-domain calls go through versioned API contracts. "
            "A shared platform team owns infrastructure tooling and common libraries."
        ),
    },
    {
        "slug":    "test-strategy",
        "title":   "Automated test strategy and coverage targets",
        "tags":    ["testing", "process"],
        "summary": "Aligned on the testing pyramid and coverage expectations per layer",
        "outcome_summary": "Adopted testing pyramid: 70% unit, 20% integration, 10% E2E; 80% line coverage target for service layer",
        "context": (
            "Test coverage was inconsistent across services. Some had high unit test coverage but "
            "no integration tests; others had slow E2E suites that covered basic flows. The team "
            "needed to align on expectations."
        ),
        "points": (
            "The testing pyramid principle argues for many fast unit tests, fewer integration tests, "
            "and minimal E2E tests. Some engineers preferred a trophy model with an emphasis on "
            "integration tests over unit tests for behaviour coverage. The cost of maintaining "
            "E2E suites was a significant concern given historical flakiness."
        ),
        "conclusions": (
            "The pyramid model was adopted with 80% line coverage target for the service layer. "
            "Integration tests use a test database container (testcontainers). E2E tests cover "
            "critical user journeys only. Coverage is enforced in CI with a build-fail threshold."
        ),
    },
    {
        "slug":    "data-retention-discussion",
        "title":   "Data retention philosophy and GDPR compliance approach",
        "tags":    ["compliance", "analytics", "security"],
        "summary": "Discussed competing retention needs across analytics, compliance, and privacy",
        "outcome_summary": "Aligned on tiered retention as the framework; formal policy decision followed",
        "context": (
            "GDPR right-to-erasure requests were manually handled and time-consuming. "
            "Meanwhile, the analytics team wanted longer data retention for trend analysis. "
            "The discussion explored the tension between privacy minimisation and analytical value."
        ),
        "points": (
            "Privacy-by-design suggests collecting only what is needed and deleting it promptly. "
            "Analytics value increases with historical depth. Financial regulations require "
            "7-year retention for transaction records. The discussion explored pseudonymisation "
            "as a technique to retain analytical value while reducing GDPR erasure scope."
        ),
        "conclusions": (
            "Pseudonymisation of user IDs in analytics events at ingestion time allows the analytics "
            "team to retain events indefinitely while fulfilling erasure requests by deleting "
            "the pseudonymisation key. Financial records retain original IDs under legal hold. "
            "A formal tiered retention policy decision was triggered as a follow-on."
        ),
    },
    {
        "slug":    "feature-flags-build-vs-buy",
        "title":   "Feature flags: build vs buy",
        "tags":    ["infrastructure", "process"],
        "summary": "Evaluated building a custom feature flag system vs adopting an existing tool",
        "outcome_summary": "Chose an existing open-source tool (Unleash) over building custom",
        "context": (
            "The team had been using environment variables as pseudo-feature flags. As the need "
            "for targeted rollouts and A/B testing grew, a proper feature flag system was needed. "
            "The question was whether to build a minimal internal system or adopt an existing tool."
        ),
        "points": (
            "Building a custom system gives full control and avoids vendor dependency but requires "
            "ongoing maintenance. Existing tools like LaunchDarkly offer rich targeting and SDKs "
            "but incur subscription cost. Open-source options like Unleash and Flagsmith provide "
            "the features without SaaS cost but require self-hosting."
        ),
        "conclusions": (
            "Building a custom system was ruled out; the maintenance cost is not justified when "
            "mature open-source options exist. Unleash was selected for its feature set and "
            "low operational footprint. A formal decision record was created."
        ),
    },
    {
        "slug":    "rate-limiting-approach",
        "title":   "Rate limiting approach for public APIs",
        "tags":    ["api", "security", "infrastructure"],
        "summary": "Explored rate limiting algorithms and enforcement points",
        "outcome_summary": "Adopted token bucket at the API gateway with Redis state",
        "context": (
            "The public API was experiencing traffic spikes from misconfigured clients and "
            "occasional automated scraping. The discussion evaluated where and how to enforce "
            "rate limits without degrading legitimate user experience."
        ),
        "points": (
            "Rate limiting can be enforced at the client (unreliable), at the API gateway "
            "(centralised, accurate), or at the service level (defence-in-depth). "
            "Algorithm choice between fixed window, sliding window log, and token bucket "
            "affects burst handling behaviour. Client UX requires informative 429 responses "
            "with Retry-After headers."
        ),
        "conclusions": (
            "Token bucket at the API gateway was selected for smooth burst handling. Redis "
            "stores per-client token counts; the gateway checks and decrements on each request. "
            "A formal decision record was created. Service-level circuit breakers provide "
            "defence-in-depth independently of gateway rate limiting."
        ),
    },
    {
        "slug":    "incident-process",
        "title":   "Incident response process definition",
        "tags":    ["process", "monitoring", "security"],
        "summary": "Defined incident severity levels, escalation paths, and post-mortem process",
        "outcome_summary": "Adopted a 3-severity model with blameless post-mortems and 48-hour SLA for P1 root cause",
        "context": (
            "Several production incidents had been handled inconsistently, with unclear ownership, "
            "no defined escalation path, and no post-mortem process. The discussion aimed to "
            "establish a shared incident response framework."
        ),
        "points": (
            "Severity classification systems (P1/P2/P3 vs Sev1/2/3) affect escalation automation "
            "and on-call burden. Blameless post-mortems are widely advocated but require "
            "psychological safety investment. The team debated SLA windows for post-mortem "
            "completion and root-cause documentation given the current on-call rotation size."
        ),
        "conclusions": (
            "Three severity levels were defined: P1 (customer-facing outage, immediate page), "
            "P2 (degraded performance, business-hours escalation), P3 (internal impact only, "
            "ticket queue). Blameless post-mortems are required for P1 and recommended for P2. "
            "A post-mortem template was created in the runbook repository."
        ),
    },
    {
        "slug":    "grpc-internal-migration",
        "title":   "gRPC adoption for internal service communication",
        "tags":    ["api", "infrastructure", "architecture"],
        "summary": "Explored replacing REST with gRPC for service-to-service calls",
        "outcome_summary": "No decision reached; discussion concluded without outcome, later addressed when REST→gRPC migration was scoped",
        "context": (
            "After the api-protocol decision locked in REST for public APIs, a follow-up discussion "
            "arose about whether internal service-to-service traffic should migrate to gRPC. "
            "The original decision explicitly deferred internal protocol choice, leaving a latent "
            "gap that resurfaced as inter-service call volume grew."
        ),
        "points": (
            "gRPC offers strongly-typed contracts and binary efficiency over HTTP/2 for internal calls, "
            "but requires protobuf schema management and generated client stubs in every service. "
            "The team was split: platform engineers favoured gRPC for observability and type safety, "
            "while service teams were concerned about migration cost and the risk of diverging from "
            "the REST-first api-protocol decision. No single owner emerged to drive the migration."
        ),
        "conclusions": (
            "The discussion concluded without a formal decision or outcome. Competing constraints — "
            "REST compatibility commitments, protobuf toolchain maturity, and migration resource "
            "availability — were unresolved. The topic was parked as a duplicate of the existing "
            "api-protocol decision scope. It was later addressed when a dedicated gRPC migration "
            "phase was scoped with an explicit owner and timeline."
        ),
    },
    {
        "slug":    "multi-region-strategy",
        "title":   "Multi-region deployment strategy",
        "tags":    ["infrastructure", "database", "architecture"],
        "summary": "Discussed whether to adopt active-active or active-passive multi-region topology",
        "outcome_summary": "No decision reached; deferred — latent conflict with primary-db decision unresolved at discussion close",
        "context": (
            "Customer demand from non-EU regions and a near-miss data-centre incident triggered "
            "discussion on multi-region deployment. The primary-db decision had assumed a single "
            "region; extending it to multi-region would require revisiting replication strategy, "
            "which the team had not yet modelled."
        ),
        "points": (
            "Active-active topology provides the lowest failover RTO but requires conflict-free "
            "replication or distributed transactions, both of which conflict with the PostgreSQL "
            "primary-db decision. Active-passive is simpler but provides no read scalability in "
            "the secondary region. The team also raised data residency compliance as a constraint "
            "that could invalidate certain topologies entirely. No option satisfied all constraints "
            "simultaneously; the discussion surfaced the conflict but could not resolve it."
        ),
        "conclusions": (
            "No decision was reached. The discussion identified a latent conflict between the "
            "multi-region requirement and the existing primary-db and data-retention decisions. "
            "Resolving it requires a dedicated spike to model replication lag, compliance constraints, "
            "and failover RTO targets before any topology can be chosen. The discussion outcome is "
            "deferred; a follow-up decision record will supersede relevant earlier decisions once "
            "the spike is complete."
        ),
    },
]

# ---------------------------------------------------------------------------
# LLM prose generation (optional, --llm flag)
# ---------------------------------------------------------------------------

LLM_SYSTEM = (
    "You are generating realistic engineering decision and phase records for a project-memory "
    "stress test corpus. Write as a working engineer would — varied tone, sometimes terse, "
    "sometimes detailed. Natural variation is critical:\n"
    "  - Some entries mention a past incident or failure that forced the decision\n"
    "  - Some have a deferred TODO (\"a migration to X is recorded as a future item\")\n"
    "  - Some reference or implicitly contradict an earlier decision\n"
    "  - Some include hindsight phrasing (\"in retrospect, this introduced...\")\n"
    "  - Occasionally leave a rationale slightly incomplete or uncertain\n"
    "Return ONLY a valid JSON array. No markdown fences, no commentary outside the JSON."
)


def _parse_llm_response(text: str):
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        inner = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
        text = "\n".join(inner)
    return json.loads(text)


def _llm_call_claude(model: str, user: str, retries: int = 3):
    full_prompt = LLM_SYSTEM + "\n\n" + user
    cmd = ["claude", "-p", full_prompt]
    if model:
        cmd += ["--model", model]
    for attempt in range(retries):
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
            if result.returncode != 0:
                raise RuntimeError(result.stderr.strip())
            return _parse_llm_response(result.stdout)
        except Exception:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                return None


def _llm_call_openrouter(api_key: str, model: str, user: str, retries: int = 3):
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": LLM_SYSTEM},
            {"role": "user",   "content": user},
        ],
        "max_tokens": 4096,
    }).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/project-memory",
    }
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                "https://openrouter.ai/api/v1/chat/completions",
                data=payload, headers=headers, method="POST",
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            text = data["choices"][0]["message"]["content"]
            return _parse_llm_response(text)
        except Exception:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                return None


def _llm_call(provider: str, model: str, user: str, api_key: str = None, retries: int = 3):
    if provider == "openrouter":
        return _llm_call_openrouter(api_key, model, user, retries)
    return _llm_call_claude(model, user, retries)


def _decision_user_prompt(specs: list) -> str:
    lines = []
    for i, s in enumerate(specs):
        opt_labels = "; ".join(o[0] for o in s["options"])
        lines.append(
            f"{i+1}. Service: {s['service']} | Topic: {s['title']} | "
            f"Options: {opt_labels} | Chosen: {s['chosen']}"
        )
    return (
        f"Write prose for {len(specs)} engineering decision records.\n"
        "CRITICAL: The 'rationale' field MUST justify the option named in 'Chosen'. "
        "Do not name a different option as the final choice anywhere in context, option_notes, or rationale.\n"
        "For each return:\n"
        "  context: 2-3 sentences — the technical problem that forced this decision\n"
        "  option_notes: array of strings, one per option — why it was considered "
        "and rejected (or, for the chosen option, why it was selected), written naturally\n"
        "  rationale: 2-3 sentences — justification for the Chosen option\n\n"
        + "\n".join(lines)
        + f"\n\nReturn a JSON array of {len(specs)} objects with keys: "
        "context (string), option_notes (array of strings), rationale (string). "
        "Each option_notes array must have exactly as many entries as that decision has options."
    )


def _phase_user_prompt(specs: list) -> str:
    lines = []
    for i, s in enumerate(specs):
        lines.append(f"{i+1}. Title: {s['title']} | Domain: {s['domain']} | Date: {s['date']}")
    return (
        f"Write a summary for {len(specs)} engineering phase records.\n"
        "Each summary is 2-4 sentences: what was accomplished, what problem it solved, "
        "any noteworthy outcome, lesson, or deferred item. Write as commit-message prose, "
        "not marketing copy.\n\n"
        + "\n".join(lines)
        + f"\n\nReturn a JSON array of {len(specs)} objects with key: summary (string)."
    )


def _discussion_user_prompt(specs: list) -> str:
    lines = []
    for i, s in enumerate(specs):
        lines.append(f"{i+1}. Title: {s['title']} | Tags: {', '.join(s['tags'])}")
    return (
        f"Write prose for {len(specs)} engineering discussion records.\n"
        "For each return:\n"
        "  context: 2-3 sentences — what triggered the discussion\n"
        "  points: 1 paragraph — main arguments and trade-offs raised\n"
        "  conclusions: 1 paragraph — what the team aligned on (or explicitly deferred)\n\n"
        + "\n".join(lines)
        + f"\n\nReturn a JSON array of {len(specs)} objects "
        "with keys: context, points, conclusions (all strings)."
    )


def generate_llm_prose(
    provider: str, model: str, api_key: str, batch_size: int, workers: int,
    decision_specs: list, phase_specs: list, discussion_specs: list,
) -> tuple:
    """Returns (decision_prose, phase_prose, discussion_prose) as lists aligned with input specs."""

    def run_batches(specs, prompt_fn, label):
        n = len(specs)
        results = [None] * n
        n_batches = math.ceil(n / batch_size)
        batches = [
            (b, specs[b * batch_size: (b + 1) * batch_size])
            for b in range(n_batches)
        ]
        print(f"  LLM: {label} — {n} items, {n_batches} batches, {workers} worker(s)", flush=True)
        done = 0

        def process(b_batch):
            b, batch = b_batch
            raw = _llm_call(provider, model, prompt_fn(batch), api_key)
            return b, batch, raw

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(process, bb): bb[0] for bb in batches}
            for fut in as_completed(futures):
                b, batch, raw = fut.result()
                if raw and len(raw) == len(batch):
                    for j, item in enumerate(raw):
                        results[b * batch_size + j] = item
                else:
                    print(f"    batch {b+1}/{n_batches}: failed — template fallback")
                done += 1
                if done % 5 == 0 or done == n_batches:
                    print(f"    {done}/{n_batches} done", flush=True)
        return results

    decision_prose   = run_batches(decision_specs,   _decision_user_prompt,   "decisions")
    phase_prose      = run_batches(phase_specs,       _phase_user_prompt,      "phases")
    discussion_prose = run_batches(discussion_specs,  _discussion_user_prompt, "discussions")
    return decision_prose, phase_prose, discussion_prose


# ---------------------------------------------------------------------------
# Date generation (Gaussian burst model)
# ---------------------------------------------------------------------------

def generate_dates(n: int, start: date, end: date, rng: random.Random) -> list:
    """Generate n dates spread over [start, end] using a Gaussian burst model."""
    total_days = (end - start).days
    num_milestones = max(1, int((total_days / 365) * 52 / 7))
    milestone_days = sorted(rng.randint(20, total_days - 20) for _ in range(num_milestones))

    dates = []
    while len(dates) < n:
        m = rng.choice(milestone_days)
        offset = int(rng.gauss(0, 10))
        d = start + timedelta(days=max(0, min(total_days - 1, m + offset)))
        dates.append(d)
    dates.sort()
    return dates[:n]

# ---------------------------------------------------------------------------
# Slug / ID helpers
# ---------------------------------------------------------------------------

def slugify(text: str) -> str:
    words = []
    for ch in text.lower():
        if ch.isalnum():
            if words and words[-1][-1:].isalnum():
                words[-1] += ch
            else:
                words.append(ch)
        elif ch in (' ', '-', '_'):
            words.append('-')
    slug = ''.join(words).strip('-')
    # Collapse multiple hyphens
    import re
    slug = re.sub(r'-+', '-', slug)
    return slug

def make_phase_id(dt: date, title: str, used: set) -> str:
    words = title.split()[:5]
    slug = slugify(' '.join(words))
    base = f"phase-{dt.strftime('%Y%m%d')}-{slug}"
    candidate = base
    i = 2
    while candidate in used:
        candidate = f"{base}-{i}"
        i += 1
    used.add(candidate)
    return candidate

def make_decision_id(dt: date, slug_base: str, used: set) -> str:
    base = f"DECISION-{dt.strftime('%Y-%m-%d')}-{slug_base}"
    candidate = base
    i = 2
    while candidate in used:
        candidate = f"{base}-{i}"
        i += 1
    used.add(candidate)
    return candidate

def make_discussion_id(dt: date, slug: str, used: set) -> str:
    base = f"DISCUSSION-{dt.strftime('%Y-%m-%d')}-{slug}"
    candidate = base
    i = 2
    while candidate in used:
        candidate = f"{base}-{i}"
        i += 1
    used.add(candidate)
    return candidate

# ---------------------------------------------------------------------------
# Writers
# ---------------------------------------------------------------------------

def write_file(path: str, content: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def write_config(out: str) -> None:
    content = "profile: lite\nadr_enabled: false\naudit_ignore: []\n"
    write_file(os.path.join(out, ".project-memory", "config.yml"), content)

def write_summaries(out: str) -> None:
    pm = os.path.join(out, ".project-memory", "summaries")
    write_file(os.path.join(pm, "roadmap.md"), "# Roadmap\n\nStress-test generated corpus — no real roadmap items.\n")
    write_file(os.path.join(pm, "current-state.md"), "# Current State\n\nStress-test generated corpus.\n")

def write_phase(out: str, phase_id: str, dt: date, tmpl: tuple, rng: random.Random,
                prose: dict = None) -> dict:
    domain, verb, subject, ctx = tmpl
    title = f"{verb} {subject} {ctx}"
    tags_pool = DOMAIN_TAGS[domain]
    tags = rng.sample(tags_pool, min(rng.randint(2, 4), len(tags_pool)))
    if prose and prose.get("summary"):
        summary = prose["summary"]
    else:
        summary_tmpl = PHASE_SUMMARIES[domain]
        summary = summary_tmpl.format(verb_lower=verb.lower(), subject=subject)
    closed = dt + timedelta(days=rng.randint(0, 1))

    phase_yml = f"""id: {phase_id}
title: "{title}"
status: completed
started_at: {dt.strftime('%Y-%m-%d')}
closed_at: {closed.strftime('%Y-%m-%d')}
commits: []
tags: [{', '.join(tags)}]
summary: >
  {summary} Work completed as part of the {domain} domain roadmap.
"""
    phase_dir = os.path.join(out, ".project-memory", "phases", phase_id)
    write_file(os.path.join(phase_dir, "phase.yml"), phase_yml)
    return {
        "id": phase_id,
        "title": title,
        "status": "completed",
        "started_at": dt.strftime('%Y-%m-%d'),
        "tags": tags,
    }

def write_phases_index(out: str, phases: list) -> None:
    # Newest first
    lines = ["phases:\n"]
    for p in reversed(phases):
        lines.append(f"  - id: {p['id']}\n    title: \"{p['title']}\"\n    status: {p['status']}\n    started_at: {p['started_at']}\n")
    write_file(os.path.join(out, ".project-memory", "phases", "index.yml"), ''.join(lines))

def _fill_tmpl(text: str, service: str) -> str:
    return text.replace("{service}", service)

def write_decision(out: str, decision_id: str, dt: date, tmpl: dict, service: str,
                   prose: dict = None) -> dict:
    title = _fill_tmpl(tmpl["title_tmpl"], service)
    touches = tmpl["touches"]
    touches_str = ", ".join(touches)
    chosen = tmpl["chosen"]

    if prose:
        context = prose.get("context") or _fill_tmpl(tmpl["context"], service)
        rationale = prose.get("rationale") or _fill_tmpl(tmpl["rationale"], service)
        option_notes = prose.get("option_notes") or []
    else:
        context = _fill_tmpl(tmpl["context"], service)
        rationale = _fill_tmpl(tmpl["rationale"], service)
        option_notes = []

    options_md = ""
    for j, (opt_name, opt_desc) in enumerate(tmpl["options"]):
        note = option_notes[j] if j < len(option_notes) else opt_desc
        options_md += f"\n## {opt_name}\n{note}\n"

    content = f"""---
id: {decision_id}
title: "{title}"
date: {dt.strftime('%Y-%m-%d')}
status: active
provenance: collaborative
touches: [{touches_str}]
---

# Context
{context}

# Alternatives Considered
{options_md}
# Decision
Chosen: **{chosen}**

# Rationale
{rationale}
"""
    write_file(os.path.join(out, ".project-memory", "decisions", f"{decision_id}.md"), content)
    return {
        "id": decision_id,
        "title": title,
        "date": dt.strftime('%Y-%m-%d'),
        "touches": touches_str,
    }

def write_decisions_index(out: str, decisions: list) -> None:
    rows = ["# Decisions Index\n\n| Date | ID | Status | Global | Claim | Touches |\n|---|---|---|---|---|---|\n"]
    for d in reversed(decisions):
        claim = d["title"][:60] + ("..." if len(d["title"]) > 60 else "")
        rows.append(f"| {d['date']} | {d['id']} | active | No | {claim} | {d['touches']} |\n")
    write_file(os.path.join(out, ".project-memory", "decisions", "index.md"), ''.join(rows))

def write_discussion(out: str, disc_id: str, dt: date, tmpl: dict, prose: dict = None) -> dict:
    tags_str = ", ".join(tmpl["tags"])
    if prose:
        context     = prose.get("context")     or tmpl["context"]
        points      = prose.get("points")      or tmpl["points"]
        conclusions = prose.get("conclusions") or tmpl["conclusions"]
    else:
        context     = tmpl["context"]
        points      = tmpl["points"]
        conclusions = tmpl["conclusions"]

    content = f"""---
id: {disc_id}
title: "{tmpl['title']}"
date: {dt.strftime('%Y-%m-%d')}
status: concluded
provenance: collaborative
summary: {tmpl['summary']}
outcome:
  type: none
  id: null
  summary: {tmpl['outcome_summary']}
tags: [{tags_str}]
---

# Context
{context}

# Discussion Points
{points}

# Conclusions
{conclusions}
"""
    write_file(os.path.join(out, ".project-memory", "discussions", f"{disc_id}.md"), content)
    return {
        "id": disc_id,
        "title": tmpl["title"],
        "date": dt.strftime('%Y-%m-%d'),
        "tags": tags_str,
        "summary": tmpl["summary"],
    }

def write_discussions_index(out: str, discussions: list) -> None:
    rows = ["# Discussions Index\n\n| Date | ID | Status | Outcome | Tags | Summary |\n|---|---|---|---|---|---|\n"]
    for d in reversed(discussions):
        rows.append(f"| {d['date']} | {d['id']} | concluded | none | {d['tags']} | {d['summary']} |\n")
    write_file(os.path.join(out, ".project-memory", "discussions", "index.md"), ''.join(rows))

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    args = parse_args()
    rng = random.Random(args.seed)

    today_d = date.today()
    start_d = today_d - timedelta(days=int(args.time_years * 365))
    end_d   = today_d - timedelta(days=30)

    if end_d <= start_d:
        print("Error: --time-years is too small (end date before start date)", file=sys.stderr)
        sys.exit(1)

    out = args.out
    print(f"Generating corpus in: {os.path.abspath(out)}")

    # Config + summaries
    write_config(out)
    write_summaries(out)

    # ---- Pre-compute dates and template assignments ----
    phase_dates      = generate_dates(args.phases, start_d, end_d, rng)
    num_discussions  = max(10, args.decisions // 5)
    decision_dates   = generate_dates(args.decisions, start_d, end_d, rng)
    discussion_dates = generate_dates(num_discussions, start_d, end_d, rng)

    phase_tmpls      = [PHASE_TEMPLATES[i % len(PHASE_TEMPLATES)]    for i in range(args.phases)]
    decision_tmpls   = [DECISION_TEMPLATES[i % len(DECISION_TEMPLATES)] for i in range(args.decisions)]
    decision_services = [SERVICES[i % len(SERVICES)]                  for i in range(args.decisions)]
    discussion_tmpls = [DISCUSSION_TEMPLATES[i % len(DISCUSSION_TEMPLATES)] for i in range(num_discussions)]

    # ---- Optional LLM prose generation ----
    decision_prose_list  = [None] * args.decisions
    phase_prose_list     = [None] * args.phases
    discussion_prose_list = [None] * num_discussions

    api_key = None
    if args.llm:
        if args.llm_provider == "openrouter":
            api_key = args.api_key or os.environ.get("OPENROUTER_API_KEY")
            if not api_key:
                print("Error: --api-key or OPENROUTER_API_KEY required for openrouter provider.", file=sys.stderr)
                sys.exit(1)
        else:
            check = subprocess.run(["claude", "--version"], capture_output=True)
            if check.returncode != 0:
                print("Error: 'claude' CLI not found on PATH.", file=sys.stderr)
                sys.exit(1)
        print(f"LLM prose generation: provider={args.llm_provider} model={args.llm_model} "
              f"batch={args.llm_batch} workers={args.llm_workers}")

        decision_specs = [
            {"service": decision_services[i], "title": _fill_tmpl(decision_tmpls[i]["title_tmpl"], decision_services[i]),
             "domain": decision_tmpls[i]["touches"][0], "options": decision_tmpls[i]["options"],
             "chosen": decision_tmpls[i]["chosen"]}
            for i in range(args.decisions)
        ]
        phase_specs = [
            {"title": f"{phase_tmpls[i][1]} {phase_tmpls[i][2]} {phase_tmpls[i][3]}",
             "domain": phase_tmpls[i][0], "date": phase_dates[i].strftime("%Y-%m-%d")}
            for i in range(args.phases)
        ]
        discussion_specs = [
            {"title": discussion_tmpls[i]["title"], "tags": discussion_tmpls[i]["tags"]}
            for i in range(num_discussions)
        ]

        decision_prose_list, phase_prose_list, discussion_prose_list = generate_llm_prose(
            args.llm_provider, args.llm_model, api_key,
            args.llm_batch, args.llm_workers,
            decision_specs, phase_specs, discussion_specs,
        )

    # ---- Phases ----
    phase_ids_used: set = set()
    phases = []
    print(f"  Writing {args.phases} phases ", end="", flush=True)
    for i, dt in enumerate(phase_dates):
        tmpl = phase_tmpls[i]
        phase_id = make_phase_id(dt, f"{tmpl[1]} {tmpl[2]} {tmpl[3]}", phase_ids_used)
        p = write_phase(out, phase_id, dt, tmpl, rng, prose=phase_prose_list[i])
        phases.append(p)
        if (i + 1) % 100 == 0:
            print(".", end="", flush=True)
    print(f" done")

    write_phases_index(out, phases)

    # ---- Decisions ----
    decision_ids_used: set = set()
    decisions = []
    print(f"  Writing {args.decisions} decisions ", end="", flush=True)
    for i, dt in enumerate(decision_dates):
        tmpl    = decision_tmpls[i]
        service = decision_services[i]
        decision_id = make_decision_id(dt, tmpl["slug_base"], decision_ids_used)
        d = write_decision(out, decision_id, dt, tmpl, service, prose=decision_prose_list[i])
        decisions.append(d)
        if (i + 1) % 100 == 0:
            print(".", end="", flush=True)
    print(f" done")

    write_decisions_index(out, decisions)

    # ---- Discussions ----
    discussion_ids_used: set = set()
    discussions = []
    print(f"  Writing {num_discussions} discussions ", end="", flush=True)
    for i, dt in enumerate(discussion_dates):
        tmpl    = discussion_tmpls[i]
        disc_id = make_discussion_id(dt, tmpl["slug"], discussion_ids_used)
        d = write_discussion(out, disc_id, dt, tmpl, prose=discussion_prose_list[i])
        discussions.append(d)
        if (i + 1) % 100 == 0:
            print(".", end="", flush=True)
    print(f" done")

    write_discussions_index(out, discussions)

    mode = f"LLM ({args.llm_model})" if args.llm else "template"
    print(f"Generated {args.phases} phases, {args.decisions} decisions, {num_discussions} discussions "
          f"[{mode}] -> {os.path.abspath(out)}")

if __name__ == "__main__":
    main()

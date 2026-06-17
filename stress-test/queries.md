# Stress-Test Query Suite

These questions are designed to probe the semantic search index built from the generated corpus.
Each question requires the search system to reason across time, domain, and cross-cutting concerns.

---

## Temporal Queries

1. About 18 months ago we were choosing our database connection-pooling strategy. What alternatives
   did we evaluate and reject, and what were the stated reasons for not choosing them?

2. Which decisions made in the first year of the project are most likely to conflict with adopting an
   event-sourcing architecture today? List the decision IDs and the specific tension each creates.

3. We migrated our API gateway roughly two years ago. What phases and decisions cluster around that
   period, and is there any unresolved follow-up work that was deferred at the time?

4. In the six months after we chose our primary database, what secondary decisions were made that
   lock us further into that choice? Identify any that would be costly to reverse together.

5. Looking at the earliest quarter of recorded decisions, which ones touched authentication or
   session management, and how have those constraints shaped later decisions in the same domain?

---

## Cross-Cutting Semantic Queries

6. Which phases involved migration work — moving data, schema changes, or traffic cut-overs — that
   could have introduced silent data-integrity risks? What mitigations were recorded?

7. What caching-related decisions have we made across all services, and do any of them impose
   contradictory invalidation strategies that could produce stale-read bugs in a shared cache?

8. Across all phases tagged with "infrastructure" or "deployment", what recurring failure modes or
   lessons-learned appear? Is there a pattern that suggests a systemic gap in our deployment process?

9. Which decisions touch both "security" and at least one of "api", "auth", or "payments"? For each,
   summarise the constraint imposed and whether a later decision superseded or reinforced it.

10. Find all discussions that concluded with outcome type "none" (no decision, no phase). Do any of
    them cover topics that were later addressed by a decision anyway? Identify the latent duplicates.

---

## Conflict Detection

11. I want to replace our current async message broker with Redis Streams. Which past decisions
    explicitly chose the current broker, what alternatives were rejected at the time, and which
    other decisions depend on the broker choice and would need revisiting?

12. We are considering moving from REST to gRPC for all internal service communication. List every
    decision and phase that assumes HTTP/REST semantics, ordered by how hard they would be to
    reverse.

13. Our new CISO wants to switch password hashing from bcrypt to Argon2id. Does any existing
    decision already cover this? If so, what was the rationale for the original choice, and are
    there any downstream decisions or phases that reference the hashing algorithm directly?

14. We want to consolidate all object storage under a single provider. Identify decisions that lock
    individual services to specific storage backends, and flag any that carry data-residency or
    compliance constraints that would complicate consolidation.

15. The analytics team proposes moving the data warehouse from the current solution to a columnar
    lakehouse. Which phases built ETL pipelines or data models that assume the current warehouse
    schema or API, and which decisions defined the data-retention policy that would need to
    change alongside the migration?

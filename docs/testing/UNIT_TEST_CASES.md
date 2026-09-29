# Unit Test Case Specification — v1

| Field | Value |
|--------|--------|
| Document | TEST-001 |
| Scope | Domain unit tests (no live LLM/S3/Rabbit) |
| Framework | JUnit 5 + AssertJ + Mockito (backend) |

**Rule:** Every case below must exist as an automated test before the feature is “Done”.

Naming: `UnitName_condition_expectedResult`

---

## PRD-01 Auth & RBAC

| ID | Unit | Condition | Expected |
|----|------|-----------|----------|
| UT-01-01 | PermissionGuard | INSTRUCTOR + COURSE_CREATE | allow |
| UT-01-02 | PermissionGuard | STUDENT + COURSE_CREATE | deny (403 domain exception) |
| UT-01-03 | PermissionGuard | CONTENT_OWNER + SOURCE_PUBLISH | allow |
| UT-01-04 | PermissionGuard | INSTRUCTOR + SOURCE_PUBLISH | deny |
| UT-01-05 | OrgIsolation | user org A reads course org B | deny |
| UT-01-06 | AuthFilter | missing X-User-Id | 401 |
| UT-01-07 | RolePermissions | STUDENT permissions set | contains QUIZ_ATTEMPT, not CONTENT_GENERATE |

---

## PRD-02 Organization

| ID | Unit | Condition | Expected |
|----|------|-----------|----------|
| UT-02-01 | OrganizationService.create | valid name | org persisted ACTIVE |
| UT-02-02 | OrganizationService.create | blank name | validation error |
| UT-02-03 | OrganizationService.addUser | valid role | membership created |
| UT-02-04 | OrganizationService.addUser | invalid role string | validation error |
| UT-02-05 | OrganizationService.addUser | duplicate membership | idempotent or conflict per spec (choose conflict) |

---

## PRD-03 Source Material & Versioning

| ID | Unit | Condition | Expected |
|----|------|-----------|----------|
| UT-03-01 | SourceMaterialService.create | same org | material DRAFT/ACTIVE |
| UT-03-02 | SourceVersionService.upload | application/pdf | version_number=1 DRAFT |
| UT-03-03 | SourceVersionService.upload | application/msword | reject FILE_TYPE_NOT_ALLOWED |
| UT-03-04 | SourceVersionService.upload | size &gt; max | reject FILE_TOO_LARGE |
| UT-03-05 | SourceVersionService.upload | second PDF | version_number=2 |
| UT-03-06 | SourceVersionService.publish | version DRAFT | status→PROCESSING then event scheduled |
| UT-03-07 | SourceVersionService.publish | already PUBLISHED | reject ILLEGAL_STATE |
| UT-03-08 | SourceVersion immutability | attempt mutate published content fields | rejected |
| UT-03-09 | Version numbering | concurrent create mocked sequential | monotonic |

---

## PRD-04 PDF Parsing & Hashing

| ID | Unit | Condition | Expected |
|----|------|-----------|----------|
| UT-04-01 | TextNormalizer | spaces/newlines variants | same normalized string |
| UT-04-02 | ContentHasher | same normalized input | identical SHA-256 |
| UT-04-03 | ContentHasher | one character change | different hash |
| UT-04-04 | SectionDiffEngine | identical section maps | empty MODIFIED/ADDED/REMOVED |
| UT-04-05 | SectionDiffEngine | text changed same key | MODIFIED |
| UT-04-06 | SectionDiffEngine | key only in new | ADDED |
| UT-04-07 | SectionDiffEngine | key only in old | REMOVED |
| UT-04-08 | SectionDiffEngine | title change same body hash | METADATA_CHANGED or RENAMED per rules |
| UT-04-09 | StableKeyFactory | same outline path | stable external_reference |
| UT-04-10 | Chunker | long section | ordered chunk_index contiguous |

---

## PRD-05 Course Authoring

| ID | Unit | Condition | Expected |
|----|------|-----------|----------|
| UT-05-01 | CourseService.create | source in same org | course DRAFT bound to version |
| UT-05-02 | CourseService.create | source other org | deny |
| UT-05-03 | StructureApplier | AI structure DTO | chapters/topics sequenced from 1 |
| UT-05-04 | ChapterReorder | move topic to index | sequences compact unique |
| UT-05-05 | CourseStatusTransition | DRAFT→PUBLISHED without approve gate | blocked by publish service (cross PRD-07) |
| UT-05-06 | CourseService.markUpdateRequired | sync impact exists | status UPDATE_REQUIRED |

---

## PRD-06 AI Content Generation

| ID | Unit | Condition | Expected |
|----|------|-----------|----------|
| UT-06-01 | SchemaValidator | valid explanation JSON | pass |
| UT-06-02 | SchemaValidator | missing required field | fail |
| UT-06-03 | GroundingValidator | cited section not in retrieved set | fail |
| UT-06-04 | GenerationService | fake AiProvider success | asset+version+mappings saved |
| UT-06-05 | GenerationService | AiProvider throws | operation FAILED; no asset version row |
| UT-06-06 | GenerationService.regenerate | existing asset | version_number=2; v1 remains |
| UT-06-07 | MappingWriter | 2 sections used | 2 mapping rows PRIMARY/SUPPORTING |
| UT-06-08 | PromptRegistry | QUIZ_GENERATION | returns versioned template |

---

## PRD-07 Review & Publish

| ID | Unit | Condition | Expected |
|----|------|-----------|----------|
| UT-07-01 | ContentEditService | patch body | manual_modification=true |
| UT-07-02 | ApproveService | PENDING_REVIEW | APPROVED + approved_by |
| UT-07-03 | RejectService | PENDING_REVIEW | REJECTED |
| UT-07-04 | PublishService | required pending | COURSE_PUBLISH_BLOCKED |
| UT-07-05 | PublishService | all required approved | course PUBLISHED |
| UT-07-06 | PublishService | allowIncomplete optional only | published; audit flag set |

---

## PRD-08 Lineage

| ID | Unit | Condition | Expected |
|----|------|-----------|----------|
| UT-08-01 | LineageQuery.bySection | 3 assets mapped | returns 3 |
| UT-08-02 | LineageQuery.byAsset | 2 sections | returns 2 |
| UT-08-03 | SyncPolicyService | set MANUAL | policy persisted |
| UT-08-04 | RecommendationFilter | CUSTOM relationship | excluded from auto REGENERATE list |
| UT-08-05 | RecommendationFilter | MANUAL policy + same change signature | suppressed |

---

## PRD-09 Change Detection & Sync

| ID | Unit | Condition | Expected |
|----|------|-----------|----------|
| UT-09-01 | SyncEventFactory | first event | DETECTED with idempotency_key |
| UT-09-02 | SyncEventFactory | duplicate key | returns existing; no second row |
| UT-09-03 | ChangeDetectionService | only typos (small delta) | change present; impact LOW |
| UT-09-04 | ChangeDetectionService | formula change heuristic | HIGH |
| UT-09-05 | ChangeDetectionService | section removed | HIGH for dependents |
| UT-09-06 | ImpactAnalyzer | section with 2 assets | 2 impact_analysis rows |
| UT-09-07 | ImpactAnalyzer | no lineage | zero impacts |
| UT-09-08 | SyncActionService | REGENERATE selected | new draft version; action IN_PROGRESS→COMPLETED |
| UT-09-09 | SyncActionService | IGNORE | impact closed; no regen |
| UT-09-10 | SyncActionService | manual_modification asset | REVIEW_CONFLICT; no overwrite |
| UT-09-11 | NotificationService | impacts identified | in-app notification to instructors |
| UT-09-12 | CourseStatus | open HIGH impacts | UPDATE_REQUIRED |
| UT-09-13 | Idempotent consumer | message redelivered | single sync_event |

---

## PRD-10 Student Learning

| ID | Unit | Condition | Expected |
|----|------|-----------|----------|
| UT-10-01 | StudentCourseQuery | DRAFT course | not listed |
| UT-10-02 | StudentCourseQuery | PUBLISHED same org | listed |
| UT-10-03 | QuizScoring | all correct MCQ | score 100 |
| UT-10-04 | QuizScoring | half correct | score 50 |
| UT-10-05 | ProgressService | topic completed | topic 100%; course aggregate recalculated |
| UT-10-06 | MasteryService | after attempts | mastery_score updated; no slow/fast label field |

---

## PRD-11 Video Generation

| ID | Unit | Condition | Expected |
|----|------|-----------|----------|
| UT-11-01 | SchemaValidator | valid VIDEO JSON | pass |
| UT-11-02 | SchemaValidator | missing scenes | fail |
| UT-11-03 | HeuristicAiProvider | VIDEO schema | scenes + citedSectionIds |
| UT-11-04 | GenerationService | generate VIDEO | asset+version+mappings |

---

## PRD-12 Multilingual

| ID | Unit | Condition | Expected |
|----|------|-----------|----------|
| UT-12-01 | StudentPreferenceService | set language hi | persisted |
| UT-12-02 | ContentLocaleResolver | preferred hi, only en exists | fallback en |

---

## PRD-13 Learning Pace

| ID | Unit | Condition | Expected |
|----|------|-----------|----------|
| UT-13-01 | StudentPreferenceService | set pace EASY | persisted |
| UT-13-02 | ContentLocaleResolver | preferred EASY missing | fallback MEDIUM |
| UT-13-03 | LessonPersonalizer | explanation EASY | step-by-step + simplified + practice example |
| UT-13-04 | LessonPersonalizer | explanation HARD | advanced + deeper concepts + additional example |
| UT-13-05 | LessonPersonalizer | quiz EASY | Practice framing; fewer questions |
| UT-13-06 | LessonPersonalizer | quiz HARD | Challenge framing; all questions |
| UT-13-07 | LessonPersonalizer | video EASY vs HARD | fewer/shorter scenes vs fuller/deeper |

---

## PRD-14 Course Create Autogen

| ID | Unit | Condition | Expected |
|----|------|-----------|----------|
| UT-14-01 | CourseBootstrapService | generateDrafts=false | no structure op |
| UT-14-02 | CourseBootstrapService | generateDrafts=true | structure op enqueued |

---

## Cross-Cutting

| ID | Unit | Condition | Expected |
|----|------|-----------|----------|
| UT-X-01 | CorrelationIdFilter | inbound request | MDC/correlation present |
| UT-X-02 | ApiErrorHandler | domain not found | `{code,message,correlationId}` |
| UT-X-03 | OperationService | job running | progress 0–100 queryable |
| UT-X-04 | AuditService | publish course | COURSE_PUBLISHED entry |

---

## Implementation Notes for Engineers

1. Put pure functions (`TextNormalizer`, `ContentHasher`, `SectionDiffEngine`, `ImpactRuleEngine`, `QuizScorer`, `PermissionGuard`) in testable packages with **zero Spring dependencies**.
2. Service tests: mock repositories and `AiProvider`.
3. Do not mark PRD Done if its UT-* rows are missing or `@Disabled` without issue link.

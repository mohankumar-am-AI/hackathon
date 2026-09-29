# PRD-13 — Learning Pace (Easy / Medium / Hard)

| Field | Value |
|--------|--------|
| Status | Ready |
| Priority | P1 |
| Module | `content` + `student` |
| Sprint | S12 |

## 1. Problem
Students need different depth and quiz difficulty (easy / medium / hard) for the **same** topic and source — one published lesson, different learner experience.

## 2. Goals
- Support `pace` preference: EASY | MEDIUM | HARD.
- Student preference selects pace; student layer personalizes approved explanation / quiz / video.
- **Same concept → differentiated experience:**

| Pace | Learner intent | Experience |
|------|----------------|------------|
| **HARD** | Fast / advanced | Advanced explanation, additional examples, challenge questions, deeper concepts |
| **EASY** | Slow / scaffolding | Simplified explanation, step-by-step content, practice examples, practice questions |
| **MEDIUM** | Default | Approved content with light framing |

## 3. Non-Goals
- Adaptive path engine that auto-changes pace mid-course (Phase 2).
- Permanent “slow/fast learner” labels on the student profile (use pace preference only).
- Separate instructor-approved asset versions per pace in v1 (personalize at read time from one APPROVED asset).

## 4. Domain Rules
- Pace affects explanation structure/depth, video scene count/narration, and quiz framing — still grounded in the same approved JSON / quiz rows.
- No inventing new quiz question IDs (scoring must keep real question UUIDs).
- Unique presentation key: `(topic_id, asset_type, language, pace)` via personalization at read time.
- Missing pace preference → MEDIUM.

## 5. Data
- `student_preferences.preferred_pace`
- Personalized payload includes root `pace` (+ `language`) on explanation/video JSON.

## 6. API
- Preferences include `preferredPace`
- Student topic lesson returns personalized explanation / quiz / video for current preference

## 7. Acceptance Criteria
- [x] Student preference EASY returns simplified, step-by-step explanation with practice framing
- [x] Student preference HARD returns advanced explanation with deeper concepts + challenge framing
- [x] EASY quiz uses practice framing and fewer questions; HARD uses challenge framing
- [x] EASY video keeps fewer/shorter scenes; HARD keeps fuller scenes with deeper narration
- [x] MEDIUM stays close to approved content
- [x] Missing pace falls back to MEDIUM

## 8. Unit Test Cases
See UNIT_TEST_CASES §PRD-13.

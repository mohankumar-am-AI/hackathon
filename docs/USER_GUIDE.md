# User Guide — Adaptive Learning Platform (ALP)

This guide walks through the demo UI with **mock auth** (Org + Role in the top bar). Keep the **same Org** for the whole flow.

**Roles**

| Role | What you do |
|------|-------------|
| **CONTENT_OWNER** | Create/upload source PDFs, publish versions |
| **INSTRUCTOR** | Create courses, generate/approve content, sync, publish courses |
| **STUDENT** | Browse published courses, set language/pace, learn & quiz |

---

## 0. Start the app

1. Start infra (Postgres, RabbitMQ, MinIO) if needed: `docker compose up -d`
2. Backend: `cd backend` → `.\mvnw.cmd spring-boot:run`
3. Frontend: `cd frontend` → `npm run dev`
4. Open http://localhost:5173

---

## 1. Create an organization

1. Top bar: Role can stay **CONTENT_OWNER** (or any role).
2. Sidebar → **Organizations**.
3. Enter a name (e.g. `Physics Academy`) → create.
4. In the top bar **Org** dropdown, select that organization.
5. Confirm the green banner shows your org name and id.

You will use this org for source materials, courses, and students.

---

## 2. Upload and publish a source PDF (CONTENT_OWNER)

1. Top bar: Role = **CONTENT_OWNER**, Org = your org.
2. Sidebar → **Source Materials**.
3. Create a material (title), then **upload a PDF**.
4. Wait until parse finishes (operation completes).
5. **Publish** that source version.

Only **published** source versions can be bound to a course.

---

## 3. Create a course and content (INSTRUCTOR)

1. Top bar: Role = **INSTRUCTOR**, same Org.
2. Sidebar → **Course Authoring**.
3. **Create DRAFT course**
   - Title (e.g. Physics 101)
   - Select the source material + **published** version
4. If chapters are empty → **Regenerate structure** (waits for the async job).
5. Select a few topics (e.g. **Select first 3**) → **Generate selected**.
   - Generation can take up to ~1 minute (includes MP4 render).
6. When assets appear as `PENDING_REVIEW`:
   - Use the **Needs approval** panel, or click `[EXPLANATION:PENDING_REVIEW]` etc.
   - **Open** → review → **Approve** (do EXPLANATION + QUIZ; VIDEO optional).
7. Click **Publish (allow incomplete)** so students can see the course even if not every topic is ready.

**Important:** Students only see courses with status **PUBLISHED**.

---

## 4. Student view (STUDENT)

1. Top bar: Role = **STUDENT**, **same Org**.
2. Sidebar → **Student Learning**.
3. **My preferences**
   - Language: English / Hindi / Spanish  
   - Learning pace: Easy / Medium / Hard  
   - Click **Save preferences** (reloads the open lesson).
4. Under **Courses**, open a published course (e.g. Physics 101).
5. **Topics** list shows only topics with **approved** explanation + quiz.
6. Open a topic:
   - MP4 lesson video (when VIDEO was approved)
   - Explanation
   - Quiz → Submit

If the course list is empty:

- Course may still be **DRAFT**, or  
- After a PDF update it may be **UPDATE_REQUIRED** → instructor must **Publish (allow incomplete)** again.

---

## 5. Update the PDF version (sync → review → students)

When the textbook PDF changes, **do not create a new course**. Update the source version and sync.

### 5.1 Upload a new version (CONTENT_OWNER)

1. Role = **CONTENT_OWNER**, same Org.
2. **Source Materials** → open the **existing** material (not a new one).
3. Upload a **new PDF** as the next version.
4. Wait for parse → **Publish** the new version.

### 5.2 Instructor reviews impact (INSTRUCTOR)

1. Role = **INSTRUCTOR**, same Org.
2. Sidebar → **Synchronization**.
3. Select the latest sync event.
4. Impact shows **one row per affected asset** (HIGH/MEDIUM/LOW).
5. For each (or **Regenerate all open**):
   - **Regenerate** — create a new draft from the new source  
   - **Ignore / Accept / Reject** — as needed  
6. Go to **Course Authoring** → select the course.
7. Use **Needs approval** → **Open** / **Approve** regenerated assets.

### 5.3 Make it visible to students again

After a source update, the course often becomes **UPDATE_REQUIRED** (hidden from students).

1. Course Authoring → select the course.
2. Click **Publish (allow incomplete)** again.
3. Status must be **PUBLISHED**.

### 5.4 What enrolled students see

- Enrollment stays on the **same course** (no re-enroll).
- After re-publish + approve, students **Refresh** Student Learning and open topics again.
- They see the **latest APPROVED** content. Drafts are never shown.

---

## 6. Quick reference

| Goal | Role | Screen | Key action |
|------|------|--------|------------|
| Create org | any | Organizations | Create + select in top bar |
| Add PDF | CONTENT_OWNER | Source Materials | Upload → Publish version |
| Build course | INSTRUCTOR | Course Authoring | Create → structure → generate → approve → Publish |
| Preview as instructor | INSTRUCTOR | Course Authoring | Select course → **Preview: …** / **Preview lesson** |
| Learn | STUDENT | Student Learning | Prefs → open course → topic |
| New PDF version | CONTENT_OWNER then INSTRUCTOR | Source Materials → Sync → Course Authoring | Publish version → Regenerate → Approve → Publish course |

---

## 7. Tips

- Always keep the **same Org** in the top bar.
- Prefer **Publish (allow incomplete)** for demos with a few ready topics.
- Generation/sync can take time; wait for operation status **COMPLETED**.
- Language/pace change how the lesson is presented; save prefs then reopen the topic.
  - **Easy** = step-by-step + practice examples/questions.
  - **Hard** = advanced explanation + deeper concepts + challenge questions.
- Instructors can **Preview lesson** on a topic in Course Authoring (learner layout) without switching to STUDENT.
- VIDEO is optional for publish; EXPLANATION + QUIZ must be approved for a topic to appear for students.

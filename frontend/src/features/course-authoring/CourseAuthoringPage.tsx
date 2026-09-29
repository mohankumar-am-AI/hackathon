import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../services/auth-context";
import {
  apiGet,
  apiGetBlob,
  apiPatch,
  apiPost,
  apiPut,
  type AuthIdentity,
  type CourseDetailResponse,
  type CourseResponse,
  type OperationResponse,
  type SourceMaterialResponse,
  type SourceVersionResponse,
} from "../../services/api";

type ContentAssetSummary = {
  id: string;
  assetType: string;
  status: string;
  currentVersionId: string | null;
};

export function CourseAuthoringPage() {
  const { identity, setRole } = useAuth();
  const [courses, setCourses] = useState<CourseResponse[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CourseDetailResponse | null>(null);
  const [materials, setMaterials] = useState<SourceMaterialResponse[]>([]);
  const [versions, setVersions] = useState<SourceVersionResponse[]>([]);
  const [title, setTitle] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operation, setOperation] = useState<OperationResponse | null>(null);
  const [assetsByTopic, setAssetsByTopic] = useState<Record<string, ContentAssetSummary[]>>({});
  const [assetPreview, setAssetPreview] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [editJson, setEditJson] = useState("");
  const [lineageInfo, setLineageInfo] = useState<string | null>(null);
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());
  const [pendingReview, setPendingReview] = useState<
    { id: string; topicId: string; topicTitle: string; assetType: string; status: string }[]
  >([]);
  const [lessonPreview, setLessonPreview] = useState<{
    topicId: string;
    title: string;
    explanationJson: string | null;
    quiz: { title: string; questions: { sequence: number; prompt: string; optionsJson: string }[] } | null;
    videoJson: string | null;
    videoMp4Url?: string | null;
    appliedPace?: string;
  } | null>(null);
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);

  function courseAuth(): AuthIdentity {
    if (identity.role !== "INSTRUCTOR") {
      setRole("INSTRUCTOR");
    }
    return { ...identity, role: "INSTRUCTOR" };
  }

  useEffect(() => {
    if (identity.role !== "INSTRUCTOR") {
      setRole("INSTRUCTOR");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    closeLessonPreview();
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCourses = useCallback(async () => {
    const auth = { ...identity, role: "INSTRUCTOR" as const };
    try {
      const data = await apiGet<CourseResponse[]>("/api/v1/courses", auth);
      setCourses(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load courses");
    }
  }, [identity]);

  const loadPendingReview = useCallback(
    async (courseId: string) => {
      const auth = { ...identity, role: "INSTRUCTOR" as const };
      try {
        const pending = await apiGet<
          { id: string; topicId: string; topicTitle: string; assetType: string; status: string }[]
        >(`/api/v1/courses/${courseId}/content-assets/pending-review`, auth);
        setPendingReview(pending);
      } catch {
        setPendingReview([]);
      }
    },
    [identity]
  );

  const loadAssetsForTopic = useCallback(
    async (courseId: string, topicId: string) => {
      const auth = { ...identity, role: "INSTRUCTOR" as const };
      try {
        const assets = await apiGet<ContentAssetSummary[]>(
          `/api/v1/courses/${courseId}/topics/${topicId}/content-assets`,
          auth
        );
        setAssetsByTopic((prev) => ({ ...prev, [topicId]: assets }));
      } catch {
        /* ignore */
      }
    },
    [identity]
  );

  const loadDetail = useCallback(
    async (courseId: string) => {
      const auth = { ...identity, role: "INSTRUCTOR" as const };
      try {
        const data = await apiGet<CourseDetailResponse>(`/api/v1/courses/${courseId}`, auth);
        setDetail(data);
        setAssetsByTopic({});
        await loadPendingReview(courseId);
        // Prefetch assets only for the first few topics (avoid N requests on huge outlines).
        const firstTopics = data.chapters.flatMap((ch) => ch.topics).slice(0, 8);
        for (const t of firstTopics) {
          await loadAssetsForTopic(courseId, t.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load course");
      }
    },
    [identity, loadAssetsForTopic, loadPendingReview]
  );

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else {
      setDetail(null);
      setAssetsByTopic({});
      setAssetPreview(null);
      setSelectedAssetId(null);
      setEditJson("");
    }
    setSelectedTopicIds(new Set());
  }, [selectedId, loadDetail]);

  useEffect(() => {
    void (async () => {
      const auth = { ...identity, role: "INSTRUCTOR" as const };
      try {
        const data = await apiGet<SourceMaterialResponse[]>("/api/v1/source-materials", auth);
        setMaterials(data);
        if (data.length > 0 && !materialId) setMaterialId(data[0].id);
      } catch (err) {
        setMaterials([]);
        setError(err instanceof Error ? err.message : "Failed to load materials");
      }
    })();
  }, [identity]);

  useEffect(() => {
    if (!materialId) {
      setVersions([]);
      setVersionId("");
      return;
    }
    void (async () => {
      const auth = { ...identity, role: "INSTRUCTOR" as const };
      try {
        const data = await apiGet<SourceVersionResponse[]>(
          `/api/v1/source-materials/${materialId}/versions`,
          auth
        );
        const published = data.filter((v) => v.status === "PUBLISHED");
        setVersions(published);
        setVersionId(published[0]?.id ?? "");
      } catch {
        setVersions([]);
        setVersionId("");
      }
    })();
  }, [materialId, identity]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!materialId || !versionId) {
      setError("Select a material and a published source version");
      return;
    }
    const auth = courseAuth();
    setMessage(null);
    setError(null);
    try {
      const created = await apiPost<CourseResponse & { bootstrapOperationId?: string }>("/api/v1/courses", auth, {
        generateDrafts: true,
        title,
        description: "",
        sourceMaterialId: materialId,
        sourceVersionId: versionId,
        language: "en",
        audience: "Grade 10",
        level: "Beginner",
        durationHours: 20,
      });
      setTitle("");
      setSelectedId(created.id);
      setMessage(
        created.bootstrapOperationId
          ? `Created ${created.title} · structure bootstrap ${created.bootstrapOperationId.slice(0, 8)}…`
          : `Created course ${created.title} (${created.status})`
      );
      await loadCourses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function onGenerateStructure() {
    if (!selectedId) return;
    const auth = courseAuth();
    setMessage(null);
    setError(null);
    try {
      const accepted = await apiPost<{ operationId: string; status: string; progress: number }>(
        `/api/v1/courses/${selectedId}/generate-structure`,
        auth,
        {}
      );
      setMessage(`Structure generation started: ${accepted.operationId}`);
      for (let i = 0; i < 90; i++) {
        const op = await apiGet<OperationResponse>(`/api/v1/operations/${accepted.operationId}`, auth);
        setOperation(op);
        if (op.status === "COMPLETED" || op.status === "FAILED") {
          setMessage(
            op.status === "COMPLETED"
              ? `Structure ready — ${op.resultJson ?? ""}`
              : `Structure failed: ${op.errorMessage ?? op.errorCode}`
          );
          await loadDetail(selectedId);
          return;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      setError("Timed out waiting for structure. Reload the course — it may have finished.");
      await loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed");
    }
  }

  async function moveTopic(chapterId: string, topicId: string, targetIndex: number) {
    if (!selectedId) return;
    const auth = courseAuth();
    try {
      await apiPatch(`/api/v1/courses/${selectedId}/chapters/${chapterId}/topics/reorder`, auth, {
        topicId,
        targetIndex,
      });
      await loadDetail(selectedId);
      setMessage("Topic reordered (ids preserved).");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reorder failed");
    }
  }

  async function onGenerateContent(topicId: string) {
    if (!selectedId) return;
    const auth = courseAuth();
    setMessage(null);
    setError(null);
    try {
      const accepted = await apiPost<{ operationId: string; status: string; progress: number }>(
        `/api/v1/courses/${selectedId}/topics/${topicId}/generate`,
        auth,
        { assetTypes: ["EXPLANATION", "QUIZ", "VIDEO"] }
      );
      setMessage(`Content generation started (includes MP4 — may take ~1 min): ${accepted.operationId}`);
      for (let i = 0; i < 180; i++) {
        const op = await apiGet<OperationResponse>(`/api/v1/operations/${accepted.operationId}`, auth);
        setOperation(op);
        if (op.status === "COMPLETED" || op.status === "FAILED") {
          setMessage(
            op.status === "COMPLETED"
              ? `Content ready — ${op.resultJson ?? ""}`
              : `Content failed: ${op.errorMessage ?? op.errorCode}`
          );
          await loadAssetsForTopic(selectedId, topicId);
          return;
        }
        if (i > 0 && i % 10 === 0) {
          setMessage(`Still generating… ${op.status} ${op.progress}% (rendering video can take a minute)`);
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      setError("Timed out waiting for generation. Refresh assets — it may have finished in the background.");
      await loadAssetsForTopic(selectedId, topicId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Content generate failed");
    }
  }

  async function onGenerateSelected() {
    if (!selectedId || selectedTopicIds.size === 0) {
      setError("Select one or more topics first (checkboxes).");
      return;
    }
    const ids = [...selectedTopicIds];
    for (let i = 0; i < ids.length; i++) {
      setMessage(`Generating topic ${i + 1}/${ids.length}…`);
      await onGenerateContent(ids[i]);
    }
    setMessage(`Finished generating ${ids.length} topic(s). Approve assets, then Publish (allow incomplete).`);
  }

  function toggleTopic(topicId: string) {
    setSelectedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  }

  function selectFirstTopics(n: number) {
    if (!detail) return;
    const ids = detail.chapters.flatMap((ch) => ch.topics).slice(0, n).map((t) => t.id);
    setSelectedTopicIds(new Set(ids));
  }

  async function previewTopicLesson(topicId: string) {
    const auth = courseAuth();
    setMessage(null);
    setError(null);
    if (previewVideoUrl) {
      URL.revokeObjectURL(previewVideoUrl);
      setPreviewVideoUrl(null);
    }
    try {
      const lesson = await apiGet<{
        topicId: string;
        title: string;
        explanationJson: string | null;
        quiz: { title: string; questions: { sequence: number; prompt: string; optionsJson: string }[] } | null;
        videoJson: string | null;
        videoMp4Url?: string | null;
        appliedPace?: string;
      }>(`/api/v1/student/topics/${topicId}`, auth);
      setLessonPreview(lesson);
      setMessage(`Instructor preview: ${lesson.title}`);
      if (lesson.videoMp4Url) {
        void apiGetBlob(lesson.videoMp4Url, auth)
          .then((blob) => setPreviewVideoUrl(URL.createObjectURL(blob)))
          .catch(() => setPreviewVideoUrl(null));
      }
      requestAnimationFrame(() => {
        document.getElementById("instructor-lesson-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (err) {
      setLessonPreview(null);
      setError(err instanceof Error ? err.message : "Preview failed — generate content for this topic first");
    }
  }

  function closeLessonPreview() {
    if (previewVideoUrl) {
      URL.revokeObjectURL(previewVideoUrl);
      setPreviewVideoUrl(null);
    }
    setLessonPreview(null);
  }

  function parsePreviewExplanation(json: string | null): { title: string; body: string; keyPoints: string[] } | null {
    if (!json) return null;
    try {
      const parsed = JSON.parse(json) as { title?: string; body?: string; keyPoints?: unknown };
      return {
        title: parsed.title?.trim() || "Lesson",
        body: parsed.body?.trim() || "",
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String).filter(Boolean) : [],
      };
    } catch {
      return { title: "Lesson", body: json, keyPoints: [] };
    }
  }

  function parsePreviewOptions(optionsJson: string): string[] {
    try {
      const parsed = JSON.parse(optionsJson) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }

  function parsePreviewScenes(videoJson: string | null): { sequence: number; narration: string; onScreenText: string }[] {
    if (!videoJson) return [];
    try {
      const parsed = JSON.parse(videoJson) as { scenes?: { sequence?: number; narration?: string; onScreenText?: string }[] };
      if (!Array.isArray(parsed.scenes)) return [];
      return parsed.scenes.map((s, i) => ({
        sequence: s.sequence ?? i + 1,
        narration: s.narration ?? "",
        onScreenText: s.onScreenText ?? "",
      }));
    } catch {
      return [];
    }
  }

  async function viewAsset(assetId: string) {
    const auth = courseAuth();
    try {
      const detailAsset = await apiGet<{
        id: string;
        assetType: string;
        status: string;
        currentVersion: {
          versionNumber: number;
          contentJson: string;
          modelName: string;
          manualModification: boolean;
          approvedBy: string | null;
        };
        mappings: { relationshipType: string; sourceSectionId: string }[];
      }>(`/api/v1/content-assets/${assetId}`, auth);
      setSelectedAssetId(assetId);
      setEditJson(detailAsset.currentVersion.contentJson);
      setAssetPreview(
        `${detailAsset.assetType} v${detailAsset.currentVersion.versionNumber} · ${detailAsset.status} · model=${detailAsset.currentVersion.modelName}` +
          (detailAsset.currentVersion.manualModification ? " · manual" : "") +
          (detailAsset.currentVersion.approvedBy
            ? ` · approved_by=${detailAsset.currentVersion.approvedBy.slice(0, 8)}…`
            : "") +
          `\nmappings: ${detailAsset.mappings.map((m) => m.relationshipType).join(", ") || "none"}\n` +
          detailAsset.currentVersion.contentJson
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load asset");
    }
  }

  async function approveAsset() {
    if (!selectedAssetId || !selectedId) return;
    const auth = courseAuth();
    try {
      await apiPost(`/api/v1/content-assets/${selectedAssetId}/approve`, auth, {});
      setMessage("Asset APPROVED — students can see this content.");
      await viewAsset(selectedAssetId);
      await loadPendingReview(selectedId);
      await loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    }
  }

  async function approvePending(assetId: string) {
    if (!selectedId) return;
    const auth = courseAuth();
    try {
      await apiPost(`/api/v1/content-assets/${assetId}/approve`, auth, {});
      setMessage(`Approved ${assetId.slice(0, 8)}…`);
      await loadPendingReview(selectedId);
      await loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    }
  }

  async function rejectAsset() {
    if (!selectedAssetId || !selectedId) return;
    const auth = courseAuth();
    try {
      await apiPost(`/api/v1/content-assets/${selectedAssetId}/reject`, auth, {});
      setMessage("Asset REJECTED");
      await viewAsset(selectedAssetId);
      await loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed");
    }
  }

  async function saveEdit() {
    if (!selectedAssetId || !selectedId) return;
    const auth = courseAuth();
    try {
      await apiPatch(`/api/v1/content-assets/${selectedAssetId}`, auth, { contentJson: editJson });
      setMessage("Asset edited (manual_modification=true)");
      await viewAsset(selectedAssetId);
      await loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Edit failed");
    }
  }

  async function publishCourse(allowIncomplete: boolean) {
    if (!selectedId) return;
    const auth = courseAuth();
    try {
      const published = await apiPost<CourseResponse>(`/api/v1/courses/${selectedId}/publish`, auth, {
        allowIncomplete,
      });
      setMessage(
        allowIncomplete
          ? `Course PUBLISHED (incomplete allowed). Switch role to STUDENT (same Org) — it should appear under Student Learning.`
          : `Course published: ${published.status}`
      );
      await loadCourses();
      await loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    }
  }

  async function showSources() {
    if (!selectedAssetId) return;
    const auth = courseAuth();
    try {
      const sources = await apiGet<
        { title: string | null; externalReference: string | null; relationshipType: string; sourceSectionId: string }[]
      >(`/api/v1/content-assets/${selectedAssetId}/sources`, auth);
      setLineageInfo(
        sources
          .map(
            (s) =>
              `${s.relationshipType}: ${s.externalReference ?? s.sourceSectionId.slice(0, 8)} — ${s.title ?? ""}`
          )
          .join("\n") || "(no sources)"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lineage sources failed");
    }
  }

  async function setSyncPolicy(policy: "AUTO" | "MANUAL") {
    if (!selectedAssetId) return;
    const auth = courseAuth();
    try {
      await apiPut(`/api/v1/content-assets/${selectedAssetId}/sync-policy`, auth, { policy });
      setMessage(`Sync policy set to ${policy}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync policy failed");
    }
  }

  return (
    <section className="page">
      <h1>Course Authoring</h1>
      <p className="muted">PRD-05/06/07 — structure, AI content, review &amp; publish.</p>
      <p className="muted small">
        Role <strong>INSTRUCTOR</strong> · same Org as source. Flow: Generate structure → select a few topics →
        Generate → Approve → <strong>Publish (allow incomplete)</strong>. Use <strong>Preview lesson</strong> on
        a topic to see the learner view without switching to STUDENT.
      </p>
      {message && <div className="banner ok">{message}</div>}
      {error && <div className="banner error">{error}</div>}
      {operation && (
        <div className="banner ok">
          Op {operation.operationId.slice(0, 8)}… · {operation.status} · {operation.progress}%
        </div>
      )}

      <div className="panel-grid">
        <form className="panel" onSubmit={onCreate}>
          <h2>Create course</h2>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            Source material
            <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} required>
              {materials.length === 0 && <option value="">No materials (check org)</option>}
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Published version
            <select value={versionId} onChange={(e) => setVersionId(e.target.value)} required>
              {versions.length === 0 && <option value="">No published versions</option>}
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber} · {v.originalFilename}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!materialId || !versionId || !title.trim()}>
            Create DRAFT course
          </button>
        </form>

        <div className="panel">
          <h2>Courses</h2>
          <ul className="list">
            {courses.map((c) => (
              <li key={c.id}>
                <button type="button" className="linkish" onClick={() => setSelectedId(c.id)}>
                  {c.title}
                </button>
                <span className="muted">
                  {" "}
                  · {c.status} · {c.language}
                </span>
                {selectedId === c.id && <span className="tag">selected</span>}
              </li>
            ))}
            {courses.length === 0 && <li className="muted">No courses yet.</li>}
          </ul>
          {selectedId && (
            <>
              {courses.find((c) => c.id === selectedId)?.status === "UPDATE_REQUIRED" && (
                <p className="banner error" style={{ marginTop: "0.5rem" }}>
                  Status is <strong>UPDATE_REQUIRED</strong> (source PDF changed). After you approve regenerated
                  content, click <strong>Publish (allow incomplete)</strong> so students can see the course again.
                </p>
              )}
              <button type="button" onClick={() => void onGenerateStructure()}>
                Regenerate structure
              </button>{" "}
              <button type="button" onClick={() => void publishCourse(true)}>
                Publish (allow incomplete)
              </button>{" "}
              <button type="button" className="secondary" onClick={() => void publishCourse(false)}>
                Publish (all required)
              </button>
              <p className="muted small" style={{ marginTop: "0.5rem" }}>
                Use <strong>allow incomplete</strong> so students can see the course after a few topics are
                approved. Regenerate structure if you still have hundreds of noisy PDF sections.
              </p>
              {detail && detail.chapters.some((ch) => ch.topics.length > 0) && (
                <div style={{ marginTop: "0.75rem" }}>
                  <p className="muted small">
                    <strong>Instructor preview</strong> (learner layout, stay as INSTRUCTOR):
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                    {detail.chapters
                      .flatMap((ch) => ch.topics)
                      .slice(0, 8)
                      .map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className="secondary"
                          onClick={() => void previewTopicLesson(t.id)}
                        >
                          Preview: {t.title.length > 28 ? `${t.title.slice(0, 28)}…` : t.title}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {detail && pendingReview.length > 0 && (
        <div className="panel" style={{ borderColor: "rgba(224, 168, 80, 0.45)" }}>
          <h2>Needs approval ({pendingReview.length})</h2>
          <p className="muted small">
            These assets are <strong>PENDING_REVIEW</strong> (new generate or sync regenerate). Open → review →
            Approve. Until approved, students do not see them.
          </p>
          <ul className="list">
            {pendingReview.map((p) => (
              <li key={p.id}>
                <strong>{p.topicTitle}</strong> · {p.assetType}{" "}
                <button type="button" className="linkish" onClick={() => void viewAsset(p.id)}>
                  Open
                </button>{" "}
                <button type="button" onClick={() => void approvePending(p.id)}>
                  Approve
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail && (
        <div className="panel">
          <h2>
            Structure · {detail.title} · {detail.status}
          </h2>
          {(() => {
            const topicCount = detail.chapters.reduce((n, ch) => n + ch.topics.length, 0);
            return (
              <p className="muted small">
                {detail.chapters.length} chapter(s) · {topicCount} topic(s)
                {topicCount > 40
                  ? " — too many; click Regenerate structure (filters to lectures, max 40)."
                  : null}
              </p>
            );
          })()}
          {detail.chapters.length === 0 && (
            <p className="muted">No chapters yet — click Regenerate structure.</p>
          )}
          {detail.chapters.length > 0 && (
            <p style={{ marginBottom: "0.75rem" }}>
              <button type="button" onClick={() => selectFirstTopics(3)}>
                Select first 3
              </button>{" "}
              <button type="button" onClick={() => selectFirstTopics(5)}>
                Select first 5
              </button>{" "}
              <button type="button" onClick={() => setSelectedTopicIds(new Set())}>
                Clear selection
              </button>{" "}
              <button
                type="button"
                disabled={selectedTopicIds.size === 0}
                onClick={() => void onGenerateSelected()}
              >
                Generate selected ({selectedTopicIds.size})
              </button>
            </p>
          )}
          <ul className="list">
            {detail.chapters.map((ch) => (
              <li key={ch.id}>
                <strong>
                  Ch{ch.sequence}. {ch.title}
                </strong>
                <ul className="list">
                  {ch.topics.map((t, idx) => (
                    <li key={t.id}>
                      <label style={{ marginRight: "0.35rem" }}>
                        <input
                          type="checkbox"
                          checked={selectedTopicIds.has(t.id)}
                          onChange={() => toggleTopic(t.id)}
                        />
                      </label>
                      T{t.sequence}. {t.title}{" "}
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => void moveTopic(ch.id, t.id, idx - 1)}
                      >
                        ↑
                      </button>{" "}
                      <button
                        type="button"
                        disabled={idx === ch.topics.length - 1}
                        onClick={() => void moveTopic(ch.id, t.id, idx + 1)}
                      >
                        ↓
                      </button>{" "}
                      <button type="button" onClick={() => void onGenerateContent(t.id)}>
                        Generate content
                      </button>{" "}
                      <button type="button" className="secondary" onClick={() => void previewTopicLesson(t.id)}>
                        Preview lesson
                      </button>{" "}
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => selectedId && void loadAssetsForTopic(selectedId, t.id)}
                      >
                        Refresh assets
                      </button>
                      {(assetsByTopic[t.id] ?? []).map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          className="linkish"
                          onClick={() => void viewAsset(a.id)}
                        >
                          {" "}
                          [{a.assetType}:{a.status}]
                        </button>
                      ))}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lessonPreview && (
        <div className="panel" id="instructor-lesson-preview">
          <h2>
            Instructor lesson preview · {lessonPreview.title}{" "}
            {lessonPreview.appliedPace && <span className="tag">{lessonPreview.appliedPace}</span>}
          </h2>
          <p className="muted small">
            Learner layout while staying as <strong>INSTRUCTOR</strong>. Works for DRAFT / PUBLISHED /
            UPDATE_REQUIRED. Pending-review content is visible here; students only see approved content on
            published courses.
          </p>
          {(() => {
            const explanation = parsePreviewExplanation(lessonPreview.explanationJson);
            const scenes = parsePreviewScenes(lessonPreview.videoJson);
            return (
              <>
                {(previewVideoUrl || scenes.length > 0) && (
                  <section className="lesson-section">
                    <h3>Lesson video</h3>
                    {previewVideoUrl && (
                      <video
                        controls
                        src={previewVideoUrl}
                        style={{ width: "100%", maxWidth: 640, borderRadius: 8 }}
                      />
                    )}
                    {scenes.length > 0 && (
                      <ul className="list" style={{ marginTop: "0.5rem" }}>
                        {scenes.map((s) => (
                          <li key={s.sequence}>
                            <strong>
                              Scene {s.sequence}: {s.onScreenText}
                            </strong>
                            <div className="muted small">{s.narration}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}
                <section className="lesson-section">
                  <h3>Explanation</h3>
                  {!explanation && <p className="muted">No explanation generated yet for this topic.</p>}
                  {explanation && (
                    <div className="explanation-card">
                      <h4>{explanation.title}</h4>
                      <p className="explanation-body">{explanation.body}</p>
                      {explanation.keyPoints.length > 0 && (
                        <ul className="key-points">
                          {explanation.keyPoints.map((kp, i) => (
                            <li key={i}>{kp}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </section>
                {lessonPreview.quiz && (
                  <section className="lesson-section quiz-section">
                    <h3>{lessonPreview.quiz.title}</h3>
                    {lessonPreview.quiz.questions.map((q, qi) => (
                      <div key={qi} className="quiz-question">
                        <p className="quiz-prompt">
                          {q.sequence}. {q.prompt}
                        </p>
                        <ul className="list">
                          {parsePreviewOptions(q.optionsJson).map((opt, idx) => (
                            <li key={idx}>{opt}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </section>
                )}
                {!explanation && !lessonPreview.quiz && !lessonPreview.videoJson && (
                  <p className="banner error">
                    No generated content on this topic yet. Click <strong>Generate content</strong>, then preview
                    again.
                  </p>
                )}
              </>
            );
          })()}
          <button type="button" className="secondary" onClick={closeLessonPreview}>
            Close preview
          </button>
        </div>
      )}

      {assetPreview && selectedAssetId && (
        <div className="panel">
          <h2>Asset preview / review</h2>
          <pre className="muted small" style={{ whiteSpace: "pre-wrap" }}>
            {assetPreview}
          </pre>
          <label>
            Edit content JSON
            <textarea
              value={editJson}
              onChange={(e) => setEditJson(e.target.value)}
              rows={8}
              style={{ width: "100%", fontFamily: "monospace", fontSize: "0.85rem" }}
            />
          </label>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
            <button type="button" onClick={() => void saveEdit()}>
              Save edit
            </button>
            <button type="button" onClick={() => void approveAsset()}>
              Approve
            </button>
            <button type="button" onClick={() => void rejectAsset()}>
              Reject
            </button>
            <button type="button" onClick={() => void showSources()}>
              Show sources
            </button>
            <button type="button" onClick={() => void setSyncPolicy("MANUAL")}>
              Sync MANUAL
            </button>
            <button type="button" onClick={() => void setSyncPolicy("AUTO")}>
              Sync AUTO
            </button>
          </div>
          {lineageInfo && (
            <pre className="muted small" style={{ whiteSpace: "pre-wrap", marginTop: "0.75rem" }}>
              {lineageInfo}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}

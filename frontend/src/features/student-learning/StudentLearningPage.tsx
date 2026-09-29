import { useEffect, useState } from "react";
import { useAuth } from "../../services/auth-context";
import { apiGet, apiGetBlob, apiPost, apiPut } from "../../services/api";

type CourseSummary = { id: string; title: string; language: string; status: string };
type TopicNode = { id: string; title: string; sequence: number };
type ChapterNode = { id: string; title: string; sequence: number; topics: TopicNode[] };
type CourseDetail = {
  id: string;
  title: string;
  language: string;
  status: string;
  chapters: ChapterNode[];
};
type QuestionView = { id: string; sequence: number; prompt: string; optionsJson: string };
type QuizView = { id: string; title: string; questions: QuestionView[] };
type VideoScene = { sequence: number; narration: string; onScreenText: string; durationSeconds: number };
type TopicLesson = {
  topicId: string;
  title: string;
  courseId: string;
  explanationJson: string | null;
  quiz: QuizView | null;
  videoJson: string | null;
  videoMp4Url?: string | null;
  appliedLanguage?: string;
  appliedPace?: string;
};
type ProgressView = {
  courseId: string;
  coursePercent: number;
  topics: { topicId: string; percentComplete: number; lessonViewed: boolean; quizCompleted: boolean }[];
};
type AttemptResult = {
  attemptId: string;
  score: number;
  topicPercent: number;
  masteryScore: number;
  masteryAttempts: number;
};
type Prefs = { preferredLanguage: string; preferredPace: string };
type ExplanationView = { title: string; body: string; keyPoints: string[] };

function parseExplanation(json: string | null): ExplanationView | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as {
      title?: string;
      body?: string;
      keyPoints?: unknown;
    };
    const keyPoints = Array.isArray(parsed.keyPoints)
      ? parsed.keyPoints.map(String).filter(Boolean)
      : [];
    return {
      title: parsed.title?.trim() || "Lesson",
      body: parsed.body?.trim() || "",
      keyPoints,
    };
  } catch {
    return { title: "Lesson", body: json, keyPoints: [] };
  }
}

function parseVideoScenes(videoJson: string | null): VideoScene[] {
  if (!videoJson) return [];
  try {
    const parsed = JSON.parse(videoJson) as { scenes?: VideoScene[] };
    return Array.isArray(parsed.scenes) ? parsed.scenes : [];
  } catch {
    return [];
  }
}

function parseOptions(optionsJson: string): string[] {
  try {
    const parsed = JSON.parse(optionsJson) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function topicProgress(
  progress: ProgressView | null,
  topicId: string
): { percentComplete: number; lessonViewed: boolean; quizCompleted: boolean } | null {
  return progress?.topics.find((t) => t.topicId === topicId) ?? null;
}

export function StudentLearningPage() {
  const { identity, setRole } = useAuth();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [lesson, setLesson] = useState<TopicLesson | null>(null);
  const [progress, setProgress] = useState<ProgressView | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [prefs, setPrefs] = useState<Prefs>({ preferredLanguage: "en", preferredPace: "MEDIUM" });
  const [sceneIndex, setSceneIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [topicLoading, setTopicLoading] = useState(false);
  const [videoCache] = useState(() => new Map<string, string>());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (identity.role !== "STUDENT") {
      setRole("STUDENT");
    }
  }, [identity.role, setRole]);

  async function loadCourses() {
    setError(null);
    try {
      const list = await apiGet<CourseSummary[]>("/api/v1/student/courses", identity);
      setCourses(list);
      const p = await apiGet<Prefs>("/api/v1/student/preferences", identity);
      setPrefs(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load courses");
    }
  }

  useEffect(() => {
    if (identity.role === "STUDENT") void loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.organizationId, identity.role]);

  const scenes = parseVideoScenes(lesson?.videoJson ?? null);
  const scene = scenes[sceneIndex];
  const explanation = parseExplanation(lesson?.explanationJson ?? null);

  useEffect(() => {
    if (!playing || scenes.length === 0) return;
    const durationMs = Math.max(4, scene?.durationSeconds ?? 8) * 1000;
    const timer = window.setTimeout(() => {
      setSceneIndex((i) => {
        if (i >= scenes.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [playing, sceneIndex, scenes.length, scene?.durationSeconds]);

  async function savePrefs() {
    try {
      const p = await apiPut<Prefs>("/api/v1/student/preferences", identity, prefs);
      setPrefs(p);
      setMessage(
        `Preferences saved: ${p.preferredLanguage} / ${p.preferredPace}. Re-opening lesson so language & pace apply.`
      );
      if (lesson?.topicId) {
        await openTopic(lesson.topicId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preferences");
    }
  }

  async function openCourse(courseId: string) {
    setError(null);
    setLesson(null);
    setPlaying(false);
    if (videoObjectUrl) {
      URL.revokeObjectURL(videoObjectUrl);
      setVideoObjectUrl(null);
    }
    try {
      const d = await apiGet<CourseDetail>(`/api/v1/student/courses/${courseId}`, identity);
      setDetail(d);
      const p = await apiGet<ProgressView>(`/api/v1/student/progress/${courseId}`, identity);
      setProgress(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open course");
    }
  }

  async function openTopic(topicId: string) {
    setError(null);
    setMessage(null);
    setAnswers({});
    setSceneIndex(0);
    setPlaying(false);
    setVideoObjectUrl(null);
    setTopicLoading(true);
    setVideoLoading(false);
    try {
      const t = await apiGet<TopicLesson>(`/api/v1/student/topics/${topicId}`, identity);
      setLesson(t);
      setTopicLoading(false);

      // Progress + video load in background so explanation/quiz appear immediately.
      if (t.courseId) {
        void apiGet<ProgressView>(`/api/v1/student/progress/${t.courseId}`, identity)
          .then(setProgress)
          .catch(() => undefined);
      }
      if (t.videoMp4Url) {
        const cacheKey = `${t.topicId}:${t.appliedLanguage ?? prefs.preferredLanguage}:${t.appliedPace ?? prefs.preferredPace}`;
        const cached = videoCache.get(cacheKey);
        if (cached) {
          setVideoObjectUrl(cached);
        } else {
          setVideoLoading(true);
          void apiGetBlob(t.videoMp4Url, identity)
            .then((blob) => {
              const url = URL.createObjectURL(blob);
              videoCache.set(cacheKey, url);
              setVideoObjectUrl(url);
            })
            .catch(() => undefined)
            .finally(() => setVideoLoading(false));
        }
      }
    } catch (err) {
      setTopicLoading(false);
      setError(err instanceof Error ? err.message : "Failed to open topic");
    }
  }

  async function submitQuiz() {
    if (!lesson?.quiz) return;
    setError(null);
    try {
      const payload = {
        answers: lesson.quiz.questions.map((q) => ({
          questionId: q.id,
          selectedIndex: answers[q.id] ?? -1,
        })),
      };
      const result = await apiPost<AttemptResult>(
        `/api/v1/student/quizzes/${lesson.quiz.id}/attempts`,
        identity,
        payload
      );
      setMessage(
        `Score ${result.score}% · topic ${result.topicPercent}% · mastery ${result.masteryScore}% (${result.masteryAttempts} attempts)`
      );
      const p = await apiGet<ProgressView>(`/api/v1/student/progress/${lesson.courseId}`, identity);
      setProgress(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quiz submit failed");
    }
  }

  return (
    <section className="page student-page">
      <h1>Student Learning</h1>
      <p className="muted">Browse published courses, set language &amp; pace, then open a lesson.</p>
      {message && <div className="banner ok">{message}</div>}
      {error && <div className="banner error">{error}</div>}

      <div className="panel prefs-bar">
        <h2>My preferences</h2>
        <div className="prefs-row">
          <label>
            Language
            <select
              value={prefs.preferredLanguage}
              onChange={(e) => setPrefs((p) => ({ ...p, preferredLanguage: e.target.value }))}
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="es">Spanish</option>
            </select>
          </label>
          <label>
            Learning pace
            <select
              value={prefs.preferredPace}
              onChange={(e) => setPrefs((p) => ({ ...p, preferredPace: e.target.value }))}
            >
              <option value="EASY">Easy — step-by-step &amp; practice</option>
              <option value="MEDIUM">Medium — standard lesson</option>
              <option value="HARD">Hard — advanced &amp; challenge</option>
            </select>
          </label>
          <button type="button" onClick={() => void savePrefs()}>
            Save preferences
          </button>
        </div>
        <p className="muted small">
          Same published concept, different experience: Easy simplifies and scaffolds; Hard deepens
          with extra examples and challenge questions. Save, then reopen the topic.
        </p>
      </div>

      <div className="student-layout">
        <aside className="panel student-nav">
          <h2>Courses</h2>
          <button type="button" onClick={() => void loadCourses()}>
            Refresh
          </button>
          <ul className="list course-list">
            {courses.length === 0 && (
              <li className="muted small">
                No published courses yet. If the instructor updated the PDF, the course may be{" "}
                <strong>UPDATE_REQUIRED</strong> — they must click <strong>Publish (allow incomplete)</strong> again
                (same org).
              </li>
            )}
            {courses.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`nav-item ${detail?.id === c.id ? "active" : ""}`}
                  onClick={() => void openCourse(c.id)}
                >
                  <span>{c.title}</span>
                  <span className="muted small">{c.language}</span>
                </button>
              </li>
            ))}
          </ul>
          {progress && (
            <div className="progress-block">
              <div className="progress-label">
                Course progress <strong>{progress.coursePercent}%</strong>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress.coursePercent}%` }} />
              </div>
            </div>
          )}

          {detail && (
            <>
              <h2 style={{ marginTop: "1.25rem" }}>Topics</h2>
              <p className="muted small">Only topics with approved explanation + quiz are listed.</p>
              {detail.chapters.length === 0 && (
                <p className="muted">No ready topics yet — instructor must generate and approve content.</p>
              )}
              {detail.chapters.map((ch) => (
                <div key={ch.id} className="topic-group">
                  <p className="muted small">{ch.title}</p>
                  <ul className="list">
                    {ch.topics.map((t) => {
                      const tp = topicProgress(progress, t.id);
                      return (
                        <li key={t.id}>
                          <button
                            type="button"
                            className={`nav-item ${lesson?.topicId === t.id ? "active" : ""}`}
                            onClick={() => void openTopic(t.id)}
                          >
                            <span>{t.title}</span>
                            {tp && (
                              <span className="muted small">
                                {tp.quizCompleted ? "✓ quiz" : tp.lessonViewed ? "viewed" : ""}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </>
          )}
        </aside>

        <div className="lesson-main">
          {topicLoading && (
            <div className="panel lesson-empty">
              <p className="muted">Loading topic…</p>
            </div>
          )}
          {!lesson && !topicLoading && (
            <div className="panel lesson-empty">
              <h2>Your lesson</h2>
              <p className="muted">
                Select a course, then a topic. You will see a storyboard lesson, explanation, and quiz.
              </p>
            </div>
          )}

          {lesson && !topicLoading && (
            <article className="panel lesson-card">
              <header className="lesson-header">
                <p className="muted small">{detail?.title ?? "Course"}</p>
                <h2>{lesson.title}</h2>
                <p className="prefs-applied">
                  Showing as <strong>{lesson.appliedLanguage ?? prefs.preferredLanguage}</strong> ·{" "}
                  <strong>{lesson.appliedPace ?? prefs.preferredPace}</strong>
                  {" — "}
                  change preferences above and Save to refresh.
                </p>
              </header>

              {videoLoading && (
                <section className="lesson-section">
                  <h3>Lesson video (MP4)</h3>
                  <p className="muted small">Loading video…</p>
                </section>
              )}

              {videoObjectUrl && (
                <section className="lesson-section">
                  <div className="section-heading">
                    <h3>Lesson video (MP4)</h3>
                    <span className="pill">Rendered lesson video</span>
                  </div>
                  <video className="lesson-video" controls src={videoObjectUrl} playsInline>
                    Your browser does not support MP4 playback.
                  </video>
                </section>
              )}

              {scenes.length > 0 && scene && (
                <section className="lesson-section">
                  <div className="section-heading">
                    <h3>Lesson video</h3>
                    <span className="pill">AI storyboard · not an MP4 file</span>
                  </div>
                  <div className="storyboard-stage">
                    <div className="storyboard-screen">
                      <p className="storyboard-title">{scene.onScreenText}</p>
                      <p className="storyboard-narration">{scene.narration}</p>
                    </div>
                    <div className="storyboard-meta">
                      <span>
                        Scene {sceneIndex + 1} of {scenes.length}
                      </span>
                      <span>{scene.durationSeconds}s</span>
                    </div>
                    <div className="progress-track storyboard-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${((sceneIndex + 1) / scenes.length) * 100}%` }}
                      />
                    </div>
                    <div className="storyboard-controls">
                      <button
                        type="button"
                        disabled={sceneIndex <= 0}
                        onClick={() => {
                          setPlaying(false);
                          setSceneIndex((i) => Math.max(0, i - 1));
                        }}
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlaying((p) => !p)}
                      >
                        {playing ? "Pause" : "Play"}
                      </button>
                      <button
                        type="button"
                        disabled={sceneIndex >= scenes.length - 1}
                        onClick={() => {
                          setPlaying(false);
                          setSceneIndex((i) => Math.min(scenes.length - 1, i + 1));
                        }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </section>
              )}

              <section className="lesson-section">
                <h3>
                  Explanation{" "}
                  {lesson.appliedPace && (
                    <span className="tag">{lesson.appliedPace}</span>
                  )}
                </h3>
                {!explanation && (
                  <p className="muted">No approved explanation for this topic yet.</p>
                )}
                {explanation && (
                  <div className="explanation-card">
                    <h4>{explanation.title}</h4>
                    <p className="explanation-body">{explanation.body}</p>
                    {explanation.keyPoints.length > 0 && (
                      <>
                        <p className="key-points-label">
                          {lesson.appliedPace === "EASY"
                            ? "Steps & practice"
                            : lesson.appliedPace === "HARD"
                              ? "Deeper points & challenges"
                              : "Key points"}
                        </p>
                        <ul className="key-points">
                          {explanation.keyPoints.map((kp, i) => (
                            <li key={i}>{kp}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </section>

              {lesson.quiz && (
                <section className="lesson-section quiz-section">
                  <h3>{lesson.quiz.title}</h3>
                  {lesson.quiz.questions.map((q) => {
                    const options = parseOptions(q.optionsJson);
                    return (
                      <div key={q.id} className="quiz-question">
                        <p className="quiz-prompt">
                          {q.sequence}. {q.prompt}
                        </p>
                        <div className="quiz-options">
                          {options.map((opt, idx) => (
                            <label
                              key={idx}
                              className={`quiz-option ${answers[q.id] === idx ? "selected" : ""}`}
                            >
                              <input
                                type="radio"
                                name={q.id}
                                checked={answers[q.id] === idx}
                                onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                              />
                              <span>{opt}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <button type="button" className="primary-action" onClick={() => void submitQuiz()}>
                    Submit quiz
                  </button>
                </section>
              )}
            </article>
          )}
        </div>
      </div>
    </section>
  );
}

package com.learningplatform.student.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.learningplatform.assessment.domain.Quiz;
import com.learningplatform.assessment.domain.QuizQuestion;
import com.learningplatform.assessment.repository.QuizQuestionRepository;
import com.learningplatform.assessment.repository.QuizRepository;
import com.learningplatform.assessment.scoring.QuizScorer;
import com.learningplatform.audit.service.AuditService;
import com.learningplatform.common.domain.Permission;
import com.learningplatform.common.domain.UserRole;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.common.exception.NotFoundException;
import com.learningplatform.common.security.AuthenticatedUser;
import com.learningplatform.common.security.PermissionGuard;
import com.learningplatform.content.domain.AssetType;
import com.learningplatform.content.domain.ContentAsset;
import com.learningplatform.content.domain.ContentAssetStatus;
import com.learningplatform.content.domain.ContentAssetVersion;
import com.learningplatform.content.domain.LearningPace;
import com.learningplatform.content.repository.ContentAssetRepository;
import com.learningplatform.content.repository.ContentAssetVersionRepository;
import com.learningplatform.content.video.VideoMediaService;
import com.learningplatform.course.domain.Course;
import com.learningplatform.course.domain.CourseChapter;
import com.learningplatform.course.domain.CourseTopic;
import com.learningplatform.course.repository.CourseChapterRepository;
import com.learningplatform.course.repository.CourseTopicRepository;
import com.learningplatform.student.domain.StudentMastery;
import com.learningplatform.student.domain.StudentPreference;
import com.learningplatform.student.domain.StudentQuizAttempt;
import com.learningplatform.student.domain.StudentTopicProgress;
import com.learningplatform.student.repository.StudentQuizAttemptRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class StudentLearningService {

    private final StudentCourseQuery studentCourseQuery;
    private final CourseChapterRepository chapterRepository;
    private final CourseTopicRepository topicRepository;
    private final ContentAssetRepository assetRepository;
    private final ContentAssetVersionRepository versionRepository;
    private final QuizRepository quizRepository;
    private final QuizQuestionRepository quizQuestionRepository;
    private final StudentQuizAttemptRepository attemptRepository;
    private final ProgressService progressService;
    private final MasteryService masteryService;
    private final AuditService auditService;
    private final ObjectMapper objectMapper;
    private final StudentPreferenceService preferenceService;
    private final LessonPersonalizer lessonPersonalizer;
    private final VideoMediaService videoMediaService;

    public StudentLearningService(
            StudentCourseQuery studentCourseQuery,
            CourseChapterRepository chapterRepository,
            CourseTopicRepository topicRepository,
            ContentAssetRepository assetRepository,
            ContentAssetVersionRepository versionRepository,
            QuizRepository quizRepository,
            QuizQuestionRepository quizQuestionRepository,
            StudentQuizAttemptRepository attemptRepository,
            ProgressService progressService,
            MasteryService masteryService,
            AuditService auditService,
            ObjectMapper objectMapper,
            StudentPreferenceService preferenceService,
            LessonPersonalizer lessonPersonalizer,
            VideoMediaService videoMediaService
    ) {
        this.studentCourseQuery = studentCourseQuery;
        this.chapterRepository = chapterRepository;
        this.topicRepository = topicRepository;
        this.assetRepository = assetRepository;
        this.versionRepository = versionRepository;
        this.quizRepository = quizRepository;
        this.quizQuestionRepository = quizQuestionRepository;
        this.attemptRepository = attemptRepository;
        this.progressService = progressService;
        this.masteryService = masteryService;
        this.auditService = auditService;
        this.objectMapper = objectMapper;
        this.preferenceService = preferenceService;
        this.lessonPersonalizer = lessonPersonalizer;
        this.videoMediaService = videoMediaService;
    }

    @Transactional(readOnly = true)
    public List<Course> listCourses() {
        return studentCourseQuery.listPublishedForCurrentStudent();
    }

    @Transactional
    public StudentCourseDetail courseDetail(UUID courseId) {
        Course course = studentCourseQuery.getPublished(courseId);
        List<ChapterNode> chapters = new ArrayList<>();
        for (CourseChapter ch : chapterRepository.findByCourseIdOrderBySequenceAsc(courseId)) {
            List<TopicNode> topics = new ArrayList<>();
            for (CourseTopic t : topicRepository.findByChapterIdOrderBySequenceAsc(ch.getId())) {
                if (isTopicReadyForStudent(t.getId())) {
                    topics.add(new TopicNode(t.getId(), t.getTitle(), t.getSequence()));
                }
            }
            if (!topics.isEmpty()) {
                chapters.add(new ChapterNode(ch.getId(), ch.getTitle(), ch.getSequence(), topics));
            }
        }
        return new StudentCourseDetail(course, chapters);
    }

    /**
     * Students only see topics the instructor has approved for learning
     * (required EXPLANATION + QUIZ APPROVED). VIDEO is optional.
     */
    private boolean isTopicReadyForStudent(UUID topicId) {
        return isApproved(topicId, AssetType.EXPLANATION) && isApproved(topicId, AssetType.QUIZ);
    }

    private boolean isApproved(UUID topicId, AssetType type) {
        ContentAsset asset = assetRepository.findByTopicIdAndAssetType(topicId, type).orElse(null);
        if (asset == null) {
            return false;
        }
        if (asset.getStatus() == ContentAssetStatus.APPROVED) {
            return true;
        }
        if (asset.getCurrentVersionId() == null) {
            return false;
        }
        ContentAssetVersion version = versionRepository.findById(asset.getCurrentVersionId()).orElse(null);
        return version != null && version.getStatus() == ContentAssetStatus.APPROVED;
    }

    @Transactional
    public TopicLessonView topicLesson(UUID topicId) {
        AuthenticatedUser user = PermissionGuard.require(Permission.LESSON_VIEW);
        boolean instructorPreview = user.role() == UserRole.INSTRUCTOR;
        CourseTopic topic = topicRepository.findById(topicId)
                .orElseThrow(() -> new NotFoundException("TOPIC_NOT_FOUND", "Topic was not found."));
        CourseChapter chapter = chapterRepository.findById(topic.getChapterId())
                .orElseThrow(() -> new NotFoundException("CHAPTER_NOT_FOUND", "Chapter was not found."));
        Course course = studentCourseQuery.getCourseForLesson(chapter.getCourseId());
        if (!instructorPreview && !isTopicReadyForStudent(topicId)) {
            throw new NotFoundException(
                    "TOPIC_NOT_READY",
                    "This topic is not available yet. Instructor must approve explanation and quiz."
            );
        }

        StudentPreference prefs = preferenceService.getOrDefault();
        String language = prefs.getPreferredLanguage();
        LearningPace pace = LearningPace.fromString(prefs.getPreferredPace());

        String explanationJson = null;
        UUID explanationAssetId = null;
        ContentAsset explanation = assetRepository.findByTopicIdAndAssetType(topicId, AssetType.EXPLANATION).orElse(null);
        if (explanation != null && explanation.getCurrentVersionId() != null) {
            ContentAssetVersion version = versionRepository.findById(explanation.getCurrentVersionId()).orElse(null);
            if (version != null && isVisibleLessonAsset(explanation, version, instructorPreview)) {
                explanationJson = lessonPersonalizer.personalizeExplanation(version.getContentJson(), language, pace);
                explanationAssetId = explanation.getId();
            }
        }

        QuizView quizView = null;
        ContentAsset quizAsset = assetRepository.findByTopicIdAndAssetType(topicId, AssetType.QUIZ).orElse(null);
        if (quizAsset != null && quizAsset.getCurrentVersionId() != null) {
            ContentAssetVersion quizVersion = versionRepository.findById(quizAsset.getCurrentVersionId()).orElse(null);
            if (quizVersion != null && isVisibleLessonAsset(quizAsset, quizVersion, instructorPreview)) {
                Quiz quiz = quizRepository.findByContentAssetVersionId(quizAsset.getCurrentVersionId())
                        .or(() -> quizRepository.findFirstByContentAssetIdOrderByCreatedAtDesc(quizAsset.getId()))
                        .orElse(null);
                if (quiz != null) {
                    List<LessonPersonalizer.QuizQuestion> raw = quizQuestionRepository.findByQuizIdOrderBySequenceAsc(quiz.getId())
                            .stream()
                            .map(q -> new LessonPersonalizer.QuizQuestion(
                                    q.getId(),
                                    q.getSequence(),
                                    q.getPrompt(),
                                    parseOptions(q.getOptionsJson())
                            ))
                            .toList();
                    LessonPersonalizer.PersonalizedQuiz personalized =
                            lessonPersonalizer.personalizeQuiz(quiz.getTitle(), raw, language, pace);
                    List<QuestionView> questions = personalized.questions().stream()
                            .map(q -> new QuestionView(
                                    q.id(),
                                    q.sequence(),
                                    q.prompt(),
                                    writeOptions(q.options())
                            ))
                            .toList();
                    quizView = new QuizView(quiz.getId(), personalized.title(), questions);
                }
            }
        }

        String videoJson = null;
        String videoMp4Url = null;
        ContentAsset videoAsset = assetRepository.findByTopicIdAndAssetType(topicId, AssetType.VIDEO).orElse(null);
        if (videoAsset != null && videoAsset.getCurrentVersionId() != null) {
            ContentAssetVersion version = versionRepository.findById(videoAsset.getCurrentVersionId()).orElse(null);
            if (version != null && isVisibleLessonAsset(videoAsset, version, instructorPreview)) {
                videoJson = lessonPersonalizer.personalizeVideo(version.getContentJson(), language, pace);
                videoMp4Url = "/api/v1/student/topics/" + topicId + "/video.mp4";
            }
        }

        if (!instructorPreview) {
            progressService.markLessonViewed(course.getId(), topicId);
        }
        return new TopicLessonView(
                topic.getId(),
                topic.getTitle(),
                course.getId(),
                explanationAssetId,
                explanationJson,
                quizView,
                videoJson,
                videoMp4Url,
                language,
                pace.name()
        );
    }

    private static boolean isVisibleLessonAsset(
            ContentAsset asset,
            ContentAssetVersion version,
            boolean instructorPreview
    ) {
        if (asset.getStatus() == ContentAssetStatus.APPROVED || version.getStatus() == ContentAssetStatus.APPROVED) {
            return true;
        }
        if (!instructorPreview) {
            return false;
        }
        return version.getStatus() == ContentAssetStatus.PENDING_REVIEW
                || version.getStatus() == ContentAssetStatus.GENERATED
                || asset.getStatus() == ContentAssetStatus.PENDING_REVIEW
                || asset.getStatus() == ContentAssetStatus.GENERATED;
    }

    @Transactional(readOnly = true)
    public byte[] topicVideoMp4(UUID topicId) {
        AuthenticatedUser user = PermissionGuard.require(Permission.LESSON_VIEW);
        boolean instructorPreview = user.role() == UserRole.INSTRUCTOR;
        CourseTopic topic = topicRepository.findById(topicId)
                .orElseThrow(() -> new NotFoundException("TOPIC_NOT_FOUND", "Topic was not found."));
        CourseChapter chapter = chapterRepository.findById(topic.getChapterId())
                .orElseThrow(() -> new NotFoundException("CHAPTER_NOT_FOUND", "Chapter was not found."));
        studentCourseQuery.getCourseForLesson(chapter.getCourseId());

        StudentPreference prefs = preferenceService.getOrDefault();
        String language = prefs.getPreferredLanguage();
        LearningPace pace = LearningPace.fromString(prefs.getPreferredPace());

        ContentAsset videoAsset = assetRepository.findByTopicIdAndAssetType(topicId, AssetType.VIDEO)
                .orElseThrow(() -> new NotFoundException("VIDEO_NOT_FOUND", "No video for this topic."));
        ContentAssetVersion version = versionRepository.findById(videoAsset.getCurrentVersionId())
                .orElseThrow(() -> new NotFoundException("VIDEO_NOT_FOUND", "No video version."));
        if (!isVisibleLessonAsset(videoAsset, version, instructorPreview)) {
            throw new NotFoundException("VIDEO_NOT_APPROVED", "Video is not available for this viewer.");
        }
        String personalized = lessonPersonalizer.personalizeVideo(version.getContentJson(), language, pace);
        String key = VideoMediaService.keyFor(videoAsset.getId().toString(), language, pace.name());
        String fallbackKey = videoMediaService.readMp4ObjectKey(version.getContentJson());
        return videoMediaService.loadPreferExisting(key, fallbackKey, personalized);
    }

    @Transactional
    public AttemptResult submitAttempt(UUID quizId, List<AnswerSubmission> answers) {
        AuthenticatedUser user = PermissionGuard.require(Permission.QUIZ_ATTEMPT);
        Quiz quiz = quizRepository.findById(quizId)
                .orElseThrow(() -> new NotFoundException("QUIZ_NOT_FOUND", "Quiz was not found."));
        ContentAsset quizAsset = assetRepository.findById(quiz.getContentAssetId())
                .orElseThrow(() -> new NotFoundException("CONTENT_ASSET_NOT_FOUND", "Quiz asset was not found."));
        Course course = studentCourseQuery.getPublished(quizAsset.getCourseId());

        List<QuizQuestion> questions = quizQuestionRepository.findByQuizIdOrderBySequenceAsc(quizId);
        if (questions.isEmpty()) {
            throw new BusinessException("QUIZ_EMPTY", "Quiz has no questions.");
        }

        Map<UUID, Integer> correct = new LinkedHashMap<>();
        for (QuizQuestion q : questions) {
            correct.put(q.getId(), q.getCorrectIndex());
        }
        Map<UUID, Integer> selected = new HashMap<>();
        if (answers != null) {
            for (AnswerSubmission a : answers) {
                if (a.questionId() != null && a.selectedIndex() != null) {
                    selected.put(a.questionId(), a.selectedIndex());
                }
            }
        }

        double scoreValue = QuizScorer.score(correct, selected);
        BigDecimal score = BigDecimal.valueOf(scoreValue).setScale(2, RoundingMode.HALF_UP);

        String answersJson;
        try {
            answersJson = objectMapper.writeValueAsString(answers != null ? answers : List.of());
        } catch (JsonProcessingException e) {
            answersJson = "[]";
        }

        StudentQuizAttempt attempt = attemptRepository.save(new StudentQuizAttempt(
                UUID.randomUUID(),
                user.organizationId(),
                user.userId(),
                quizId,
                course.getId(),
                quizAsset.getTopicId(),
                score,
                answersJson,
                Instant.now()
        ));

        StudentTopicProgress progress = progressService.markQuizCompleted(course.getId(), quizAsset.getTopicId());
        StudentMastery mastery = masteryService.recordAttempt(quizAsset.getTopicId(), score);
        auditService.record(
                "QUIZ_ATTEMPTED",
                "Quiz",
                quizId.toString(),
                "score=" + score + ",topic=" + quizAsset.getTopicId()
        );

        return new AttemptResult(
                attempt.getId(),
                score.doubleValue(),
                progress.getPercentComplete(),
                mastery.getMasteryScore().doubleValue(),
                mastery.getAttempts()
        );
    }

    private List<String> parseOptions(String optionsJson) {
        try {
            var parsed = objectMapper.readTree(optionsJson);
            if (!parsed.isArray()) {
                return List.of();
            }
            List<String> out = new ArrayList<>();
            parsed.forEach(n -> out.add(n.asText("")));
            return out;
        } catch (Exception ex) {
            return List.of();
        }
    }

    private String writeOptions(List<String> options) {
        try {
            return objectMapper.writeValueAsString(options);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    public record StudentCourseDetail(Course course, List<ChapterNode> chapters) {
    }

    public record ChapterNode(UUID id, String title, int sequence, List<TopicNode> topics) {
    }

    public record TopicNode(UUID id, String title, int sequence) {
    }

    public record TopicLessonView(
            UUID topicId,
            String title,
            UUID courseId,
            UUID explanationAssetId,
            String explanationJson,
            QuizView quiz,
            String videoJson,
            String videoMp4Url,
            String appliedLanguage,
            String appliedPace
    ) {
    }

    public record QuizView(UUID id, String title, List<QuestionView> questions) {
    }

    public record QuestionView(UUID id, int sequence, String prompt, String optionsJson) {
    }

    public record AnswerSubmission(UUID questionId, Integer selectedIndex) {
    }

    public record AttemptResult(
            UUID attemptId,
            double score,
            int topicPercent,
            double masteryScore,
            int masteryAttempts
    ) {
    }
}

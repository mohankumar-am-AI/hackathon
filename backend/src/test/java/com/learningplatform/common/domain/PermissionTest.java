package com.learningplatform.common.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PermissionTest {

    @Test
    void forRole_instructor_containsCourseCreate_notSourcePublish() {
        assertThat(Permission.forRole(UserRole.INSTRUCTOR))
                .contains(Permission.COURSE_CREATE, Permission.CONTENT_GENERATE, Permission.SYNC_REVIEW, Permission.LESSON_VIEW)
                .doesNotContain(Permission.SOURCE_PUBLISH);
    }

    @Test
    void forRole_student_containsQuizAttempt_notContentGenerate() {
        assertThat(Permission.forRole(UserRole.STUDENT))
                .contains(Permission.QUIZ_ATTEMPT, Permission.LESSON_VIEW, Permission.PROGRESS_VIEW)
                .doesNotContain(Permission.CONTENT_GENERATE, Permission.COURSE_CREATE);
    }

    @Test
    void forRole_contentOwner_containsSourcePublish() {
        assertThat(Permission.forRole(UserRole.CONTENT_OWNER))
                .contains(Permission.SOURCE_CREATE, Permission.SOURCE_PUBLISH, Permission.IMPACT_VIEW)
                .doesNotContain(Permission.COURSE_CREATE);
    }
}

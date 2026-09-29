package com.learningplatform.common.domain;

import java.util.EnumSet;
import java.util.Set;

/**
 * Application permissions aligned with REQ-001 / PRD-01.
 */
public enum Permission {
    SOURCE_CREATE,
    SOURCE_UPDATE,
    SOURCE_VIEW,
    SOURCE_PUBLISH,
    SOURCE_VERSION_VIEW,
    IMPACT_VIEW,
    COURSE_CREATE,
    COURSE_EDIT,
    COURSE_VIEW,
    COURSE_PUBLISH,
    CONTENT_GENERATE,
    CONTENT_EDIT,
    SYNC_REVIEW,
    LESSON_VIEW,
    QUIZ_ATTEMPT,
    ASSIGNMENT_SUBMIT,
    PROGRESS_VIEW;

    public static Set<Permission> forRole(UserRole role) {
        return switch (role) {
            case CONTENT_OWNER -> EnumSet.of(
                    SOURCE_CREATE, SOURCE_UPDATE, SOURCE_VIEW, SOURCE_PUBLISH, SOURCE_VERSION_VIEW, IMPACT_VIEW
            );
            case INSTRUCTOR -> EnumSet.of(
                    SOURCE_VIEW, SOURCE_VERSION_VIEW,
                    COURSE_CREATE, COURSE_EDIT, COURSE_VIEW, COURSE_PUBLISH,
                    CONTENT_GENERATE, CONTENT_EDIT,
                    IMPACT_VIEW, SYNC_REVIEW,
                    LESSON_VIEW,
                    PROGRESS_VIEW
            );
            case STUDENT -> EnumSet.of(
                    COURSE_VIEW, LESSON_VIEW, QUIZ_ATTEMPT, ASSIGNMENT_SUBMIT, PROGRESS_VIEW
            );
        };
    }
}

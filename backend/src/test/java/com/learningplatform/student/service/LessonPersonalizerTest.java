package com.learningplatform.student.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.learningplatform.content.domain.LearningPace;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class LessonPersonalizerTest {

    private final LessonPersonalizer personalizer = new LessonPersonalizer(new ObjectMapper());
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void explanation_differsByLanguageAndPace() {
        String base = """
                {"title":"Work and Energy","body":"Energy is conserved in closed systems with detailed math.",
                "keyPoints":["Work","Energy","Power"],"citedSectionIds":["11111111-1111-1111-1111-111111111111"]}
                """;
        String easyEn = personalizer.personalizeExplanation(base, "en", LearningPace.EASY);
        String hardHi = personalizer.personalizeExplanation(base, "hi", LearningPace.HARD);

        assertThat(easyEn).contains("Easy pace").contains("Lesson:");
        assertThat(hardHi).contains("पाठ:").contains("कठिन");
        assertThat(easyEn).isNotEqualTo(hardHi);
    }

    @Test
    void explanation_easyIsStepByStepWithPracticeExample() throws Exception {
        String base = """
                {"title":"Work and Energy","body":"Energy is conserved in closed systems with detailed math and proofs.",
                "keyPoints":["Work","Energy","Power"],"citedSectionIds":["11111111-1111-1111-1111-111111111111"]}
                """;
        JsonNode easy = mapper.readTree(personalizer.personalizeExplanation(base, "en", LearningPace.EASY));
        String body = easy.path("body").asText();
        assertThat(body).contains("Step 1").contains("Step 2").contains("Step 3");
        assertThat(body).contains("Practice example");
        assertThat(easy.path("keyPoints").toString()).contains("Practice example");
        assertThat(easy.path("pace").asText()).isEqualTo("EASY");
    }

    @Test
    void explanation_hardIsAdvancedWithDeeperConceptsAndExtraExample() throws Exception {
        String base = """
                {"title":"Work and Energy","body":"Energy is conserved in closed systems with detailed math.",
                "keyPoints":["Work","Energy"],"citedSectionIds":["11111111-1111-1111-1111-111111111111"]}
                """;
        JsonNode hard = mapper.readTree(personalizer.personalizeExplanation(base, "en", LearningPace.HARD));
        String body = hard.path("body").asText();
        assertThat(body).contains("Advanced explanation").contains("Deeper concept").contains("Additional example");
        String points = hard.path("keyPoints").toString();
        assertThat(points).contains("Additional example").contains("Challenge");
        assertThat(hard.path("pace").asText()).isEqualTo("HARD");
    }

    @Test
    void video_easyKeepsFewerScenes() throws Exception {
        String base = """
                {"title":"Video","scenes":[
                 {"sequence":1,"narration":"One","onScreenText":"A","durationSeconds":10,"citedSectionIds":["11111111-1111-1111-1111-111111111111"]},
                 {"sequence":2,"narration":"Two","onScreenText":"B","durationSeconds":10,"citedSectionIds":["11111111-1111-1111-1111-111111111111"]},
                 {"sequence":3,"narration":"Three","onScreenText":"C","durationSeconds":10,"citedSectionIds":["11111111-1111-1111-1111-111111111111"]}
                ],"citedSectionIds":["11111111-1111-1111-1111-111111111111"]}
                """;
        String easy = personalizer.personalizeVideo(base, "en", LearningPace.EASY);
        String hard = personalizer.personalizeVideo(base, "es", LearningPace.HARD);
        assertThat(mapper.readTree(easy).get("scenes")).hasSize(2);
        assertThat(mapper.readTree(hard).get("scenes")).hasSize(3);
        assertThat(easy).contains("Step 1 of 2");
        assertThat(hard).contains("Reto extra").contains("Lección:");
    }

    @Test
    void quiz_easyPracticeFraming_hardChallengeFraming() {
        var q1 = new LessonPersonalizer.QuizQuestion(UUID.randomUUID(), 1, "Q1", List.of("a", "b"));
        var q2 = new LessonPersonalizer.QuizQuestion(UUID.randomUUID(), 2, "Q2", List.of("a", "b"));
        var easy = personalizer.personalizeQuiz("Quiz", List.of(q1, q2), "en", LearningPace.EASY);
        var hard = personalizer.personalizeQuiz("Quiz", List.of(q1, q2), "en", LearningPace.HARD);
        assertThat(easy.questions()).hasSize(1);
        assertThat(hard.questions()).hasSize(2);
        assertThat(easy.title()).contains("Practice");
        assertThat(hard.title()).contains("Challenge");
        assertThat(easy.questions().get(0).prompt()).contains("Practice");
        assertThat(hard.questions().get(0).prompt()).contains("Challenge");
    }
}

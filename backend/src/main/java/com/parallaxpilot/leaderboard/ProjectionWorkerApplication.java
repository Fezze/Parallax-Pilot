package com.parallaxpilot.leaderboard;

import java.util.Map;

import org.springframework.boot.builder.SpringApplicationBuilder;

public class ProjectionWorkerApplication {

    public static void main(String[] args) {
        new SpringApplicationBuilder(LeaderboardBackendApplication.class)
            .profiles("worker")
            .properties(Map.of("app.leaderboard.projection-consumer-enabled", "true"))
            .run(args);
    }
}

package com.parallaxpilot.leaderboard.repository;

import java.util.Optional;

import org.springframework.stereotype.Component;

import com.parallaxpilot.leaderboard.domain.LeaderboardKeys;
import com.parallaxpilot.leaderboard.domain.ProjectionIndexRecord;
import com.parallaxpilot.leaderboard.domain.ScopeKind;

@Component
public class ProjectionIndexRepository {

    private final DynamoDbJsonRepository repository;

    public ProjectionIndexRepository(DynamoDbJsonRepository repository) {
        this.repository = repository;
    }

    public Optional<ProjectionIndexRecord> get(String playerId, ScopeKind scopeKind, String scopeKey) {
        return repository.get(LeaderboardTables.PROJECTION_INDEX, playerId, key(scopeKind, scopeKey), ProjectionIndexRecord.class);
    }

    public void put(String playerId, ScopeKind scopeKind, String scopeKey, String leaderboardSortKey) {
        repository.put(
            LeaderboardTables.PROJECTION_INDEX,
            playerId,
            key(scopeKind, scopeKey),
            new ProjectionIndexRecord(playerId, scopeKind, scopeKey, leaderboardSortKey)
        );
    }

    public boolean putIfMatches(String playerId, ScopeKind scopeKind, String scopeKey, String leaderboardSortKey, ProjectionIndexRecord expected) {
        var record = new ProjectionIndexRecord(playerId, scopeKind, scopeKey, leaderboardSortKey);
        return repository.putIfMatches(
            LeaderboardTables.PROJECTION_INDEX,
            playerId,
            key(scopeKind, scopeKey),
            record,
            expected
        );
    }

    public void delete(String playerId, ScopeKind scopeKind, String scopeKey) {
        repository.delete(LeaderboardTables.PROJECTION_INDEX, playerId, key(scopeKind, scopeKey));
    }

    private String key(ScopeKind scopeKind, String scopeKey) {
        return LeaderboardKeys.scopePartitionKey(scopeKind, scopeKey);
    }
}

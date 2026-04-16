package com.parallaxpilot.leaderboard.repository;

import java.util.List;

import org.springframework.stereotype.Component;

import com.parallaxpilot.leaderboard.domain.SeasonMetadataRecord;

@Component
public class SeasonMetadataRepository {

    private final DynamoDbJsonRepository repository;

    public SeasonMetadataRepository(DynamoDbJsonRepository repository) {
        this.repository = repository;
    }

    public List<SeasonMetadataRecord> findAll() {
        return repository.scanAll(LeaderboardTables.SEASON_METADATA, SeasonMetadataRecord.class);
    }

    public void put(SeasonMetadataRecord record) {
        repository.put(LeaderboardTables.SEASON_METADATA, LeaderboardKeys.SEASON_PARTITION, record.seasonKey(), record);
    }
}

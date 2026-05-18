export const LEADERBOARD_STORAGE_KEYS = {
  API_BASE_URL: 'leaderboard_api_base_url',
  PLAYER_ID: 'leaderboard_player_id',
  PLAYER_NICKNAME: 'leaderboard_player_nickname',
  ACTIVE_SCOPE: 'leaderboard_active_scope',
  LAST_SYNC_AT: 'leaderboard_last_sync_at',
  LAST_SYNC_ERROR: 'leaderboard_last_sync_error',
  LEADERBOARD_GLOBAL: 'leaderboard_global_cache',
  LEADERBOARD_DAILY: 'leaderboard_daily_cache',
  LEADERBOARD_SEASONAL: 'leaderboard_seasonal_cache',
  PLAYER_BEST: 'leaderboard_player_best_cache',
  PLAYER_CLASSIFICATION: 'leaderboard_player_classification_cache',
  COMMAND: 'leaderboard_command',
  SUBMIT_QUEUE: 'leaderboard_submit_queue',
  SUBMIT_QUEUE_SIZE: 'leaderboard_submit_queue_size',
  LAST_SUBMIT_AT: 'leaderboard_last_submit_at',
  LAST_SUBMIT_ERROR: 'leaderboard_last_submit_error',
}

export const LEADERBOARD_SCOPES = ['global', 'daily', 'seasonal']

export const DEFAULT_LEADERBOARD_API_BASE_URL = 'http://10.0.2.2:8080'
export const DEFAULT_LEADERBOARD_SCOPE = 'global'

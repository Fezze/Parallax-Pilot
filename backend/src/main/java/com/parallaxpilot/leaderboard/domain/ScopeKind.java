package com.parallaxpilot.leaderboard.domain;

public enum ScopeKind {
    GLOBAL("global"),
    DAILY("daily"),
    SEASONAL("seasonal");

    private final String apiValue;

    ScopeKind(String apiValue) {
        this.apiValue = apiValue;
    }

    public String apiValue() {
        return apiValue;
    }

    public String storageKey(String scopeKey) {
        return name() + "#" + scopeKey;
    }

    public static ScopeKind fromApi(String value) {
        for (var scopeKind : values()) {
            if (scopeKind.apiValue.equalsIgnoreCase(value)) {
                return scopeKind;
            }
        }
        throw new IllegalArgumentException("Unsupported scope: " + value);
    }
}

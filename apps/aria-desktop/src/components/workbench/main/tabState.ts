export type TabState = {
  openTabSessionIds: string[];
  selectedSessionId: string | null;
};

export function openSessionTab(
  openTabSessionIds: string[],
  selectedSessionId: string | null,
  sessionId: string
): TabState {
  return {
    openTabSessionIds: openTabSessionIds.includes(sessionId)
      ? openTabSessionIds
      : [...openTabSessionIds, sessionId],
    selectedSessionId: sessionId
  };
}

export function closeSessionTab(
  openTabSessionIds: string[],
  selectedSessionId: string | null,
  sessionId: string
): TabState {
  const closingIndex = openTabSessionIds.indexOf(sessionId);
  if (closingIndex === -1) {
    return { openTabSessionIds, selectedSessionId };
  }

  const nextOpenTabSessionIds = openTabSessionIds.filter(
    (openSessionId) => openSessionId !== sessionId
  );

  if (selectedSessionId !== sessionId) {
    return {
      openTabSessionIds: nextOpenTabSessionIds,
      selectedSessionId
    };
  }

  const nextSelectedSessionId =
    openTabSessionIds[closingIndex - 1] ?? openTabSessionIds[closingIndex + 1] ?? null;

  return {
    openTabSessionIds: nextOpenTabSessionIds,
    selectedSessionId: nextSelectedSessionId
  };
}

export function reconcileOpenTabs(
  openTabSessionIds: string[],
  selectedSessionId: string | null,
  availableSessionIds: string[]
): TabState {
  const availableSessionIdSet = new Set(availableSessionIds);
  const nextOpenTabSessionIds = openTabSessionIds.filter((sessionId) =>
    availableSessionIdSet.has(sessionId)
  );

  return {
    openTabSessionIds: nextOpenTabSessionIds,
    selectedSessionId:
      selectedSessionId && availableSessionIdSet.has(selectedSessionId)
        ? selectedSessionId
        : nextOpenTabSessionIds[0] ?? null
  };
}

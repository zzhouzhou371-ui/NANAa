import type {
  Character,
  Message,
  MemoryRecord,
  RelationshipTrace,
  WorldBookEntry,
} from '../types';

export function forwardMessagesToMemory(params: {
  entries: WorldBookEntry[];
  messages: Message[];
  character: Character | undefined;
  characterId: string;
}): {
  entries: WorldBookEntry[];
  count: number;
  lastForwardedId?: number;
} {
  const forwardable = params.messages.filter(m => m.sender !== 'system');
  if (forwardable.length === 0) {
    return { entries: params.entries, count: 0 };
  }

  const existingMem = params.entries.find(e => e.characterId === params.characterId && e.group === 'memory');
  const baseOrder = existingMem?.records?.length ?? 0;
  const records = forwardable.map((m, index): MemoryRecord => ({
    id: m.id.toString(),
    sourceEventId: m.paymentId || String(m.id),
    sender: m.sender === 'user' ? 'user' : 'char',
    text: m.text,
    time: m.time,
    type: m.type,
    amount: m.amount,
    note: m.note,
    summarized: false,
    remember: true,
    order: baseOrder + index,
  }));

  const lastForwardedId = forwardable[forwardable.length - 1]?.id;

  if (existingMem) {
    const merged = [...(existingMem.records || [])];
    for (const record of records) {
      const existingIndex = merged.findIndex(r => r.id === record.id);
      if (existingIndex >= 0) {
        merged[existingIndex] = { ...merged[existingIndex], ...record, order: merged[existingIndex].order };
      } else {
        merged.push(record);
      }
    }

    return {
      entries: params.entries.map(e => e.id === existingMem.id ? { ...e, records: merged, alwaysActive: true } : e),
      count: records.length,
      lastForwardedId,
    };
  }

  return {
    entries: [
      ...params.entries,
      {
        id: `memory-${params.characterId}-${Date.now()}`,
        keys: `${params.character?.name || 'Character'}, memory`,
        content: '',
        characterId: params.characterId,
        group: 'memory',
        alwaysActive: true,
        records,
      },
    ],
    count: records.length,
    lastForwardedId,
  };
}

export function suppressMemoryEvidenceForTrace(
  entries: WorldBookEntry[],
  trace: RelationshipTrace,
): WorldBookEntry[] {
  let changed = false;
  const nextEntries = entries.map(entry => {
    if (entry.characterId !== trace.characterId || entry.group !== 'memory') {
      return entry;
    }

    let recordsChanged = false;
    const records = entry.records?.map(record => {
      if (
        (record.sourceEventId ?? record.id) !== trace.sourceEventId
        || record.suppressedByTraceId === trace.id
      ) {
        return record;
      }
      recordsChanged = true;
      return {
        ...record,
        suppressedByTraceId: trace.id,
      };
    });
    const summaryChanged = (
      entry.summaryState !== 'stale'
      || entry.summaryInvalidatedByTraceId !== trace.id
    );

    if (!recordsChanged && !summaryChanged) return entry;
    changed = true;
    return {
      ...entry,
      summaryState: 'stale' as const,
      summaryInvalidatedByTraceId: trace.id,
      ...(recordsChanged ? { records } : {}),
    };
  });

  return changed ? nextEntries : entries;
}

export function messagesAfterLastForward(messages: Message[], lastForwardedId?: number): Message[] {
  const forwardable = messages.filter(m => m.sender !== 'system');
  if (!lastForwardedId) return forwardable;
  const lastIndex = forwardable.findIndex(m => m.id === lastForwardedId);
  return lastIndex >= 0 ? forwardable.slice(lastIndex + 1) : forwardable;
}

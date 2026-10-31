"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ExecutionHistory } from "./execution-client";
import { readDatedExecutionHistory } from "./execution-history-client";

export function useDatedExecutionHistory(scope: string, date: string, revision: number | undefined) {
  const generation = useRef(0), key = `${scope}:${date}`;
  const [state, setState] = useState<{ key: string; history: ExecutionHistory | null; loading: boolean; error: string }>({ key: "", history: null, loading: true, error: "" });
  const load = useCallback(async (cursor: ExecutionHistory["cursor"] = null) => {
    const turn = ++generation.current;
    setState(previous => ({ key, history: previous.key === key ? previous.history : null, loading: true, error: "" }));
    try {
      const page = await readDatedExecutionHistory(scope, date, cursor);
      if (turn !== generation.current) return;
      setState(previous => ({ key, history: cursor && previous.key === key && previous.history ? { ...page, records: [...previous.history.records, ...page.records.filter(record => !previous.history!.records.some(item => item.id === record.id))] } : page, loading: false, error: "" }));
    } catch (error) {
      if (turn === generation.current) setState(previous => ({ ...previous, loading: false, error: error instanceof Error ? error.message : "수행 기록을 불러오지 못했어요." }));
    }
  }, [scope, date, key]);
  useEffect(() => { const requests = generation; void load(); return () => { requests.current++; }; }, [load, revision]);
  return { history: state.key === key ? state.history : null, loading: state.key !== key || state.loading, error: state.key === key ? state.error : "", load };
}

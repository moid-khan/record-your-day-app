import { useCallback, useEffect, useRef, useState } from 'react';
// import Vosk from 'react-native-vosk';
import type { StartKeywordState } from '../types';

let Vosk: any;

type UseStartKeywordParams = {
  modelPath: string; // e.g. 'model-small-en-us' in /assets
  keyword?: string;
  autoStart?: boolean;
  onMatch?: () => void;
};

/**
 * Lightweight Vosk listener for a single keyword ("start" by default).
 * Expects the Vosk model folder to live in /assets (see docs) and be added
 * to iOS Copy Bundle Resources.
 */
export function useStartKeyword({
  modelPath,
  keyword = 'start',
  autoStart = false,
  onMatch,
}: UseStartKeywordParams) {
  const voskRef = useRef<Vosk | null>(null);
  const [state, setState] = useState<StartKeywordState>({ status: 'idle' });

  const stop = useCallback(async () => {
    try {
      voskRef.current?.stop();
      setState(prev => ({ ...prev, status: 'idle' }));
    } catch (error) {
      setState({ status: 'error', error: asMessage(error) });
    }
  }, []);

  const start = useCallback(async () => {
    if (!voskRef.current) {
      voskRef.current = new Vosk();
    }
    const vosk = voskRef.current;

    try {
      setState({ status: 'loading' });
      await vosk.loadModel(modelPath);
      const grammar = [keyword.toLowerCase(), '[unk]'];
      await vosk.start({ grammar });
      setState({ status: 'listening' });
    } catch (error) {
      setState({ status: 'error', error: asMessage(error) });
    }
  }, [keyword, modelPath]);

  useEffect(() => {
    if (!voskRef.current) {
      voskRef.current = new Vosk();
    }
    const vosk = voskRef.current;

    const resultSub = vosk.onResult(res => {
      if (!res) return;
      const normalized = res.trim().toLowerCase();
      if (normalized.includes(keyword.toLowerCase())) {
        onMatch?.();
      }
    });
    const errorSub = vosk.onError(e => {
      setState({ status: 'error', error: asMessage(e) });
    });
    const timeoutSub = vosk.onTimeout(() => {
      setState({ status: 'idle' });
    });

    return () => {
      resultSub?.remove();
      errorSub?.remove();
      timeoutSub?.remove();
      vosk.stop?.();
      vosk.unload?.();
      voskRef.current = null;
    };
  }, [keyword, onMatch]);

  useEffect(() => {
    if (autoStart) {
      start();
    }
  }, [autoStart, start]);

  return {
    state,
    start,
    stop,
  };
}

function asMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unexpected error';
}

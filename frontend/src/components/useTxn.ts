import { useEffect, useRef, useState } from 'preact/hooks';
import type { Txn, TxnResult } from '../lib/RestfulModelStore';
import { useTxnStatus } from './useTxnStatus';

/**
 * Runs one store transaction at a time for a component: `start(Store...patch(...), onSuccess)`.
 * `busy` covers the request in flight; `failure` is the result of the last one that failed.
 */
export function useTxn() {
  const [txn, setTxn] = useState<Txn | undefined>();
  const [failure, setFailure] = useState<TxnResult | null>(null);
  const onSuccess = useRef<(() => void) | undefined>(undefined);
  const { txnResult, saving } = useTxnStatus(txn);
  useEffect(() => {
    if (!txnResult) return;
    if (txnResult.status === 'succeeded') onSuccess.current?.();
    else setFailure(txnResult);
  }, [txnResult]);
  const start = (next: Txn, then?: () => void) => {
    setFailure(null);
    onSuccess.current = then;
    setTxn(next);
  };
  return { start, busy: saving, failure, clearFailure: () => setFailure(null) };
}

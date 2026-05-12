import { useLoaders } from '../lib/DataLoader2';
import type { Txn } from '../lib/RestfulModelStore';
import { Store } from '../store';

export function useTxnStatus(txn: Txn | undefined) {
  return useLoaders(() => {
    const txnResult = txn ? Store.txn_status(txn) : undefined;
    return {
      txnResult,
      saving: !!txn && !txnResult,
    };
  }, [Store], [txn]);
}

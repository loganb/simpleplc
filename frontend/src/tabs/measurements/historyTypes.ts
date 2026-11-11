import type { MeasurementSnapshot } from '../../store';

export type HistorySource = Omit<MeasurementSnapshot, 'value'>;
interface HistoryPointBase {
  id: string;
  measurement_id: number;
  start: string;
  end: string;
  source: HistorySource;
  count: number;
  null_count: number;
}
export interface HistorySamplePoint extends HistoryPointBase {
  kind: 'sample';
  recorded_at: string;
  value: number | boolean | null;
}
export interface HistoryBucketPoint extends HistoryPointBase {
  kind: 'bucket';
  statistics: { min?: number; max?: number; mean?: number; true_fraction?: number; transitions?: number; last?: number | boolean | null };
  last_known: boolean;
  coverage: 'raw' | 'summary' | 'mixed';
  gap_detail: 'samples' | 'minute';
}
export type MeasurementHistoryPointFields = HistorySamplePoint | HistoryBucketPoint;
export interface HistoryMetadata {
  since: string;
  until: string;
  target_points: number;
  series: { measurement_id: number; kind: 'sample' | 'bucket'; bucket_seconds: number | null; returned_points: number }[];
}
export interface HistoryGraphSeries { measurementId: number; name: string; color: string; points: MeasurementHistoryPointFields[] }
export interface MeasurementHistoryGraphProps {
  series: HistoryGraphSeries[];
  since: string;
  until: string;
  onPlotWidth?: (width: number) => void;
  unitsFor?: (source: HistorySource) => string | null;
}

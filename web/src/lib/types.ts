export type DayName = string;

export type Band = {
  id: string;
  name: string;
};

export type LineupByDay = Record<DayName, Band[]>;

export type UserProfile = {
  id: string;
  token: string;
  nickname: string;
  selectedBands: string[];
  updatedAt?: string;
};

export type Match = {
  key: string;
  nickname: string;
  matchPct: number;
  sharedCount: number;
  sharedBands?: string[];
};

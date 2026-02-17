export interface ChangelogEntry {
  id: string;
  version: string;
  title: string;
  date: Date | null;
  content: string;
}

export interface EntryListProps {
  entries: ChangelogEntry[];
}

export interface EntryCellProps {
  entry: ChangelogEntry;
}

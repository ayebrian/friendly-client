export interface Authorization {
  id: number;
  token: string;
  accessHash: string;
}

export interface Person {
  id: number;
  nickname: string;
  description: string;
  interests: string[];
}

export interface Post {
  id: number;
  accessHash: string;
  text: string;
  owner: Person;
  instant: string;
  deleted?: boolean;
}

export interface ActivityEvent {
  id: number;
  kind: 'reply' | 'unknown';
  instant: string;
  isRead: boolean;
  post?: Post;
}

export interface ActivityPage {
  items: ActivityEvent[];
  nextCursor: string | null;
}

export interface ActivitySnapshot {
  items: ActivityEvent[];
  complete: boolean;
}

export interface Thread {
  post: Post;
  replies: Post[];
  hasMore: boolean;
}

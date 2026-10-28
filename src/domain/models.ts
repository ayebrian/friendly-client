export interface Authorization {
  id: number;
  token: string;
  accessHash: string;
}

export interface Person {
  id: number;
  accessHash?: string;
  nickname: string;
  description: string;
  interests: string[];
  avatar?: FileDescriptor | null;
  email?: string | null;
  socialLink?: string | null;
  friendship?: 'friends' | 'incomingRequest' | 'outgoingRequest' | 'outgoingDecline' | 'none';
}

export interface FileDescriptor {
  id: number;
  accessHash: string;
}

export interface ProfileInput {
  nickname: string;
  description: string;
  interests: string[];
  socialLink: string | null;
  avatar: FileDescriptor | null;
}

export interface PersonDetails {
  user: Person;
  commonFriends: Person[];
}

export interface DiscoveryPerson {
  details: Person;
  commonFriends: Person[];
  isRequest: boolean;
  isExtendedNetwork: boolean;
}

export interface Post {
  id: number;
  accessHash: string;
  text: string;
  owner: Person;
  instant: string;
  deleted?: boolean;
  edited?: boolean;
  replyPreviews?: Person[];
}

interface ActivityBase {
  id: number;
  instant: string;
  isRead: boolean;
}

/**
 * reply: `post` replied to one of the user's posts.
 * indirectReplies: `post`, a root post the user follows, got new replies;
 * `commonDenominator` is the closest post that leads to all of them.
 * friendRequest: `from` sent a friend request, or accepted the user's request when `isMutual`.
 * unknown: an activity type this client does not understand yet.
 */
export type ActivityEvent =
  | (ActivityBase & { kind: 'reply'; post: Post })
  | (ActivityBase & { kind: 'indirectReplies'; post: Post; commonDenominator: Post })
  | (ActivityBase & { kind: 'friendRequest'; from: Person; isMutual: boolean })
  | (ActivityBase & { kind: 'unknown' });

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
  upstream: Post[];
  replies: ReplyBranch[];
  nextCursor: string | null;
}

export interface ReplyBranch {
  type: 'single' | 'thread';
  posts: Post[];
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

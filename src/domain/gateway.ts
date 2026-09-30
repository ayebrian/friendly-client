import type { ActivityPage, Authorization, Person, Thread } from './models';

/** Transport boundary. Features know this contract, not HTTP or wire formats. */
export interface FriendlyGateway {
  sendLoginCode(email: string, signal?: AbortSignal): Promise<void>;
  login(email: string, code: string, signal?: AbortSignal): Promise<Authorization>;
  profile(signal?: AbortSignal): Promise<Person>;
  activityPage(cursor: string | null, signal?: AbortSignal): Promise<ActivityPage>;
  readActivity(id: number, signal?: AbortSignal): Promise<void>;
  thread(id: number, accessHash: string, signal?: AbortSignal): Promise<Thread>;
}

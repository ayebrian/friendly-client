import type {
  ActivityPage,
  Authorization,
  Person,
  Thread,
  FileDescriptor,
  ProfileInput,
  PersonDetails,
  DiscoveryPerson,
  Page,
  Post,
  ReplyBranch,
} from './models';

/** Transport boundary. Features know this contract, not HTTP or wire formats. */
export interface FriendlyGateway {
  sendLoginCode(email: string, signal?: AbortSignal): Promise<void>;
  login(email: string, code: string, signal?: AbortSignal): Promise<Authorization>;
  register(input: ProfileInput, signal?: AbortSignal): Promise<Authorization>;
  profile(signal?: AbortSignal): Promise<Person>;
  person(id: number, accessHash: string, signal?: AbortSignal): Promise<PersonDetails>;
  editProfile(input: ProfileInput, signal?: AbortSignal): Promise<void>;
  uploadAvatar(file: File, preupload: boolean, signal?: AbortSignal): Promise<FileDescriptor>;
  uploadMedia(file: File, signal?: AbortSignal): Promise<FileDescriptor>;
  fileUrl(file: FileDescriptor): string;
  friends(signal?: AbortSignal): Promise<Person[]>;
  discover(signal?: AbortSignal): Promise<DiscoveryPerson[]>;
  requestFriend(id: number, accessHash: string, signal?: AbortSignal): Promise<void>;
  declineFriend(id: number, accessHash: string, signal?: AbortSignal): Promise<void>;
  invitation(force: boolean, signal?: AbortSignal): Promise<string>;
  acceptInvitation(
    userId: number,
    token: string,
    signal?: AbortSignal,
  ): Promise<'Success' | 'FriendTokenExpired'>;
  linkEmail(email: string, signal?: AbortSignal): Promise<void>;
  confirmEmail(code: string, signal?: AbortSignal): Promise<void>;
  unlinkEmail(signal?: AbortSignal): Promise<void>;
  registerPush(token: string, signal?: AbortSignal): Promise<void>;
  posts(cursor: string | null, signal?: AbortSignal): Promise<Page<Post>>;
  publish(text: string, replyTo?: FileDescriptor, signal?: AbortSignal): Promise<FileDescriptor>;
  editPost(id: number, text: string, signal?: AbortSignal): Promise<void>;
  deletePost(id: number, signal?: AbortSignal): Promise<void>;
  activityPage(cursor: string | null, signal?: AbortSignal): Promise<ActivityPage>;
  readActivity(id: number, signal?: AbortSignal): Promise<void>;
  thread(id: number, accessHash: string, signal?: AbortSignal): Promise<Thread>;
  replies(
    id: number,
    accessHash: string,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<Page<ReplyBranch>>;
}

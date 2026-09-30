import type { FriendlyGateway } from '../domain/gateway';
import type { ActivityEvent, Person, Post, ReplyBranch } from '../domain/models';

/** A separate, session-scoped sandbox. No request ever reaches Friendly. */
export function createDemoGateway() {
  const self: Person = {
    id: 1,
    accessHash: 'demo-user-1',
    nickname: 'Alex',
    description:
      'Collecting city stories in photographs. On weekends I explore new routes and independent bookshops.',
    interests: ['Photography', 'Books', 'Walking'],
    avatar: null,
    email: 'alex@example.test',
    socialLink: null,
    friendship: 'none',
  };
  const people: Person[] = [
    self,
    {
      id: 2,
      accessHash: 'demo-user-2',
      nickname: 'Marina',
      description: 'Long walks, architecture, and conversations over coffee.',
      interests: ['Architecture', 'Walking'],
      friendship: 'friends',
    },
    {
      id: 3,
      accessHash: 'demo-user-3',
      nickname: 'Alexey',
      description: 'Reading science fiction and starting a book club.',
      interests: ['Books', 'Films'],
      friendship: 'friends',
    },
    {
      id: 4,
      accessHash: 'demo-user-4',
      nickname: 'Sasha',
      description: 'Looking for company for cycling trips and hikes.',
      interests: ['Cycling', 'Hiking'],
      friendship: 'incomingRequest',
    },
    {
      id: 5,
      accessHash: 'demo-user-5',
      nickname: 'Nina',
      description: 'Sketching the city. Always happy to meet up with a sketchbook.',
      interests: ['Drawing', 'City life'],
      friendship: 'none',
    },
  ];
  let nextId = 100;
  const posts: (Post & { parent?: number })[] = [];
  function add(id: number, ownerId: number, text: string, minutes: number, parent?: number) {
    const post = {
      id,
      accessHash: `demo-post-${id}`,
      owner: people.find((p) => p.id === ownerId)!,
      text,
      instant: new Date(Date.now() - minutes * 60_000).toISOString(),
      parent,
      edited: false,
    };
    posts.push(post);
    return post;
  }
  add(
    10,
    1,
    'Where should we go on Saturday?\n\nHow about meeting by the river and walking through the old town? I will bring my camera.\n\n**Who is joining us?**',
    170,
  );
  add(
    11,
    3,
    'What are you reading this autumn?\n\nI just finished Solaris. I would love to discuss the ending and find my next book.',
    200,
  );
  add(
    12,
    1,
    'Small discoveries this week\n\n- A bookshop on a quiet street\n- A new route along the river\n- Coffee with someone I had not seen in a while\n\nSometimes a good day starts with stepping outside.',
    1440,
  );
  const first = add(
    4,
    2,
    'I am up for a walk too! Let us pick a meeting place in the thread.',
    5,
    10,
  );
  const second = add(3, 3, 'Thanks for the recommendation. Added the book to my list.', 38, 11);
  const third = add(2, 4, 'It is nice to have a place to talk in a small circle.', 160, 10);
  const fourth = add(6, 2, 'See you on Saturday!', 1500, 12);
  add(20, 1, 'Then let us meet at the bridge at 11. I will bring a flask.', 3, 4);
  add(21, 2, 'Sounds good. See you there!', 2, 20);
  let events: ActivityEvent[] = [first, second, third, fourth].map((post, i) => ({
    id: 4 - i,
    kind: 'reply',
    post,
    instant: post.instant,
    isRead: i === 3,
  }));
  let pendingEmail = '';
  let invite = 'demo-invitation';
  const files = new Map<number, string>();
  const clone = <T>(value: T): T => structuredClone(value);
  function person(id: number, accessHash?: string) {
    const found = people.find((p) => p.id === id && (!accessHash || p.accessHash === accessHash));
    if (!found) throw new Error('Profile not found.');
    return found;
  }
  function post(id: number, accessHash?: string) {
    const found = posts.find((p) => p.id === id && (!accessHash || p.accessHash === accessHash));
    if (!found) throw new Error('Thread not found.');
    return found;
  }
  function branches(id: number): ReplyBranch[] {
    return posts
      .filter((p) => p.parent === id)
      .map((p) => {
        const chain: Post[] = [p];
        let current = p;
        while (true) {
          const children = posts.filter((child) => child.parent === current.id);
          if (children.length !== 1) break;
          current = children[0];
          chain.push(current);
        }
        return { type: chain.length > 1 ? 'thread' : 'single', posts: clone(chain) };
      });
  }
  const gateway: FriendlyGateway = {
    async sendLoginCode() {
      throw new Error('There is no need to sign in to the demo.');
    },
    async login() {
      throw new Error('There is no need to sign in to the demo.');
    },
    async register() {
      throw new Error('Exit the demo to create a real account.');
    },
    async profile() {
      return clone(self);
    },
    async person(id, hash) {
      return {
        user: clone(person(id, hash)),
        commonFriends: clone(people.filter((p) => p.id !== id && p.friendship === 'friends')),
      };
    },
    async editProfile(input) {
      Object.assign(self, clone(input));
    },
    async uploadAvatar(file) {
      const id = ++nextId;
      files.set(id, URL.createObjectURL(file));
      return { id, accessHash: `demo-file-${id}` };
    },
    fileUrl(file) {
      return files.get(file.id) ?? '';
    },
    async friends() {
      return clone(people.filter((p) => p.friendship === 'friends'));
    },
    async discover() {
      return clone(
        people
          .filter(
            (p) => p.id !== self.id && ['none', 'incomingRequest'].includes(p.friendship ?? 'none'),
          )
          .map((p) => ({
            details: p,
            commonFriends: [people[1]],
            isRequest: p.friendship === 'incomingRequest',
            isExtendedNetwork: true,
          })),
      );
    },
    async requestFriend(id, hash) {
      const p = person(id, hash);
      p.friendship = p.friendship === 'incomingRequest' ? 'friends' : 'outgoingRequest';
    },
    async declineFriend(id, hash) {
      person(id, hash).friendship = 'outgoingDecline';
    },
    async invitation(force) {
      if (force) invite = `demo-invitation-${++nextId}`;
      return invite;
    },
    async acceptInvitation(id, token) {
      if (token !== invite) return 'FriendTokenExpired';
      person(id).friendship = 'friends';
      return 'Success';
    },
    async linkEmail(email) {
      pendingEmail = email;
    },
    async confirmEmail(code) {
      if (code !== '12345678' || !pendingEmail) throw new Error('Use 12345678 as the demo code.');
      self.email = pendingEmail;
      pendingEmail = '';
    },
    async unlinkEmail() {
      self.email = null;
    },
    async registerPush() {
      throw new Error('Push notifications require a real account.');
    },
    async posts(cursor) {
      const roots = posts
        .filter((p) => !p.parent && !p.deleted)
        .toReversed()
        .map((p) => ({
          ...p,
          replyPreviews: posts.filter((r) => r.parent === p.id).map((r) => r.owner),
        }));
      const offset = Number(cursor ?? 0);
      return {
        items: clone(roots.slice(offset, offset + 2)),
        nextCursor: offset + 2 < roots.length ? String(offset + 2) : null,
      };
    },
    async publish(text, replyTo) {
      if (replyTo) post(replyTo.id, replyTo.accessHash);
      const created = add(++nextId, self.id, text, 0, replyTo?.id);
      return { id: created.id, accessHash: created.accessHash };
    },
    async editPost(id, text) {
      const p = post(id);
      if (p.owner.id !== self.id) throw new Error('You can only edit your own posts.');
      p.text = text;
      p.edited = true;
    },
    async deletePost(id) {
      const p = post(id);
      if (p.owner.id !== self.id) throw new Error('You can only delete your own posts.');
      p.deleted = true;
      p.text = 'Post deleted';
    },
    async activityPage() {
      return { items: clone(events), nextCursor: null };
    },
    async readActivity(id) {
      events = events.map((item) => (item.id === id ? { ...item, isRead: true } : item));
    },
    async thread(id, hash) {
      const p = post(id, hash);
      const upstream: Post[] = [];
      let parent = p.parent;
      while (parent) {
        const ancestor = post(parent);
        upstream.unshift(ancestor);
        parent = ancestor.parent;
      }
      const replies = branches(id);
      return {
        post: clone(p),
        upstream: clone(upstream),
        replies: replies.slice(0, 1),
        nextCursor: replies.length > 1 ? '1' : null,
      };
    },
    async replies(id, hash, cursor) {
      post(id, hash);
      const list = branches(id);
      const offset = Number(cursor ?? 0);
      return {
        items: list.slice(offset, offset + 1),
        nextCursor: offset + 1 < list.length ? String(offset + 1) : null,
      };
    },
  };
  return {
    gateway,
    dispose() {
      files.forEach((url) => URL.revokeObjectURL(url));
      files.clear();
    },
    simulate() {
      const reply = add(++nextId, 2, 'New activity arrived while you were on another page.', 0, 10);
      events = [
        { id: ++nextId, kind: 'reply', instant: reply.instant, isRead: false, post: reply },
        ...events,
      ];
    },
  };
}

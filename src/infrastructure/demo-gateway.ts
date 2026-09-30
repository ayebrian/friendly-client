import type { FriendlyGateway } from '../domain/gateway';
import type { ActivityEvent, Person, Post } from '../domain/models';

/** Explicit, isolated preview adapter. Never used by real sessions. */
export function createDemoGateway() {
  const person: Person = {
    id: 1,
    nickname: 'Александр',
    description: 'Фотография, прогулки и книги.',
    interests: ['Фотография', 'Книги'],
  };
  const author = (id: number, nickname: string): Person => ({
    id,
    nickname,
    description: '',
    interests: [],
  });
  const post = (id: number, nickname: string, text: string, minutes: number): Post => ({
    id,
    accessHash: `demo-${id}`,
    owner: author(id, nickname),
    text,
    instant: new Date(Date.now() - minutes * 60_000).toISOString(),
  });
  let items: ActivityEvent[] = [
    {
      id: 4,
      kind: 'reply',
      isRead: false,
      instant: post(4, '', '', 5).instant,
      post: post(4, 'Марина', 'Я тоже за прогулку! Давайте выберем место в обсуждении.', 5),
    },
    {
      id: 3,
      kind: 'reply',
      isRead: false,
      instant: post(3, '', '', 38).instant,
      post: post(3, 'Алексей', 'Спасибо за рекомендацию. Добавил книгу в свой список.', 38),
    },
    {
      id: 2,
      kind: 'reply',
      isRead: false,
      instant: post(2, '', '', 160).instant,
      post: post(2, 'Саша', 'Здорово, что здесь можно общаться небольшим кругом.', 160),
    },
    {
      id: 1,
      kind: 'reply',
      isRead: true,
      instant: post(1, '', '', 1500).instant,
      post: post(1, 'Марина', 'До встречи в субботу!', 1500),
    },
  ];
  const gateway: FriendlyGateway = {
    async sendLoginCode() {
      throw new Error('В демонстрации вход не требуется.');
    },
    async login() {
      throw new Error('В демонстрации вход не требуется.');
    },
    async profile() {
      return structuredClone(person);
    },
    async activityPage() {
      return { items: structuredClone(items), nextCursor: null };
    },
    async readActivity(id) {
      items = items.map((item) => (item.id === id ? { ...item, isRead: true } : item));
    },
    async thread(id) {
      const item = items.find((item) => item.post?.id === id);
      if (!item?.post) throw new Error('Обсуждение не найдено.');
      return { post: structuredClone(item.post), replies: [], hasMore: false };
    },
  };
  return {
    gateway,
    simulate() {
      const id = Math.max(...items.map((item) => item.id)) + 1;
      const reply = post(
        id,
        'Марина',
        'Новое событие появилось, пока вы были на другой странице.',
        0,
      );
      items = [{ id, kind: 'reply', instant: reply.instant, isRead: false, post: reply }, ...items];
    },
  };
}

import { PageHeader } from '../../shared/page-header';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useRuntime } from '../../shared/runtime';
import { useOperation } from '../../shared/use-operation';
import { postPath } from '../../shared/links';
import { PostComposer } from './PostComposer';

export function ComposePage() {
  const { gateway } = useRuntime();
  const navigate = useNavigate();
  const client = useQueryClient();
  const publish = useOperation((text: string, signal) => gateway.publish(text, undefined, signal));
  return (
    <section className="page-content">
      <PageHeader backTo="/community" backLabel="Back to feed">
        <h1>Create a post</h1>
      </PageHeader>
      <PostComposer
        onSubmit={async (text) => {
          const post = await publish.mutateAsync(text);
          void client.invalidateQueries({ queryKey: ['posts'] });
          void navigate(postPath(post));
        }}
        onCancel={() => void navigate('/community')}
      />
    </section>
  );
}

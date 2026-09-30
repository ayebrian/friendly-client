import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Person } from '../domain/models';
import { useRuntime } from './runtime';
import { useOperation } from './use-operation';
import { Button } from './ui/button';
import { ConfirmAction } from './confirm-action';
import { ErrorNotice } from './feedback';
import { errorMessage } from './errors';

export function FriendActions({ person }: { person: Person }) {
  const { gateway, userId } = useRuntime();
  const client = useQueryClient();
  const operation = useOperation((action: 'request' | 'decline', signal) =>
    action === 'request'
      ? gateway.requestFriend(person.id, person.accessHash!, signal)
      : gateway.declineFriend(person.id, person.accessHash!, signal),
  );
  if (!person.accessHash || person.id === userId) return null;
  async function act(action: 'request' | 'decline') {
    await operation.mutateAsync(action);
    await Promise.all(
      ['person', 'friends', 'discover'].map((key) => client.invalidateQueries({ queryKey: [key] })),
    );
    toast.success(
      action === 'decline'
        ? 'List updated'
        : person.friendship === 'incomingRequest'
          ? 'You are now friends'
          : 'Request sent',
    );
  }
  return (
    <div className="relationship">
      <div className="inline-actions">
        {person.friendship === 'friends' ? (
          <ConfirmAction
            title="Remove this friend?"
            description={`${person.nickname} will no longer be in your circle.`}
            action="Delete"
            onConfirm={() => act('decline')}
          >
            <Button variant="outline" disabled={operation.isPending}>
              Remove friend
            </Button>
          </ConfirmAction>
        ) : person.friendship === 'outgoingRequest' ? (
          <>
            <span className="relationship-status">Request sent</span>
            <Button
              variant="outline"
              disabled={operation.isPending}
              onClick={() => void act('decline').catch(() => {})}
            >
              Cancel request
            </Button>
          </>
        ) : (
          <>
            <Button
              disabled={operation.isPending}
              onClick={() => void act('request').catch(() => {})}
            >
              {operation.isPending
                ? 'Please wait…'
                : person.friendship === 'incomingRequest'
                  ? 'Accept request'
                  : 'Add friend'}
            </Button>
            {person.friendship === 'incomingRequest' && (
              <Button
                variant="outline"
                disabled={operation.isPending}
                onClick={() => void act('decline').catch(() => {})}
              >
                Decline
              </Button>
            )}
          </>
        )}
      </div>
      {operation.isError && <ErrorNotice message={errorMessage(operation.error)} />}
    </div>
  );
}

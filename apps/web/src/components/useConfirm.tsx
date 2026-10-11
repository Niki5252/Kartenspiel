import { type ReactNode, useCallback, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

interface Request {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  action: () => void;
}

/** Kleiner Helfer: `confirm({...})` öffnet die Sicherheitsabfrage, `dialog` muss gerendert werden. */
export function useConfirm(): { confirm: (req: Request) => void; dialog: ReactNode } {
  const [request, setRequest] = useState<Request | null>(null);
  const confirm = useCallback((req: Request) => setRequest(req), []);
  const dialog = request ? (
    <ConfirmDialog
      title={request.title}
      message={request.message}
      confirmLabel={request.confirmLabel}
      danger={request.danger}
      onCancel={() => setRequest(null)}
      onConfirm={() => {
        request.action();
        setRequest(null);
      }}
    />
  ) : null;
  return { confirm, dialog };
}

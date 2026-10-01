import { useEffect, useLayoutEffect, useRef, type Ref } from 'react';
import { Textarea } from './ui/textarea';
import { transferredFiles } from './media-transfer';

function plainText(element: HTMLElement) {
  return (element.innerText ?? element.textContent ?? '').replace(/\r\n?/g, '\n');
}

/** Plain text editing on a rich editing host, required by Android's image IME. */
export function MediaTextEditor({
  value,
  onChange,
  onBlur,
  onFiles,
  disabled,
  id,
  labelledBy,
  describedBy,
  invalid,
  compact,
  ref,
}: {
  value: string;
  onChange: (text: string) => void;
  onBlur: () => void;
  onFiles: (files: File[]) => void;
  disabled: boolean;
  id: string;
  labelledBy: string;
  describedBy: string;
  invalid: boolean;
  compact: boolean;
  ref?: Ref<HTMLDivElement>;
}) {
  const editor = useRef<HTMLDivElement | null>(null);
  const lastPaste = useRef({ signature: '', at: 0 });
  const composing = useRef(false);
  const current = useRef({ onChange, onFiles, disabled });
  current.current = { onChange, onFiles, disabled };

  useLayoutEffect(() => {
    const element = editor.current;
    if (element && !composing.current && plainText(element) !== value) element.textContent = value;
  }, [value]);

  function insertText(text: string) {
    const element = editor.current!;
    // Native insertion preserves undo and the selection on Chrome, Safari and Firefox.
    if (document.execCommand?.('insertText', false, text)) return;
    const selection = window.getSelection();
    if (selection?.rangeCount && element.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else element.append(document.createTextNode(text));
    current.current.onChange(plainText(element));
  }

  useEffect(() => {
    const element = editor.current!;
    const beforeInput = (event: InputEvent) => {
      if (event.inputType !== 'insertFromPaste') return;
      const files = transferredFiles(event.dataTransfer);
      if (!files.length) return;
      event.preventDefault();
      if (current.current.disabled) return;
      const signature = files.map((file) => `${file.name}:${file.type}:${file.size}`).join('|');
      // Some IMEs emit both paste and beforeinput for the same insertion.
      if (
        signature === lastPaste.current.signature &&
        performance.now() - lastPaste.current.at < 250
      )
        return;
      current.current.onFiles(files);
    };
    element.addEventListener('beforeinput', beforeInput);
    return () => element.removeEventListener('beforeinput', beforeInput);
  }, []);

  return (
    <Textarea asChild className={`media-text-editor${compact ? ' composer-input' : ''}`}>
      <div
        ref={(element) => {
          editor.current = element;
          if (typeof ref === 'function') ref(element);
          else if (ref) ref.current = element;
        }}
        id={id}
        role="textbox"
        aria-multiline="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        aria-disabled={disabled}
        contentEditable={!disabled}
        suppressContentEditableWarning
        tabIndex={disabled ? -1 : 0}
        data-placeholder="What is on your mind?"
        data-empty={!value}
        onBlur={onBlur}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          onChange(plainText(editor.current!));
        }}
        onInput={(event) => {
          if (disabled) return;
          // A non-cancelable IME insertion must not leave raw image nodes in the text field.
          event.currentTarget
            .querySelectorAll('img, video, audio')
            .forEach((node) => node.remove());
          onChange(plainText(event.currentTarget));
        }}
        onPaste={(event) => {
          const files = transferredFiles(event.clipboardData);
          if (files.length) {
            event.preventDefault();
            if (disabled) return;
            lastPaste.current = {
              signature: files.map((file) => `${file.name}:${file.type}:${file.size}`).join('|'),
              at: performance.now(),
            };
            onFiles(files);
          } else {
            // Keep pasted formatting/HTML out of this Markdown editor.
            event.preventDefault();
            if (!disabled) insertText(event.clipboardData.getData('text/plain'));
          }
        }}
      />
    </Textarea>
  );
}

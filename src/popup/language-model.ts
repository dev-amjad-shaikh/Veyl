/**
 * Chrome's built-in on-device model, wrapped thinly.
 *
 * Nothing is bundled and nothing is downloaded by Veyl: Chrome ships the model,
 * runs it locally, and the extension needs no permission to ask. That is the
 * whole reason this is the runtime Veyl uses — a privacy tool that shipped a
 * gigabyte of weights from a server would be arguing against itself.
 *
 * The API is only present in Chrome 138 and later, and only as a document API,
 * so this lives in the popup rather than the service worker. Everywhere it is
 * missing, Veyl simply does not offer the feature.
 */
export type ModelAvailability = 'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LanguageModelSession {
  promptStreaming(input: string, options?: { signal?: AbortSignal }): ReadableStream<string>;
  destroy(): void;
}

interface LanguageModelStatic {
  availability(): Promise<Exclude<ModelAvailability, 'unsupported'>>;
  create(options?: {
    initialPrompts?: { role: 'system' | 'user' | 'assistant'; content: string }[];
    monitor?: (monitor: EventTarget) => void;
    signal?: AbortSignal;
  }): Promise<LanguageModelSession>;
}

function api(): LanguageModelStatic | null {
  const candidate = (globalThis as { LanguageModel?: LanguageModelStatic }).LanguageModel;
  return typeof candidate?.availability === 'function' ? candidate : null;
}

export async function availability(): Promise<ModelAvailability> {
  const model = api();
  if (!model) return 'unsupported';
  try {
    return await model.availability();
  } catch {
    return 'unavailable';
  }
}

export interface Session {
  ask(question: string, onChunk: (text: string) => void, signal?: AbortSignal): Promise<void>;
  close(): void;
}

/**
 * `onDownloadProgress` fires only the first time Chrome needs the model, which
 * is a multi-gigabyte download. The interface asks before triggering it.
 */
export async function createSession(
  instructions: string,
  onDownloadProgress?: (fraction: number) => void
): Promise<Session> {
  const model = api();
  if (!model) throw new Error('This version of Chrome has no on-device model.');

  const session = await model.create({
    initialPrompts: [{ role: 'system', content: instructions }],
    ...(onDownloadProgress
      ? {
          monitor: (monitor: EventTarget) => {
            monitor.addEventListener('downloadprogress', (event) => {
              onDownloadProgress((event as ProgressEvent).loaded);
            });
          },
        }
      : {}),
  });

  return {
    async ask(question, onChunk, signal) {
      const stream = session.promptStreaming(question, signal ? { signal } : {});
      const reader = stream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) onChunk(value);
        }
      } finally {
        reader.releaseLock();
      }
    },
    close() {
      try {
        session.destroy();
      } catch {
        /* already gone */
      }
    },
  };
}

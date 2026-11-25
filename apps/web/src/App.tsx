// App — @vcs/web (M0 §8.3).
// Khung: header (tên dự án, badge kết nối, đổi ngôn ngữ, dark mode) +
// Sim bar + bảng Tags + Diagnostics panel. WS client nối cùng origin
// (OQ-058); message server → store; lỗi server hiện ở banner lastError.

import { useEffect, useRef, useState } from 'react';
import type { TagValue } from '@vcs/schemas';
import { DiagnosticsPanel } from './components/DiagnosticsPanel.js';
import { PlcWorkspace } from './components/PlcWorkspace.js';
import { SimBar } from './components/SimBar.js';
import { TagTable } from './components/TagTable.js';
import { effectiveLang, useSimSnapshot, useSimStore, type Theme } from './store.js';
import { t, type Lang } from './i18n/index.js';
import { WsClient, type WsSocketLike } from './ws-client.js';

const LANG_KEY = 'vcs.lang';
const THEME_KEY = 'vcs.theme';

/** URL WS cùng origin (OQ-058): dev qua Vite proxy /ws, prod cùng Fastify. */
export function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

function initialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function initialLang(): Lang | null {
  try {
    const saved = window.localStorage.getItem(LANG_KEY);
    if (saved === 'vi' || saved === 'en') return saved;
    return null;
  } catch {
    return null;
  }
}

export function App() {
  const s = useSimSnapshot();
  const lang = effectiveLang(s);
  const clientRef = useRef<WsClient | null>(null);
  const [view, setView] = useState<'tags' | 'plc'>('tags');

  useEffect(() => {
    const store = useSimStore.getState();
    store.setTheme(initialTheme());
    const savedLang = initialLang();
    if (savedLang !== null) store.setLang(savedLang);
    // boundary: WebSocket DOM thỏa mãn WsSocketLike ở runtime (cùng các
    // thành viên send/close/onopen/onmessage/onclose/onerror); kiểu tĩnh
    // của handler DOM (Event) hẹp hơn unknown nên cần cast.
    const client = new WsClient(wsUrl(), (url) => new WebSocket(url) as unknown as WsSocketLike, {
      onConnectionChange: (status) => {
        useSimStore.getState().setConnection(status);
      },
      onInvalidMessage: (reason) => {
        useSimStore.getState().setLastError(reason);
      },
      onMessage: (msg) => {
        const st = useSimStore.getState();
        switch (msg.type) {
          case 'welcome':
            st.setProject(msg.project.name, msg.project.language);
            st.applyState(msg.sim);
            break;
          case 'sim.state':
            st.applyState(msg);
            break;
          case 'tags.snapshot':
            st.applySnapshot(msg);
            break;
          case 'tags.delta':
            st.applyDelta(msg);
            break;
          case 'diagnostics':
            st.applyDiagnostics(msg);
            break;
          case 'plc.values':
            st.applyPlcValues(msg);
            break;
          case 'error':
            st.setLastError(`${msg.code}: ${msg.message}`);
            break;
        }
      },
    });
    clientRef.current = client;
    client.connect();
    return () => {
      client.stop();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', s.theme === 'dark');
    try {
      window.localStorage.setItem(THEME_KEY, s.theme);
    } catch {
      // localStorage không dùng được (chế độ riêng tư…): theme chỉ giữ trong phiên.
    }
  }, [s.theme]);

  const connectionText = t(lang, `header.connection.${s.connection}`);
  return (
    <div className="flex h-screen flex-col bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-gray-300 px-4 py-2 dark:border-gray-700">
        <h1 className="text-lg font-bold">{t(lang, 'app.title')}</h1>
        <span>
          {t(lang, 'header.project')}: {s.projectName}
        </span>
        <span data-testid="connection-badge">{connectionText}</span>
        <label>
          {t(lang, 'header.language')}{' '}
          <select
            data-testid="lang-select"
            onChange={(e) => {
              const v = e.target.value;
              if (v !== 'vi' && v !== 'en') return;
              useSimStore.getState().setLang(v);
              try {
                window.localStorage.setItem(LANG_KEY, v);
              } catch {
                // Bỏ qua: lựa chọn chỉ giữ trong phiên.
              }
            }}
            value={lang}
          >
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
        </label>
        <button
          data-testid="theme-toggle"
          onClick={() => {
            useSimStore.getState().setTheme(s.theme === 'dark' ? 'light' : 'dark');
          }}
          type="button"
        >
          {s.theme === 'dark' ? t(lang, 'header.theme.light') : t(lang, 'header.theme.dark')}
        </button>
      </header>
      {s.lastError !== null && (
        <div className="bg-red-100 px-4 py-1 text-red-800 dark:bg-red-900 dark:text-red-100" role="alert">
          <span data-testid="last-error">
            {t(lang, 'error.title')}: {s.lastError}
          </span>{' '}
          <button
            onClick={() => {
              useSimStore.getState().setLastError(null);
            }}
            type="button"
          >
            {t(lang, 'error.dismiss')}
          </button>
        </div>
      )}
      <SimBar
        lang={lang}
        onCommand={(cmd) => {
          clientRef.current?.command(cmd);
        }}
        onTimeScale={(v) => {
          clientRef.current?.timeScale(v);
        }}
      />
      <nav aria-label="views" className="flex gap-2 border-b border-gray-300 px-4 py-1 dark:border-gray-700">
        <button
          data-testid="nav-tags"
          onClick={() => {
            setView('tags');
          }}
          type="button"
          className={view === 'tags' ? 'font-bold underline' : undefined}
        >
          {t(lang, 'nav.tags')}
        </button>
        <button
          data-testid="nav-plc"
          onClick={() => {
            setView('plc');
          }}
          type="button"
          className={view === 'plc' ? 'font-bold underline' : undefined}
        >
          {t(lang, 'nav.plc')}
        </button>
      </nav>
      {view === 'tags' ? (
        <TagTable
          lang={lang}
          onWriteTag={(name: string, value: TagValue) => {
            const sent = clientRef.current?.writeTag(name, value) ?? false;
            if (!sent) {
              // OQ-059: write lúc mất kết nối thì bỏ + hiện trạng thái.
              useSimStore.getState().setLastError(t(lang, 'header.connection.disconnected'));
            }
          }}
        />
      ) : (
        <PlcWorkspace
          lang={lang}
          onPlcForce={(ref, value) => {
            clientRef.current?.plcForce(ref, value);
          }}
          onPlcUnforce={(ref) => {
            clientRef.current?.plcUnforce(ref);
          }}
          onPlcUnwatch={() => {
            clientRef.current?.plcUnwatch();
          }}
          onPlcWatch={(refs) => {
            clientRef.current?.plcWatch(refs);
          }}
          onPlcWrite={(ref, value) => {
            clientRef.current?.plcWrite(ref, value);
          }}
        />
      )}
      <DiagnosticsPanel lang={lang} />
    </div>
  );
}

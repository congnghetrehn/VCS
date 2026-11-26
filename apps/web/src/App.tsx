// App — @vcs/web (M0 §8.3).
// Khung: header (tên dự án, badge kết nối, đổi ngôn ngữ, dark mode) +
// Sim bar + bảng Tags + Diagnostics panel. WS client nối cùng origin
// (OQ-058); message server → store; lỗi server hiện ở banner lastError.

import { useEffect, useRef, useState } from 'react';
import type { TagValue } from '@vcs/schemas';
import { DiagnosticsPanel } from './components/DiagnosticsPanel.js';
import { EquipmentInspector } from './components/EquipmentInspector.js';
import { EventLog } from './components/EventLog.js';
import { ImportWizard } from './components/ImportWizard.js';
import { PlantDesigner } from './components/PlantDesigner.js';
import { PlcWorkspace } from './components/PlcWorkspace.js';
import { SimBar } from './components/SimBar.js';
import { TagManager } from './components/TagManager.js';
import { effectiveLang, useSimSnapshot, useSimStore, type Theme } from './store.js';
import { t, type Lang } from './i18n/index.js';
import { wakeLockAvailable } from './pwa.js';
import { applyPwaUpdate } from './pwa-register.js';
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
  const [view, setView] = useState<'tags' | 'plc' | 'import' | 'plant'>('tags');

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

  // P0.9 (OQ-229): kiosk chặn zoom/pull-to-refresh ngoài ý muốn bằng viewport
  // maximum-scale + user-scalable=no; chế độ thường giữ zoom (a11y P0.6).
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta === null) return;
    meta.setAttribute(
      'content',
      s.kiosk
        ? 'width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no'
        : 'width=device-width, initial-scale=1.0',
    );
  }, [s.kiosk]);

  // P0.9 (OQ-228): Wake Lock khi vào kiosk, xin lại khi tab hiện lại, nhả
  // khi thoát kiosk. Không hỗ trợ/bị từ chối → kiosk chạy tiếp, ghi chú.
  useEffect(() => {
    if (!s.kiosk) return;
    const store = useSimStore.getState();
    const supported = wakeLockAvailable(window.navigator);
    store.setWakeLock(supported, false);
    if (!supported) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async (): Promise<void> => {
      try {
        sentinel = await window.navigator.wakeLock.request('screen');
        if (!cancelled) useSimStore.getState().setWakeLock(true, true);
      } catch {
        // Bị từ chối (vd trình duyệt chặn): kiosk chạy tiếp không Wake Lock.
      }
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel !== null) void sentinel.release().catch(() => undefined);
    };
  }, [s.kiosk]);

  /** P0.9 (OQ-227): Fullscreen chỉ từ nút bấm; fail thì kiosk chạy tiếp. */
  const requestFullscreen = async (): Promise<void> => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Trình duyệt chặn/không hỗ trợ: kiosk chạy tiếp trong cửa sổ.
    }
  };

  /** P0.9 (OQ-226): thoát kiosk + gỡ ?kiosk=1 khỏi URL (reload không vào lại). */
  const exitKiosk = (): void => {
    const url = new URL(window.location.href);
    url.searchParams.delete('kiosk');
    window.history.replaceState(null, '', url);
    useSimStore.getState().setKiosk(false);
  };

  /** P0.9 (OQ-222): bấm "Tải lại" trên banner cập nhật (dirty → hỏi trước). */
  const onReloadUpdate = (): void => {
    if (useSimStore.getState().plcDirty) {
      if (!window.confirm(t(lang, 'pwa.update.confirmDirty'))) return;
    }
    applyPwaUpdate();
  };

  const connectionText = t(lang, `header.connection.${s.connection}`);
  return (
    <div
      className={`flex h-screen flex-col bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100${
        s.kiosk ? ' overscroll-none touch-manipulation' : ''
      }`}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-gray-300 px-4 py-2 dark:border-gray-700">
        <h1 className="text-lg font-bold">{t(lang, 'app.title')}</h1>
        <span>
          {t(lang, 'header.project')}: {s.projectName}
        </span>
        <span data-testid="connection-badge">{connectionText}</span>
        {!s.kiosk && (
          <>
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
          </>
        )}
      </header>
      {s.kiosk && (
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-300 bg-gray-100 px-4 py-1 dark:border-gray-700 dark:bg-gray-800">
          <button
            data-testid="kiosk-fullscreen"
            onClick={() => {
              void requestFullscreen();
            }}
            type="button"
          >
            {t(lang, 'kiosk.fullscreen')}
          </button>
          <button data-testid="kiosk-exit" onClick={exitKiosk} type="button">
            {t(lang, 'kiosk.exit')}
          </button>
          {!s.wakeLockSupported && (
            <span data-testid="kiosk-wake-lock-note">{t(lang, 'kiosk.noWakeLock')}</span>
          )}
        </div>
      )}
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
      {s.updateAvailable && (
        <div className="bg-amber-100 px-4 py-1 text-amber-900 dark:bg-amber-900 dark:text-amber-100">
          <span data-testid="pwa-update-banner">{t(lang, 'pwa.update.available')}</span>{' '}
          <button data-testid="pwa-update-reload" onClick={onReloadUpdate} type="button">
            {t(lang, 'pwa.update.reload')}
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
      {!s.kiosk && (
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
          <button
            data-testid="nav-import"
            onClick={() => {
              setView('import');
            }}
            type="button"
            className={view === 'import' ? 'font-bold underline' : undefined}
          >
            {t(lang, 'nav.import')}
          </button>
          <button
            data-testid="nav-plant"
            onClick={() => {
              setView('plant');
            }}
            type="button"
            className={view === 'plant' ? 'font-bold underline' : undefined}
          >
            {t(lang, 'nav.plant')}
          </button>
        </nav>
      )}
      {view === 'import' ? (
        <ImportWizard lang={lang} />
      ) : view === 'plant' ? (
        <>
          <PlantDesigner lang={lang} />
          <EquipmentInspector
            lang={lang}
            onPlantManualSet={(equipment, value) => {
              clientRef.current?.plantManualSet(equipment, value);
            }}
            onPlantSourceSet={(equipment, source) => {
              clientRef.current?.plantSourceSet(equipment, source);
            }}
            onPlantFaultClear={(id) => {
              clientRef.current?.plantFaultClear(id);
            }}
            onPlantFaultInject={(request) => {
              clientRef.current?.plantFaultInject(request);
            }}
            onPlantFaultPreset={(equipment, preset, when) => {
              clientRef.current?.plantFaultPreset(equipment, preset, when);
            }}
          />
          <EventLog lang={lang} />
        </>
      ) : view === 'tags' ? (
        <TagManager
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
          onPlantFaultClear={(id) => {
            clientRef.current?.plantFaultClear(id);
          }}
          onPlantFaultInject={(request) => {
            clientRef.current?.plantFaultInject(request);
          }}
          onPlantFaultPreset={(equipment, preset, when) => {
            clientRef.current?.plantFaultPreset(equipment, preset, when);
          }}
        />
      )}
      <DiagnosticsPanel lang={lang} />
    </div>
  );
}

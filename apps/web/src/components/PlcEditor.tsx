// Editor SCL dùng Monaco — @vcs/web (P1.7, OQ-209, ADR-0008).
// Monaco nạp lười (dynamic import) để trang Tags không phải tải; worker
// qua Vite `?worker`. Highlight SCL tối thiểu (Monarch): từ khóa, comment
// `(* *)` + `//`, chuỗi, số, `#local`. Không có IntelliSense/completion
// (ngoài phạm vi P1.7 — editor tối thiểu).

import { useEffect, useRef, useState } from 'react';
import type * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import type { Theme } from '../store.js';

/** Từ khóa SCL (quy ước viết hoa, như mẫu M1 §13) — highlight tối thiểu. */
const SCL_KEYWORDS = [
  'FUNCTION_BLOCK', 'END_FUNCTION_BLOCK',
  'FUNCTION', 'END_FUNCTION',
  'ORGANIZATION_BLOCK', 'END_ORGANIZATION_BLOCK',
  'DATA_BLOCK', 'END_DATA_BLOCK',
  'TYPE', 'END_TYPE',
  'STRUCT', 'END_STRUCT',
  'VAR_INPUT', 'VAR_OUTPUT', 'VAR_IN_OUT', 'VAR', 'VAR_TEMP', 'END_VAR',
  'BEGIN', 'IF', 'THEN', 'ELSIF', 'ELSE', 'END_IF',
  'FOR', 'TO', 'BY', 'DO', 'END_FOR',
  'WHILE', 'END_WHILE',
  'REPEAT', 'UNTIL', 'END_REPEAT',
  'CASE', 'OF', 'END_CASE',
  'RETURN', 'EXIT', 'CONTINUE',
  'AND', 'OR', 'NOT', 'XOR',
  'TRUE', 'FALSE',
];

export interface PlcEditorProps {
  value: string;
  theme: Theme;
  onChange: (value: string) => void;
}

export function PlcEditor({ value, theme, onChange }: PlcEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Giá trị mới nhất (file có thể mở trước khi Monaco tải xong).
  const valueRef = useRef(value);
  valueRef.current = value;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let editor: monaco.editor.IStandaloneCodeEditor | null = null;
    let model: monaco.editor.ITextModel | null = null;
    void import('monaco-editor')
      .then((monaco) => {
        if (disposed || containerRef.current === null) return;
        (self as unknown as { MonacoEnvironment?: { getWorker: () => Worker } }).MonacoEnvironment = {
          getWorker: () => new editorWorker(),
        };
        monaco.languages.register({ id: 'scl' });
        monaco.languages.setMonarchTokensProvider('scl', {
          keywords: SCL_KEYWORDS,
          tokenizer: {
            root: [
              [/\(\*/, 'comment', '@comment'],
              [/\/\/.*$/, 'comment'],
              [/"[^"]*"/, 'string'],
              [/16#[0-9A-Fa-f]+/, 'number'],
              [/2#[01]+/, 'number'],
              [/T#[0-9]+(ms|s|m|h|d)?/, 'number'],
              [/\b\d+(\.\d+)?([eE][+-]?\d+)?\b/, 'number'],
              [/#[A-Za-z_][A-Za-z0-9_]*/, 'variable'],
              [/[A-Z_][A-Z0-9_]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
              [/:=|=>|<>|<=|>=|[+\-*/<>=]/, 'operator'],
            ],
            comment: [
              [/\*\)/, 'comment', '@pop'],
              [/[^*]+/, 'comment'],
              [/\*/, 'comment'],
            ],
          },
        });
        model = monaco.editor.createModel(valueRef.current, 'scl');
        editor = monaco.editor.create(containerRef.current, {
          model,
          theme: theme === 'dark' ? 'vs-dark' : 'vs',
          minimap: { enabled: false },
          automaticLayout: true,
          fontSize: 13,
          tabSize: 2,
        });
        editorRef.current = editor;
        editor.onDidChangeModelContent(() => {
          onChangeRef.current(editor?.getValue() ?? '');
        });
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      editor?.dispose();
      model?.dispose();
      editorRef.current = null;
    };
    // Tạo editor đúng 1 lần (value/theme đổi xử lý ở effect dưới).
  }, []);

  // Đổi file: đặt lại nội dung (chỉ khi khác — tránh vòng echo onChange).
  useEffect(() => {
    const editor = editorRef.current;
    if (editor !== null && editor.getValue() !== value) {
      editor.setValue(value);
    }
  }, [value]);

  // Đổi theme.
  useEffect(() => {
    const editor = editorRef.current;
    if (editor !== null) {
      void import('monaco-editor').then((monaco) => {
        monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
      });
    }
  }, [theme]);

  if (failed) {
    return (
      <div className="border border-gray-300 p-4 dark:border-gray-700" role="alert">
        Không tải được editor (Monaco). Thử tải lại trang.
      </div>
    );
  }
  return <div ref={containerRef} className="min-h-[320px] flex-1 border border-gray-300 dark:border-gray-700" data-testid="plc-editor" />;
}

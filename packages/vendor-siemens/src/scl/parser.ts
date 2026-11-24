// Parser SCL — @vcs/vendor-siemens (M1 §4.2–4.4).
// `EmbeddedActionsParser` (OQ-101): action trả AST node ngay, không qua CST.
// Phục hồi lỗi mức statement: lỗi trong một statement ghi Diagnostic rồi
// parse tiếp statement sau — recovery của Chevrotain (resync tới token trong
// follow set, KHÔNG tiêu thụ nó) + đồng bộ thủ công `syncAfterFailedStmt`
// (bỏ qua token tới `;` và tiêu thụ `;`, để `;` không thành EmptyStmt);
// tối đa 100 diagnostics, vượt thì thêm SCL-P003 (OQ-095).
// `parseScl` luôn trả AST từng phần + diagnostics (OQ-099); P1.3 từ chối lower
// khi diagnostics chứa lỗi.
//
// Lưu ý Chevrotain (xác minh từ source 13.2.0):
// - Lúc ghi GAST (`performSelfAnalysis`), `LA()` trả EOF, `BACKTRACK` trả
//   `() => true`, `CONSUME` trả token giả (image '', vị trí -1), `SUBRULE`
//   trả object giả (không có `loc`), `ACTION` là no-op. Vì vậy mọi code
//   chạm `.loc`/`.image` để dựng AST phải nằm trong `this.ACTION(...)`,
//   và `addDiag` có cờ `parsing` để không ghi diagnostic lúc ghi GAST.
// - Vòng lặp/vùng tùy chọn dùng DSL `MANY`/`OPTION`/`MANY_SEP` (không dùng
//   `if`/`while` JS quanh DSL) để GAST đầy đủ → lookahead/recovery đúng.

import {
  EmbeddedActionsParser,
  EOF,
  type IRecognitionException,
  type IToken,
  type TokenType,
} from 'chevrotain';
import type { Diagnostic } from '@vcs/schemas';
import { diag, SCL_CATALOG, sortDiagnostics } from '@vcs/schemas';
import { parseAddress } from '../address.js';
import type {
  AssignStmt,
  CallExpr,
  CallStmt,
  CaseStmt,
  DbBlock,
  ExitStmt,
  ContinueStmt,
  ReturnStmt,
  EmptyStmt,
  FbBlock,
  FcBlock,
  ForStmt,
  IfStmt,
  LiteralExpr,
  ObBlock,
  RepeatStmt,
  SclAssign,
  SclBlock,
  SclCallArg,
  SclCaseLabel,
  SclExpr,
  SclFile,
  SclLiteral,
  SclLValue,
  SclPathElem,
  SclRef,
  SclStmt,
  SclType,
  SrcLoc,
  UdtBlock,
  VarDecl,
  VarSection,
  WhileStmt,
} from './ast.js';
import { locFrom } from './ast.js';
import { locOfToken, parseLiteralValue, SclTokens, tokenizeSclRaw } from './lexer.js';

/** Tối đa diagnostics trong một lần parse (OQ-095). */
export const MAX_SCL_DIAGNOSTICS = 100;

const {
  OrganizationBlock,
  EndOrganizationBlock,
  EndFunction,
  FunctionBlock,
  EndFunctionBlock,
  Type,
  EndType,
  DataBlock,
  EndDataBlock,
  Struct,
  EndStruct,
  Begin,
  VarInput,
  VarOutput,
  VarInOut,
  Var,
  VarTemp,
  VarConstant,
  EndVar,
  If,
  Then,
  Elsif,
  Else,
  EndIf,
  Case,
  Of,
  EndCase,
  For,
  To,
  By,
  Do,
  EndFor,
  While,
  EndWhile,
  Repeat,
  Until,
  EndRepeat,
  Exit,
  Continue,
  Return,
  And,
  Or,
  Xor,
  Not,
  Mod,
  Div,
  BoolLiteral,
  TimeLiteral,
  TypedLiteral,
  IntLiteral,
  RealLiteral,
  AbsAddress,
  LocalVar,
  GlobalVar,
  Identifier,
  ColonEquals,
  Power,
  NotEquals,
  LessEquals,
  GreaterEquals,
  DotDot,
  Arrow,
  Semicolon,
  Colon,
  Comma,
  Dot,
  LParen,
  RParen,
  LBracket,
  RBracket,
  Plus,
  Minus,
  Star,
  Slash,
  Equals,
  Less,
  Greater,
  Ampersand,
} = SclTokens;
const FunctionTok = SclTokens.Function;
const ArrayTok = SclTokens.Array;

const ELEMENTARY_TYPES: ReadonlySet<string> = new Set([
  'bool',
  'byte',
  'word',
  'dword',
  'sint',
  'usint',
  'uint',
  'udint',
  'int',
  'dint',
  'real',
  'lreal',
  'time',
]);

const BLOCK_STARTS: ReadonlySet<TokenType> = new Set([
  OrganizationBlock,
  FunctionTok,
  FunctionBlock,
  Type,
  DataBlock,
]);

/** Token có thể mở đầu một statement (để `syncAfterFailedStmt` dừng đúng chỗ). */
const STMT_STARTS: ReadonlySet<TokenType> = new Set([
  If,
  Case,
  For,
  While,
  Repeat,
  Exit,
  Continue,
  Return,
  LocalVar,
  GlobalVar,
  AbsAddress,
  Identifier,
]);

/** Token kết thúc một khối (để `syncAfterFailedStmt` dừng, không nuốt). */
const BLOCK_ENDS: ReadonlySet<TokenType> = new Set([
  EndOrganizationBlock,
  EndFunction,
  EndFunctionBlock,
  EndType,
  EndDataBlock,
  EndStruct,
  EndVar,
  EndIf,
  EndCase,
  EndFor,
  EndWhile,
  EndRepeat,
]);

function stripQuotes(image: string): string {
  return image.slice(1, -1);
}

function isInserted(t: IToken): boolean {
  return (
    (t as { isInsertedInRecovery?: boolean }).isInsertedInRecovery === true || t.startOffset < 0
  );
}

/** `loc` của phần tử cuối danh sách, hoặc `fallback` khi danh sách rỗng. */
function lastLocOf(items: readonly { loc: SrcLoc }[], fallback: SrcLoc): SrcLoc {
  const last = items[items.length - 1];
  return last !== undefined ? last.loc : fallback;
}

export interface ParseResult {
  ast: SclFile;
  diagnostics: Diagnostic[];
}

function toSclP002(e: IRecognitionException, fileName: string, eofLoc: SrcLoc): Diagnostic {
  const token = e.token;
  // Token EOF của Chevrotain có vị trí -1 → dùng cuối file (cuối token thật cuối).
  const loc =
    token.tokenType === EOF || (token.startLine ?? 0) < 1
      ? { file: fileName, ...eofLoc }
      : { file: fileName, ...locOfToken(token) };
  return diag('SCL-P002', 'error', e.message, loc, SCL_CATALOG.get('SCL-P002')?.hint);
}

function capDiagnostics(diags: Diagnostic[], fileName: string, ast: SclFile): Diagnostic[] {
  // Cắt ở 100 + SCL-P003 (OQ-095). Parse chạy hết rồi cắt (không dừng sớm
  // giữa chừng — dừng sớm làm block không đóng được và `file()` trả undefined).
  if (diags.length <= MAX_SCL_DIAGNOSTICS) return diags;
  const first = diags.slice(0, MAX_SCL_DIAGNOSTICS);
  first.push(
    diag(
      'SCL-P003',
      'error',
      'quá nhiều lỗi cú pháp (tối đa 100)',
      { file: fileName, line: ast.loc.endLine, col: ast.loc.endCol },
      SCL_CATALOG.get('SCL-P003')?.hint,
    ),
  );
  return first;
}

export class SclParser extends EmbeddedActionsParser {
  /** Diagnostics do rule ghi tay (SCL-P001/U001 + P002 mức file). */
  readonly sclDiagnostics: Diagnostic[] = [];
  /** true khi đang parse thật (false lúc ghi GAST trong constructor). */
  parsing = false;
  private suppressDiag = false;
  private readonly fileName: string;

  constructor(fileName: string) {
    super(Object.values(SclTokens), { recoveryEnabled: true });
    this.fileName = fileName;
    this.performSelfAnalysis();
  }

  private atCap(): boolean {
    return this.sclDiagnostics.length + this.errors.length >= MAX_SCL_DIAGNOSTICS;
  }

  private addDiag(code: string, loc: SrcLoc, message: string): void {
    if (!this.parsing || this.suppressDiag || this.atCap()) return;
    this.sclDiagnostics.push(
      diag(
        code,
        'error',
        message,
        {
          file: this.fileName,
          line: loc.line,
          col: loc.col,
          endLine: loc.endLine,
          endCol: loc.endCol,
        },
        SCL_CATALOG.get(code)?.hint,
      ),
    );
  }

  /** Vị trí của token; token chèn trong recovery (không có vị trí thật) thì
   * dùng vị trí token thật gần nhất trước đó; không có thì (1,1). */
  private tokLoc(t: IToken): SrcLoc {
    if (t.startOffset >= 0 && (t.startLine ?? 0) >= 1) return locOfToken(t);
    const prev = this.LA(0);
    if (prev.startOffset >= 0 && (prev.startLine ?? 0) >= 1) return locOfToken(prev);
    return { line: 1, col: 1, endLine: 1, endCol: 1, offset: 0, length: 0 };
  }

  private isBadToken(t: IToken, expected: TokenType): boolean {
    return t.tokenType !== expected || isInserted(t);
  }

  /** `;` cuối statement: có thì tiêu thụ, thiếu thì SCL-P001 tại token trước đó. */
  private expectSemi(): void {
    if (this.LA(1).tokenType === Semicolon) {
      this.CONSUME(Semicolon);
      return;
    }
    this.addDiag('SCL-P001', this.tokLoc(this.LA(0)), "expected ';'");
  }

  /** Gate BACKTRACK có chặn diagnostic (vd parseAddress trong lvalue thử). */
  private gate(fn: () => void): () => boolean {
    const backtrack = this.BACKTRACK(fn);
    return () => {
      this.suppressDiag = true;
      try {
        // BACKTRACK trả về `function` thường (không phải arrow) — phải gọi
        // bằng `.call(this)` nếu không `this` bên trong là undefined.
        return backtrack.call(this);
      } finally {
        this.suppressDiag = false;
      }
    };
  }

  /** Probe: phía trước có phải label CASE (`const [.. const] {, ...} :`) không. */
  private looksLikeCaseLabel(): boolean {
    return this.gate(() => {
      this.SUBRULE(this.caseLabels);
      this.CONSUME(Colon);
    })();
  }

  /** Dựng LiteralExpr từ token (chỉ gọi trong ACTION — lúc parse thật). */
  private makeLiteral(t: IToken, kind: 'int' | 'real' | 'bool' | 'time' | 'typed'): LiteralExpr {
    const loc = this.tokLoc(t);
    if (kind === 'typed') {
      const { value, type } = parseLiteralValue(t.image, 'typed');
      const litKind: SclLiteral['kind'] =
        type === 'Real' || type === 'LReal'
          ? 'real'
          : type === 'Bool'
            ? 'bool'
            : type === 'Time'
              ? 'time'
              : 'int';
      const literal: SclLiteral = { kind: litKind, value, raw: t.image, loc };
      if (type !== undefined) literal.type = type;
      return { kind: 'literal', literal, loc };
    }
    const { value } = parseLiteralValue(t.image, kind);
    return { kind: 'literal', literal: { kind, value, raw: t.image, loc }, loc };
  }

  // ---------------------------------------------------------------- file/block

  /** Rule gốc (public để `parseScl` gọi). */
  file = this.RULE('file', (): SclFile => {
    const blocks: SclBlock[] = [];
    const first = this.LA(1);
    this.MANY(() => {
      const b = this.SUBRULE(this.block);
      if (b !== undefined) blocks.push(b);
    });
    // Mã rác giữa/cuối các block: báo P002, bỏ qua 1 token, parse tiếp block sau.
    // (Không dừng sớm khi đủ 100 lỗi — dừng giữa block làm `file()` trả
    // undefined vì recovery không resync được; `capDiagnostics` cắt sau.)
    for (;;) {
      const t = this.LA(1);
      if (t.tokenType === EOF) break;
      if (BLOCK_STARTS.has(t.tokenType)) {
        const b = this.SUBRULE1(this.block);
        if (b !== undefined) blocks.push(b);
        continue;
      }
      this.addDiag('SCL-P002', this.tokLoc(t), `không phải đầu block: '${t.image}'`);
      this.SKIP_TOKEN();
    }
    return this.ACTION((): SclFile => {
      if (blocks.length === 0) {
        const loc = this.tokLoc(first);
        return { kind: 'file', blocks, loc };
      }
      const firstBlock = blocks[0];
      const lastBlock = blocks[blocks.length - 1];
      if (firstBlock === undefined || lastBlock === undefined) {
        const loc = this.tokLoc(first);
        return { kind: 'file', blocks, loc };
      }
      return { kind: 'file', blocks, loc: locFrom(firstBlock.loc, lastBlock.loc) };
    });
  });

  private block = this.RULE('block', (): SclBlock | undefined => {
    return this.OR([
      { ALT: () => this.SUBRULE(this.obBlock) },
      { ALT: () => this.SUBRULE(this.fcBlock) },
      { ALT: () => this.SUBRULE(this.fbBlock) },
      { ALT: () => this.SUBRULE(this.udtBlock) },
      { ALT: () => this.SUBRULE(this.dbBlock) },
    ]);
  });

  private blockName = this.RULE('blockName', (): { name: string; loc: SrcLoc } | undefined => {
    return this.OR([
      {
        ALT: () => {
          const t = this.CONSUME(Identifier);
          return this.ACTION((): { name: string; loc: SrcLoc } | undefined => {
            if (this.isBadToken(t, Identifier)) return undefined;
            return { name: t.image, loc: this.tokLoc(t) };
          });
        },
      },
      {
        ALT: () => {
          const t = this.CONSUME(GlobalVar);
          return this.ACTION((): { name: string; loc: SrcLoc } | undefined => {
            if (this.isBadToken(t, GlobalVar)) return undefined;
            return { name: stripQuotes(t.image), loc: this.tokLoc(t) };
          });
        },
      },
    ]);
  });

  private varSections = this.RULE('varSections', (): VarSection[] => {
    const out: VarSection[] = [];
    this.MANY(() => {
      const s = this.SUBRULE(this.varSection);
      if (s !== undefined) out.push(s);
    });
    return out;
  });

  private obBlock = this.RULE('obBlock', (): ObBlock | undefined => {
    const kw = this.CONSUME(OrganizationBlock);
    const name = this.SUBRULE(this.blockName);
    const varSections = this.SUBRULE(this.varSections);
    this.CONSUME(Begin);
    const body = this.SUBRULE(this.stmtList);
    const endTok = this.CONSUME(EndOrganizationBlock);
    return this.ACTION((): ObBlock | undefined => {
      if (name === undefined) return undefined;
      return {
        kind: 'OB',
        name: name.name,
        varSections,
        body,
        loc: locFrom(this.tokLoc(kw), this.tokLoc(endTok)),
      };
    });
  });

  private fcBlock = this.RULE('fcBlock', (): FcBlock | undefined => {
    const kw = this.CONSUME(FunctionTok);
    const name = this.SUBRULE(this.blockName);
    let returnType: SclType | undefined;
    this.OPTION(() => {
      this.CONSUME(Colon);
      returnType = this.SUBRULE(this.type);
    });
    const varSections = this.SUBRULE(this.varSections);
    this.CONSUME(Begin);
    const body = this.SUBRULE(this.stmtList);
    const endTok = this.CONSUME(EndFunction);
    return this.ACTION((): FcBlock | undefined => {
      if (name === undefined) return undefined;
      const block: FcBlock = {
        kind: 'FC',
        name: name.name,
        varSections,
        body,
        loc: locFrom(this.tokLoc(kw), this.tokLoc(endTok)),
      };
      if (returnType !== undefined) block.returnType = returnType;
      return block;
    });
  });

  private fbBlock = this.RULE('fbBlock', (): FbBlock | undefined => {
    const kw = this.CONSUME(FunctionBlock);
    const name = this.SUBRULE(this.blockName);
    const varSections = this.SUBRULE(this.varSections);
    this.CONSUME(Begin);
    const body = this.SUBRULE(this.stmtList);
    const endTok = this.CONSUME(EndFunctionBlock);
    return this.ACTION((): FbBlock | undefined => {
      if (name === undefined) return undefined;
      return {
        kind: 'FB',
        name: name.name,
        varSections,
        body,
        loc: locFrom(this.tokLoc(kw), this.tokLoc(endTok)),
      };
    });
  });

  private udtBlock = this.RULE('udtBlock', (): UdtBlock | undefined => {
    const kw = this.CONSUME(Type);
    const name = this.SUBRULE(this.blockName);
    this.CONSUME(Struct);
    const fields: VarDecl[] = [];
    this.MANY(() => {
      const d = this.SUBRULE(this.varDecl);
      if (d !== undefined) fields.push(d);
    });
    this.CONSUME(EndStruct);
    this.CONSUME(Semicolon);
    const endTypeTok = this.CONSUME(EndType);
    return this.ACTION((): UdtBlock | undefined => {
      if (name === undefined) return undefined;
      return {
        kind: 'UDT',
        name: name.name,
        fields,
        loc: locFrom(this.tokLoc(kw), this.tokLoc(endTypeTok)),
      };
    });
  });

  private dbBlock = this.RULE('dbBlock', (): DbBlock | undefined => {
    const kw = this.CONSUME(DataBlock);
    const name = this.SUBRULE(this.blockName);
    let fbName: string | undefined;
    let fields: VarDecl[] | undefined;
    this.OR([
      {
        ALT: () => {
          const t = this.CONSUME(GlobalVar);
          this.ACTION(() => {
            if (!this.isBadToken(t, GlobalVar)) fbName = stripQuotes(t.image);
          });
        },
      },
      {
        ALT: () => {
          this.CONSUME(Struct);
          const list: VarDecl[] = [];
          this.MANY(() => {
            const d = this.SUBRULE(this.varDecl);
            if (d !== undefined) list.push(d);
          });
          this.CONSUME(EndStruct);
          // Như UDT: `END_STRUCT;` có `;` (OQ-093).
          this.CONSUME(Semicolon);
          fields = list;
        },
      },
    ]);
    let init: SclAssign[] | undefined;
    this.OPTION(() => {
      this.CONSUME(Begin);
      const list: SclAssign[] = [];
      this.MANY1(() => {
        const item = this.SUBRULE(this.dbInit);
        if (item !== undefined) list.push(item);
      });
      init = list;
    });
    const endTok = this.CONSUME(EndDataBlock);
    return this.ACTION((): DbBlock | undefined => {
      if (name === undefined) return undefined;
      const block: DbBlock = {
        kind: 'DB',
        name: name.name,
        loc: locFrom(this.tokLoc(kw), this.tokLoc(endTok)),
      };
      if (fbName !== undefined) block.fbName = fbName;
      if (fields !== undefined) block.fields = fields;
      if (init !== undefined) block.init = init;
      return block;
    });
  });

  private dbInit = this.RULE('dbInit', (): SclAssign | undefined => {
    const target = this.SUBRULE(this.lvalue);
    this.CONSUME(ColonEquals);
    const value = this.SUBRULE(this.expr);
    this.expectSemi();
    return this.ACTION((): SclAssign | undefined => {
      if (target === undefined || value === undefined) return undefined;
      return { kind: 'assign', target, value, loc: locFrom(target.loc, value.loc) };
    });
  });

  // ---------------------------------------------------------------- var/type

  private varSection = this.RULE('varSection', (): VarSection | undefined => {
    const kind = this.OR([
      {
        ALT: () => {
          const t = this.CONSUME(VarInput);
          return { kind: 'VAR_INPUT' as const, tok: t };
        },
      },
      {
        ALT: () => {
          const t = this.CONSUME(VarOutput);
          return { kind: 'VAR_OUTPUT' as const, tok: t };
        },
      },
      {
        ALT: () => {
          const t = this.CONSUME(VarInOut);
          return { kind: 'VAR_IN_OUT' as const, tok: t };
        },
      },
      {
        ALT: () => {
          const t = this.CONSUME(Var);
          return { kind: 'VAR' as const, tok: t };
        },
      },
      {
        ALT: () => {
          const t = this.CONSUME(VarTemp);
          return { kind: 'VAR_TEMP' as const, tok: t };
        },
      },
      {
        ALT: () => {
          const t = this.CONSUME(VarConstant);
          return { kind: 'VAR_CONSTANT' as const, tok: t };
        },
      },
    ]);
    const decls: VarDecl[] = [];
    this.MANY(() => {
      const d = this.SUBRULE(this.varDecl);
      if (d !== undefined) decls.push(d);
    });
    const endTok = this.CONSUME(EndVar);
    return this.ACTION((): VarSection => {
      return { kind: kind.kind, decls, loc: locFrom(this.tokLoc(kind.tok), this.tokLoc(endTok)) };
    });
  });

  private varDecl = this.RULE('varDecl', (): VarDecl | undefined => {
    const nameTok = this.CONSUME(Identifier);
    this.CONSUME(Colon);
    const type = this.SUBRULE(this.type);
    let init: SclExpr | undefined;
    this.OPTION(() => {
      this.CONSUME(ColonEquals);
      init = this.SUBRULE(this.expr);
    });
    this.expectSemi();
    return this.ACTION((): VarDecl | undefined => {
      if (this.isBadToken(nameTok, Identifier) || type === undefined) return undefined;
      const endLoc = init !== undefined ? init.loc : type.loc;
      const decl: VarDecl = {
        name: nameTok.image,
        type,
        loc: locFrom(this.tokLoc(nameTok), endLoc),
      };
      if (init !== undefined) decl.init = init;
      return decl;
    });
  });

  private type = this.RULE('type', (): SclType | undefined => {
    return this.OR([
      {
        ALT: () => {
          const kw = this.CONSUME(ArrayTok);
          this.CONSUME(LBracket);
          let loNeg = false;
          this.OPTION(() => {
            this.CONSUME(Minus);
            loNeg = true;
          });
          const loTok = this.CONSUME(IntLiteral);
          this.CONSUME(DotDot);
          let hiNeg = false;
          this.OPTION1(() => {
            this.CONSUME1(Minus);
            hiNeg = true;
          });
          const hiTok = this.CONSUME1(IntLiteral);
          this.CONSUME(RBracket);
          this.CONSUME(Of);
          const elem = this.SUBRULE(this.type);
          return this.ACTION((): SclType | undefined => {
            if (elem === undefined) return undefined;
            if (this.isBadToken(loTok, IntLiteral) || this.isBadToken(hiTok, IntLiteral)) {
              return undefined;
            }
            const lo = parseLiteralValue(loTok.image, 'int').value as number;
            const hi = parseLiteralValue(hiTok.image, 'int').value as number;
            return {
              kind: 'array',
              lo: loNeg ? -lo : lo,
              hi: hiNeg ? -hi : hi,
              elem,
              loc: locFrom(this.tokLoc(kw), elem.loc),
            };
          });
        },
      },
      {
        ALT: () => {
          const kw = this.CONSUME(Struct);
          const fields: VarDecl[] = [];
          this.MANY(() => {
            const d = this.SUBRULE(this.varDecl);
            if (d !== undefined) fields.push(d);
          });
          const endTok = this.CONSUME(EndStruct);
          return this.ACTION((): SclType => {
            return { kind: 'struct', fields, loc: locFrom(this.tokLoc(kw), this.tokLoc(endTok)) };
          });
        },
      },
      {
        ALT: () => {
          const t = this.CONSUME(Identifier);
          return this.ACTION((): SclType | undefined => {
            if (this.isBadToken(t, Identifier)) return undefined;
            const lower = t.image.toLowerCase();
            const loc = this.tokLoc(t);
            if (ELEMENTARY_TYPES.has(lower)) {
              return { kind: 'elementary', name: t.image, loc };
            }
            if (lower === 'string' || lower === 'wstring') {
              this.addDiag('SCL-U001', loc, `kiểu '${t.image}' chưa hỗ trợ`);
              return { kind: 'named', name: t.image, loc };
            }
            return { kind: 'named', name: t.image, loc };
          });
        },
      },
      {
        ALT: () => {
          // Kiểu named dạng `"UDT_Motor"` (tên có dấu ngoặc kép, như block name).
          const t = this.CONSUME(GlobalVar);
          return this.ACTION((): SclType | undefined => {
            if (this.isBadToken(t, GlobalVar)) return undefined;
            return { kind: 'named', name: stripQuotes(t.image), loc: this.tokLoc(t) };
          });
        },
      },
    ]);
  });

  // ---------------------------------------------------------------- stmt

  private stmtList = this.RULE('stmtList', (stopProbe?: () => boolean): SclStmt[] => {
    const out: SclStmt[] = [];
    this.MANY(() => {
      if (stopProbe !== undefined && stopProbe()) return;
      const s = this.SUBRULE(this.stmt);
      if (s !== undefined) {
        out.push(s);
      } else {
        // Statement lỗi: Chevrotain resync tới `;`/đầu statement nhưng không
        // tiêu thụ — đồng bộ thủ công để `;` không thành EmptyStmt ở lần sau.
        this.syncAfterFailedStmt();
      }
    });
    return out;
  });

  /**
   * Đồng bộ thủ công sau một statement lỗi: bỏ qua token tới `;` (tiêu thụ
   * luôn `;`) hoặc tới đầu statement / cuối block / EOF rồi dừng. Dùng
   * `SKIP_TOKEN` (không cần GAST) vì đây là đường phục hồi, không phải
   * grammar thường. Trong lúc ghi GAST, `LA(1)` là EOF nên trả ngay.
   */
  private syncAfterFailedStmt(): void {
    for (;;) {
      const t = this.LA(1);
      if (t.tokenType === EOF) return;
      if (t.tokenType === Semicolon) {
        this.SKIP_TOKEN();
        return;
      }
      if (STMT_STARTS.has(t.tokenType) || BLOCK_ENDS.has(t.tokenType)) return;
      this.SKIP_TOKEN();
    }
  }

  private stmt = this.RULE('stmt', (): SclStmt | undefined => {
    return this.OR([
      { ALT: () => this.SUBRULE(this.ifStmt) },
      { ALT: () => this.SUBRULE(this.caseStmt) },
      { ALT: () => this.SUBRULE(this.forStmt) },
      { ALT: () => this.SUBRULE(this.whileStmt) },
      { ALT: () => this.SUBRULE(this.repeatStmt) },
      { ALT: () => this.SUBRULE(this.exitStmt) },
      { ALT: () => this.SUBRULE(this.continueStmt) },
      { ALT: () => this.SUBRULE(this.returnStmt) },
      {
        GATE: this.gate(() => {
          this.SUBRULE(this.lvalue);
          this.CONSUME(ColonEquals);
        }),
        ALT: () => this.SUBRULE(this.assignStmt),
      },
      { ALT: () => this.SUBRULE(this.callStmt) },
      {
        ALT: () => {
          const semi = this.CONSUME(Semicolon);
          return this.ACTION((): EmptyStmt => ({ kind: 'empty', loc: this.tokLoc(semi) }));
        },
      },
    ]);
  });

  private assignStmt = this.RULE('assignStmt', (): AssignStmt | undefined => {
    const target = this.SUBRULE(this.lvalue);
    this.CONSUME(ColonEquals);
    const value = this.SUBRULE(this.expr);
    this.expectSemi();
    return this.ACTION((): AssignStmt | undefined => {
      if (target === undefined || value === undefined) return undefined;
      return { kind: 'assign', target, value, loc: locFrom(target.loc, value.loc) };
    });
  });

  private ifStmt = this.RULE('ifStmt', (): IfStmt | undefined => {
    const kw = this.CONSUME(If);
    const cond = this.SUBRULE(this.expr);
    this.CONSUME(Then);
    const then = this.SUBRULE(this.stmtList);
    const elsif: { cond: SclExpr; body: SclStmt[]; loc: SrcLoc }[] = [];
    this.MANY(() => {
      const eTok = this.CONSUME(Elsif);
      const eCond = this.SUBRULE1(this.expr);
      this.CONSUME1(Then);
      const eBody = this.SUBRULE1(this.stmtList);
      this.ACTION(() => {
        if (eCond === undefined) return;
        elsif.push({
          cond: eCond,
          body: eBody,
          loc: locFrom(this.tokLoc(eTok), lastLocOf(eBody, this.tokLoc(eTok))),
        });
      });
    });
    let elseBody: SclStmt[] | undefined;
    this.OPTION(() => {
      this.CONSUME(Else);
      elseBody = this.SUBRULE2(this.stmtList);
    });
    const endTok = this.CONSUME(EndIf);
    this.expectSemi();
    return this.ACTION((): IfStmt | undefined => {
      if (cond === undefined) return undefined;
      const node: IfStmt = {
        kind: 'if',
        cond,
        then,
        elsif,
        loc: locFrom(this.tokLoc(kw), this.tokLoc(endTok)),
      };
      if (elseBody !== undefined) node.else = elseBody;
      return node;
    });
  });

  private caseStmt = this.RULE('caseStmt', (): CaseStmt | undefined => {
    const kw = this.CONSUME(Case);
    const sel = this.SUBRULE(this.expr);
    this.CONSUME(Of);
    const probe = (): boolean => this.looksLikeCaseLabel();
    const arms: { labels: SclCaseLabel[]; body: SclStmt[]; loc: SrcLoc }[] = [];
    this.MANY(() => {
      const labels = this.SUBRULE(this.caseLabels);
      const colonTok = this.CONSUME(Colon);
      const body = this.SUBRULE(this.stmtList, { ARGS: [probe] });
      this.ACTION(() => {
        if (labels === undefined) return;
        const firstLabel = labels[0];
        if (firstLabel === undefined) return;
        arms.push({
          labels,
          body,
          loc: locFrom(firstLabel.loc, lastLocOf(body, this.tokLoc(colonTok))),
        });
      });
    });
    let elseBody: SclStmt[] | undefined;
    this.OPTION(() => {
      this.CONSUME(Else);
      elseBody = this.SUBRULE1(this.stmtList);
    });
    const endTok = this.CONSUME(EndCase);
    this.expectSemi();
    return this.ACTION((): CaseStmt | undefined => {
      if (sel === undefined) return undefined;
      const node: CaseStmt = {
        kind: 'case',
        sel,
        arms,
        loc: locFrom(this.tokLoc(kw), this.tokLoc(endTok)),
      };
      if (elseBody !== undefined) node.else = elseBody;
      return node;
    });
  });

  private caseLabels = this.RULE('caseLabels', (): SclCaseLabel[] | undefined => {
    const out: SclCaseLabel[] = [];
    this.MANY_SEP({
      SEP: Comma,
      DEF: () => {
        const l = this.SUBRULE(this.caseLabel);
        if (l !== undefined) out.push(l);
      },
    });
    return this.ACTION((): SclCaseLabel[] | undefined => (out.length > 0 ? out : undefined));
  });

  private caseLabel = this.RULE('caseLabel', (): SclCaseLabel | undefined => {
    const lo = this.SUBRULE(this.expr);
    let hi: SclExpr | undefined;
    this.OPTION(() => {
      this.CONSUME(DotDot);
      hi = this.SUBRULE1(this.expr);
    });
    return this.ACTION((): SclCaseLabel | undefined => {
      if (lo === undefined) return undefined;
      if (hi === undefined) return lo;
      return { kind: 'range', lo, hi, loc: locFrom(lo.loc, hi.loc) };
    });
  });

  private forStmt = this.RULE('forStmt', (): ForStmt | undefined => {
    const kw = this.CONSUME(For);
    const loopVar = this.SUBRULE(this.lvalue);
    this.CONSUME(ColonEquals);
    const from = this.SUBRULE(this.expr);
    this.CONSUME(To);
    const to = this.SUBRULE1(this.expr);
    let by: SclExpr | undefined;
    this.OPTION(() => {
      this.CONSUME(By);
      by = this.SUBRULE2(this.expr);
    });
    this.CONSUME(Do);
    const body = this.SUBRULE(this.stmtList);
    const endTok = this.CONSUME(EndFor);
    this.expectSemi();
    return this.ACTION((): ForStmt | undefined => {
      if (loopVar === undefined || from === undefined || to === undefined) return undefined;
      const node: ForStmt = {
        kind: 'for',
        var: loopVar,
        from,
        to,
        body,
        loc: locFrom(this.tokLoc(kw), this.tokLoc(endTok)),
      };
      if (by !== undefined) node.by = by;
      return node;
    });
  });

  private whileStmt = this.RULE('whileStmt', (): WhileStmt | undefined => {
    const kw = this.CONSUME(While);
    const cond = this.SUBRULE(this.expr);
    this.CONSUME(Do);
    const body = this.SUBRULE(this.stmtList);
    const endTok = this.CONSUME(EndWhile);
    this.expectSemi();
    return this.ACTION((): WhileStmt | undefined => {
      if (cond === undefined) return undefined;
      return {
        kind: 'while',
        cond,
        body,
        loc: locFrom(this.tokLoc(kw), this.tokLoc(endTok)),
      };
    });
  });

  private repeatStmt = this.RULE('repeatStmt', (): RepeatStmt | undefined => {
    const kw = this.CONSUME(Repeat);
    const body = this.SUBRULE(this.stmtList);
    this.CONSUME(Until);
    const until = this.SUBRULE(this.expr);
    const endTok = this.CONSUME(EndRepeat);
    this.expectSemi();
    return this.ACTION((): RepeatStmt | undefined => {
      if (until === undefined) return undefined;
      return {
        kind: 'repeat',
        body,
        until,
        loc: locFrom(this.tokLoc(kw), this.tokLoc(endTok)),
      };
    });
  });

  private exitStmt = this.RULE('exitStmt', (): ExitStmt | undefined => {
    const kw = this.CONSUME(Exit);
    this.expectSemi();
    return this.ACTION((): ExitStmt => ({ kind: 'exit', loc: this.tokLoc(kw) }));
  });

  private continueStmt = this.RULE('continueStmt', (): ContinueStmt | undefined => {
    const kw = this.CONSUME(Continue);
    this.expectSemi();
    return this.ACTION((): ContinueStmt => ({ kind: 'continue', loc: this.tokLoc(kw) }));
  });

  private returnStmt = this.RULE('returnStmt', (): ReturnStmt | undefined => {
    const kw = this.CONSUME(Return);
    this.expectSemi();
    return this.ACTION((): ReturnStmt => ({ kind: 'return', loc: this.tokLoc(kw) }));
  });

  private callStmt = this.RULE('callStmt', (): CallStmt | undefined => {
    const callee = this.OR([
      { ALT: () => this.SUBRULE(this.ref) },
      {
        ALT: () => {
          const t = this.CONSUME(Identifier);
          return this.ACTION((): { kind: 'ident'; name: string; loc: SrcLoc } => ({
            kind: 'ident',
            name: t.image,
            loc: this.tokLoc(t),
          }));
        },
      },
    ]);
    this.CONSUME(LParen);
    let args: SclCallArg[] = [];
    this.OPTION(() => {
      args = this.SUBRULE(this.argsList);
    });
    const rparenTok = this.CONSUME(RParen);
    this.expectSemi();
    return this.ACTION((): CallStmt | undefined => {
      if (callee === undefined) return undefined;
      return {
        kind: 'call',
        callee,
        args,
        loc: locFrom(callee.loc, this.tokLoc(rparenTok)),
      };
    });
  });

  private argsList = this.RULE('argsList', (): SclCallArg[] => {
    const out: SclCallArg[] = [];
    this.MANY_SEP({
      SEP: Comma,
      DEF: () => {
        const a = this.SUBRULE(this.arg);
        if (a !== undefined) out.push(a);
      },
    });
    return out;
  });

  private arg = this.RULE('arg', (): SclCallArg | undefined => {
    return this.OR([
      {
        GATE: this.gate(() => {
          this.CONSUME(Identifier);
          this.CONSUME(ColonEquals);
        }),
        ALT: () => {
          const nameTok = this.CONSUME(Identifier);
          this.CONSUME(ColonEquals);
          const value = this.SUBRULE(this.expr);
          return this.ACTION((): SclCallArg | undefined => {
            if (value === undefined || this.isBadToken(nameTok, Identifier)) return undefined;
            return {
              kind: 'named',
              name: nameTok.image,
              value,
              loc: locFrom(this.tokLoc(nameTok), value.loc),
            };
          });
        },
      },
      {
        GATE: this.gate(() => {
          this.CONSUME(Identifier);
          this.CONSUME(Arrow);
        }),
        ALT: () => {
          const nameTok = this.CONSUME1(Identifier);
          this.CONSUME(Arrow);
          const target = this.SUBRULE(this.lvalue);
          return this.ACTION((): SclCallArg | undefined => {
            if (target === undefined || this.isBadToken(nameTok, Identifier)) return undefined;
            return {
              kind: 'namedOut',
              name: nameTok.image,
              target,
              loc: locFrom(this.tokLoc(nameTok), target.loc),
            };
          });
        },
      },
      {
        ALT: () => {
          const value = this.SUBRULE1(this.expr);
          return this.ACTION((): SclCallArg | undefined => {
            if (value === undefined) return undefined;
            return { kind: 'positional', value, loc: value.loc };
          });
        },
      },
    ]);
  });

  // ---------------------------------------------------------------- expr

  private expr = this.RULE('expr', (): SclExpr | undefined => {
    return this.SUBRULE(this.orExpr);
  });

  private orExpr = this.RULE('orExpr', (): SclExpr | undefined => {
    let left = this.SUBRULE(this.xorExpr);
    this.MANY(() => {
      this.CONSUME(Or);
      const right = this.SUBRULE1(this.xorExpr);
      left = this.ACTION((): SclExpr | undefined => {
        if (left === undefined || right === undefined) return undefined;
        return { kind: 'binary', op: 'OR', left, right, loc: locFrom(left.loc, right.loc) };
      });
    });
    return left;
  });

  private xorExpr = this.RULE('xorExpr', (): SclExpr | undefined => {
    let left = this.SUBRULE(this.andExpr);
    this.MANY(() => {
      this.CONSUME(Xor);
      const right = this.SUBRULE1(this.andExpr);
      left = this.ACTION((): SclExpr | undefined => {
        if (left === undefined || right === undefined) return undefined;
        return { kind: 'binary', op: 'XOR', left, right, loc: locFrom(left.loc, right.loc) };
      });
    });
    return left;
  });

  private andExpr = this.RULE('andExpr', (): SclExpr | undefined => {
    let left = this.SUBRULE(this.eqExpr);
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            this.CONSUME(And);
            return 'AND';
          },
        },
        {
          ALT: () => {
            this.CONSUME(Ampersand);
            return 'AND';
          },
        },
      ]);
      const right = this.SUBRULE1(this.eqExpr);
      left = this.ACTION((): SclExpr | undefined => {
        if (left === undefined || right === undefined) return undefined;
        return { kind: 'binary', op: 'AND', left, right, loc: locFrom(left.loc, right.loc) };
      });
    });
    return left;
  });

  private eqExpr = this.RULE('eqExpr', (): SclExpr | undefined => {
    let left = this.SUBRULE(this.relExpr);
    this.MANY(() => {
      const op = this.OR([
        {
          ALT: () => {
            this.CONSUME(Equals);
            return '=';
          },
        },
        {
          ALT: () => {
            this.CONSUME(NotEquals);
            return '<>';
          },
        },
      ]);
      const right = this.SUBRULE1(this.relExpr);
      left = this.ACTION((): SclExpr | undefined => {
        if (left === undefined || right === undefined) return undefined;
        return { kind: 'binary', op, left, right, loc: locFrom(left.loc, right.loc) };
      });
    });
    return left;
  });

  private relExpr = this.RULE('relExpr', (): SclExpr | undefined => {
    let left = this.SUBRULE(this.addExpr);
    this.MANY(() => {
      const op = this.OR([
        {
          ALT: () => {
            this.CONSUME(Less);
            return '<';
          },
        },
        {
          ALT: () => {
            this.CONSUME(LessEquals);
            return '<=';
          },
        },
        {
          ALT: () => {
            this.CONSUME(Greater);
            return '>';
          },
        },
        {
          ALT: () => {
            this.CONSUME(GreaterEquals);
            return '>=';
          },
        },
      ]);
      const right = this.SUBRULE1(this.addExpr);
      left = this.ACTION((): SclExpr | undefined => {
        if (left === undefined || right === undefined) return undefined;
        return { kind: 'binary', op, left, right, loc: locFrom(left.loc, right.loc) };
      });
    });
    return left;
  });

  private addExpr = this.RULE('addExpr', (): SclExpr | undefined => {
    let left = this.SUBRULE(this.mulExpr);
    this.MANY(() => {
      const op = this.OR([
        {
          ALT: () => {
            this.CONSUME(Plus);
            return '+';
          },
        },
        {
          ALT: () => {
            this.CONSUME(Minus);
            return '-';
          },
        },
      ]);
      const right = this.SUBRULE1(this.mulExpr);
      left = this.ACTION((): SclExpr | undefined => {
        if (left === undefined || right === undefined) return undefined;
        return { kind: 'binary', op, left, right, loc: locFrom(left.loc, right.loc) };
      });
    });
    return left;
  });

  private mulExpr = this.RULE('mulExpr', (): SclExpr | undefined => {
    let left = this.SUBRULE(this.unary);
    this.MANY(() => {
      const op = this.OR([
        {
          ALT: () => {
            this.CONSUME(Star);
            return '*';
          },
        },
        {
          ALT: () => {
            this.CONSUME(Slash);
            return '/';
          },
        },
        {
          ALT: () => {
            this.CONSUME(Mod);
            return 'MOD';
          },
        },
        {
          ALT: () => {
            this.CONSUME(Div);
            return 'DIV';
          },
        },
      ]);
      const right = this.SUBRULE1(this.unary);
      left = this.ACTION((): SclExpr | undefined => {
        if (left === undefined || right === undefined) return undefined;
        return { kind: 'binary', op, left, right, loc: locFrom(left.loc, right.loc) };
      });
    });
    return left;
  });

  private unary = this.RULE('unary', (): SclExpr | undefined => {
    const ops: { op: '+' | '-' | 'NOT'; loc: SrcLoc }[] = [];
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            const t = this.CONSUME(Plus);
            this.ACTION(() => {
              ops.push({ op: '+', loc: this.tokLoc(t) });
            });
          },
        },
        {
          ALT: () => {
            const t = this.CONSUME(Minus);
            this.ACTION(() => {
              ops.push({ op: '-', loc: this.tokLoc(t) });
            });
          },
        },
        {
          ALT: () => {
            const t = this.CONSUME(Not);
            this.ACTION(() => {
              ops.push({ op: 'NOT', loc: this.tokLoc(t) });
            });
          },
        },
      ]);
    });
    const base = this.SUBRULE(this.power);
    return this.ACTION((): SclExpr | undefined => {
      if (base === undefined) return undefined;
      let node: SclExpr = base;
      for (let i = ops.length - 1; i >= 0; i--) {
        const o = ops[i];
        if (o === undefined) continue;
        node = { kind: 'unary', op: o.op, operand: node, loc: locFrom(o.loc, node.loc) };
      }
      return node;
    });
  });

  private power = this.RULE('power', (): SclExpr | undefined => {
    const base = this.SUBRULE(this.primary);
    let exp: SclExpr | undefined;
    this.OPTION(() => {
      this.CONSUME(Power);
      exp = this.SUBRULE(this.unary);
    });
    return this.ACTION((): SclExpr | undefined => {
      if (base === undefined) return undefined;
      if (exp === undefined) return base;
      return { kind: 'binary', op: '**', left: base, right: exp, loc: locFrom(base.loc, exp.loc) };
    });
  });

  private primary = this.RULE('primary', (): SclExpr | undefined => {
    return this.OR([
      { ALT: () => this.SUBRULE(this.literalExpr) },
      {
        // Call trong biểu thức: callee là ident hoặc "FB" (OQ-100) + '('.
        // GATE thuần lookahead (LA(1)/LA(2), không consume) phân biệt với ref:
        // "FB" đơn lẻ → lvalue; "FB"( → call. `#fb(` KHÔNG phải call (OQ-100)
        // → rơi về lvalue rồi '(' gây SCL-P001 (ghi ở semantics §13).
        // `ignoreAmbiguities`: GATE đã phân giải, check tĩnh không thấy được.
        GATE: () => {
          const t1 = this.LA(1);
          const t2 = this.LA(2);
          return (
            (t1.tokenType === Identifier || t1.tokenType === GlobalVar) &&
            t2.tokenType === LParen
          );
        },
        ignoreAmbiguities: true,
        ALT: () => this.SUBRULE(this.funcCallExpr),
      },
      {
        ALT: () => {
          const lv = this.SUBRULE(this.lvalue);
          return this.ACTION((): SclExpr | undefined => {
            if (lv === undefined) return undefined;
            return { kind: 'ref', ref: lv, loc: lv.loc };
          });
        },
      },
      {
        ALT: () => {
          this.CONSUME(LParen);
          const e = this.SUBRULE(this.expr);
          this.CONSUME(RParen);
          return e;
        },
      },
    ]);
  });

  private literalExpr = this.RULE('literalExpr', (): LiteralExpr | undefined => {
    return this.OR([
      {
        ALT: () => {
          const t = this.CONSUME(IntLiteral);
          return this.ACTION(() => this.makeLiteral(t, 'int'));
        },
      },
      {
        ALT: () => {
          const t = this.CONSUME(RealLiteral);
          return this.ACTION(() => this.makeLiteral(t, 'real'));
        },
      },
      {
        ALT: () => {
          const t = this.CONSUME(BoolLiteral);
          return this.ACTION(() => this.makeLiteral(t, 'bool'));
        },
      },
      {
        ALT: () => {
          const t = this.CONSUME(TimeLiteral);
          return this.ACTION(() => this.makeLiteral(t, 'time'));
        },
      },
      {
        ALT: () => {
          const t = this.CONSUME(TypedLiteral);
          return this.ACTION(() => this.makeLiteral(t, 'typed'));
        },
      },
    ]);
  });

  private lvalue = this.RULE('lvalue', (): SclLValue | undefined => {
    const base = this.SUBRULE(this.ref);
    const path: SclPathElem[] = [];
    let failed = false;
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            this.CONSUME(Dot);
            const nameTok = this.CONSUME(Identifier);
            this.ACTION(() => {
              if (this.isBadToken(nameTok, Identifier)) {
                failed = true;
                return;
              }
              path.push({ kind: 'member', name: nameTok.image, loc: this.tokLoc(nameTok) });
            });
          },
        },
        {
          ALT: () => {
            this.CONSUME(LBracket);
            this.MANY_SEP({
              SEP: Comma,
              DEF: () => {
                const idx = this.SUBRULE(this.expr);
                this.ACTION(() => {
                  if (idx === undefined) {
                    failed = true;
                    return;
                  }
                  path.push({ kind: 'index', index: idx, loc: idx.loc });
                });
              },
            });
            const rbTok = this.CONSUME(RBracket);
            this.ACTION(() => {
              if (this.isBadToken(rbTok, RBracket)) failed = true;
            });
          },
        },
      ]);
    });
    return this.ACTION((): SclLValue | undefined => {
      if (base === undefined || failed) return undefined;
      return { base, path, loc: locFrom(base.loc, lastLocOf(path, base.loc)) };
    });
  });

  private ref = this.RULE('ref', (): SclRef | undefined => {
    return this.OR([
      {
        ALT: () => {
          const t = this.CONSUME(LocalVar);
          return this.ACTION((): SclRef | undefined => {
            if (this.isBadToken(t, LocalVar)) return undefined;
            return { kind: 'local', name: t.image.slice(1), loc: this.tokLoc(t) };
          });
        },
      },
      {
        ALT: () => {
          const t = this.CONSUME(GlobalVar);
          return this.ACTION((): SclRef | undefined => {
            if (this.isBadToken(t, GlobalVar)) return undefined;
            return { kind: 'global', name: stripQuotes(t.image), loc: this.tokLoc(t) };
          });
        },
      },
      {
        ALT: () => {
          const t = this.CONSUME(AbsAddress);
          return this.ACTION((): SclRef | undefined => {
            if (this.isBadToken(t, AbsAddress)) return undefined;
            try {
              const address = parseAddress(t.image);
              return { kind: 'abs', address, raw: t.image, loc: this.tokLoc(t) };
            } catch (e) {
              const message = e instanceof Error ? e.message : `địa chỉ không hợp lệ: '${t.image}'`;
              this.addDiag('SCL-P002', this.tokLoc(t), message);
              return undefined;
            }
          });
        },
      },
    ]);
  });

  private funcCallExpr = this.RULE('funcCallExpr', (): CallExpr | undefined => {
    // Callee trong biểu thức: ident (foo) hoặc "FB" (OQ-100). #fb KHÔNG phải
    // call trong biểu thức (là statement call) — xem GATE ở `primary`.
    const callee = this.OR([
      {
        ALT: () => {
          const t = this.CONSUME(Identifier);
          return this.ACTION((): { kind: 'ident'; name: string; loc: SrcLoc } | undefined => {
            if (this.isBadToken(t, Identifier)) return undefined;
            return { kind: 'ident', name: t.image, loc: this.tokLoc(t) };
          });
        },
      },
      {
        ALT: () => {
          const t = this.CONSUME(GlobalVar);
          return this.ACTION((): SclRef | undefined => {
            if (this.isBadToken(t, GlobalVar)) return undefined;
            return { kind: 'global', name: stripQuotes(t.image), loc: this.tokLoc(t) };
          });
        },
      },
    ]);
    this.CONSUME(LParen);
    let args: SclCallArg[] = [];
    this.OPTION(() => {
      args = this.SUBRULE(this.argsList);
    });
    const rparenTok = this.CONSUME(RParen);
    return this.ACTION((): CallExpr | undefined => {
      if (callee === undefined) return undefined;
      return {
        kind: 'call',
        callee,
        args,
        loc: locFrom(callee.loc, this.tokLoc(rparenTok)),
      };
    });
  });
}

/**
 * Parse một file SCL: trả AST từng phần + diagnostics (OQ-099).
 * Diagnostics sắp xếp theo (file, line, col, code); tối đa 100 lỗi + SCL-P003.
 */
export function parseScl(source: string, fileName: string): ParseResult {
  const { tokens, diagnostics: lexDiags } = tokenizeSclRaw(source, fileName);
  const parser = new SclParser(fileName);
  parser.input = tokens;
  parser.parsing = true;
  const ast = parser.file();
  parser.parsing = false;
  // Vị trí EOF = ngay sau token thật cuối (dùng cho lỗi tại EOF, vd thiếu END_IF).
  const lastTok = tokens[tokens.length - 1];
  const eofLoc: SrcLoc =
    lastTok === undefined
      ? { line: 1, col: 1, endLine: 1, endCol: 1, offset: 0, length: 0 }
      : (() => {
          const l = locOfToken(lastTok);
          return {
            line: l.endLine,
            col: l.endCol,
            endLine: l.endLine,
            endCol: l.endCol,
            offset: l.offset + l.length,
            length: 0,
          };
        })();
  const chevDiags = parser.errors.map((e) => toSclP002(e, fileName, eofLoc));
  const all = sortDiagnostics([...lexDiags, ...parser.sclDiagnostics, ...chevDiags]);
  return { ast, diagnostics: capDiagnostics(all, fileName, ast) };
}

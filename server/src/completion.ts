import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position,
  Range,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { SymbolTable, SymbolType } from "./symbolTable";

export class CompletionProvider {
  private symbolTable: SymbolTable;

  constructor(symbolTable: SymbolTable) {
    this.symbolTable = symbolTable;
  }

  public getCompletions(
    document: TextDocument,
    position: Position
  ): CompletionItem[] {
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: position,
    });

    const context = this.getContext(document, position);
    const completions: CompletionItem[] = [];

    // Add completions based on context
    if (context.inDeclarations) {
      completions.push(...this.getDirectiveCompletions());
    }

    if (context.inRules) {
      completions.push(...this.getSymbolCompletions());
      completions.push(...this.getParameterizedRuleCompletions());
      completions.push(...this.getBuiltinFunctionCompletions());

      // If after %prec
      if (line.match(/%prec\s+\S*$/)) {
        completions.push(...this.getPrecedenceTokenCompletions());
      }
    }

    // If typing a directive
    if (line.match(/%[a-z\-]*$/)) {
      completions.push(...this.getDirectiveCompletions());
    }

    // If typing after %rule
    if (line.match(/%rule\s+$/)) {
      completions.push(...this.getInlineCompletion());
    }

    return completions;
  }

  private getContext(document: TextDocument, position: Position): any {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const beforeText = text.substring(0, offset);

    // Count %% separators before current position
    const separators = (beforeText.match(/%%/g) || []).length;

    return {
      inDeclarations: separators === 0,
      inRules: separators === 1,
      inEpilogue: separators === 2,
    };
  }

  private getDirectiveCompletions(): CompletionItem[] {
    const directives = [
      {
        label: "%token",
        detail: "Declare tokens",
        snippet: "%token ${1:TOKEN}",
      },
      {
        label: "%type",
        detail: "Declare type for nonterminals",
        snippet: "%type <${1:type}> ${2:nonterminal}",
      },
      {
        label: "%nterm",
        detail: "Declare nonterminals",
        snippet: "%nterm <${1:type}> ${2:nonterminal}",
      },
      {
        label: "%start",
        detail: "Specify start symbol",
        snippet: "%start ${1:symbol}",
      },
      {
        label: "%union",
        detail: "Define union types",
        snippet: "%union {\n\t${1:int ival;}\n\t${2:char *sval;}\n}",
      },
      {
        label: "%left",
        detail: "Left associative operator",
        snippet: "%left ${1:TOKEN}",
      },
      {
        label: "%right",
        detail: "Right associative operator",
        snippet: "%right ${1:TOKEN}",
      },
      {
        label: "%nonassoc",
        detail: "Non-associative operator",
        snippet: "%nonassoc ${1:TOKEN}",
      },
      {
        label: "%precedence",
        detail: "Precedence declaration",
        snippet: "%precedence ${1:TOKEN}",
      },
      {
        label: "%rule",
        detail: "Define parameterized rule",
        snippet: "%rule ${1:name}(${2:X}): ${3:/* empty */}\n\t| ${4:X}\n\t;",
      },
      {
        label: "%destructor",
        detail: "Define destructor",
        snippet: "%destructor {\n\t${1:/* cleanup code */}\n} <${2:type}>",
      },
      {
        label: "%printer",
        detail: "Define printer",
        snippet:
          '%printer {\n\t${1:fprintf(yyoutput, "%d", \\$\\$);}\n} <${2:type}>',
      },
      {
        label: "%define",
        detail: "Set parser option",
        snippet: "%define ${1:lr.type} ${2:ielr}",
      },
      {
        label: "%locations",
        detail: "Enable location tracking",
        snippet: "%locations",
      },
      {
        label: "%no-stdlib",
        detail: "Disable standard library",
        snippet: "%no-stdlib",
      },
      { label: "%debug", detail: "Enable debug mode", snippet: "%debug" },
      {
        label: "%error-verbose",
        detail: "Verbose error messages",
        snippet: "%error-verbose",
      },
      {
        label: "%after-shift",
        detail: "After shift callback",
        snippet: "%after-shift ${1:function_name}",
      },
      {
        label: "%before-reduce",
        detail: "Before reduce callback",
        snippet: "%before-reduce ${1:function_name}",
      },
      {
        label: "%after-reduce",
        detail: "After reduce callback",
        snippet: "%after-reduce ${1:function_name}",
      },
      { label: "%empty", detail: "Empty rule", snippet: "%empty" },
      {
        label: "%prec",
        detail: "Precedence modifier",
        snippet: "%prec ${1:TOKEN}",
      },
    ];

    return directives.map((d) => ({
      label: d.label,
      kind: CompletionItemKind.Keyword,
      detail: d.detail,
      insertText: d.snippet,
      insertTextFormat: InsertTextFormat.Snippet,
    }));
  }

  private getSymbolCompletions(): CompletionItem[] {
    const completions: CompletionItem[] = [];
    const symbols = this.symbolTable.getAllSymbols();

    for (const symbol of symbols) {
      if (symbol.definition) {
        let kind: CompletionItemKind;
        let detail: string = symbol.type;

        switch (symbol.type) {
          case SymbolType.Token:
            kind = CompletionItemKind.Constant;
            break;
          case SymbolType.Rule:
          case SymbolType.Nonterminal:
            kind = CompletionItemKind.Function;
            break;
          case SymbolType.ParameterizedRule:
            kind = CompletionItemKind.Method;
            // Skip parameterized rules here, they're handled separately
            continue;
          default:
            kind = CompletionItemKind.Variable;
        }

        if (symbol.typeTag) {
          detail += ` <${symbol.typeTag}>`;
        }

        completions.push({
          label: symbol.name,
          kind: kind,
          detail: detail,
        });
      }
    }

    // Add reserved tokens
    const reserved = ["error", "YYEOF", "YYUNDEF"];
    for (const token of reserved) {
      completions.push({
        label: token,
        kind: CompletionItemKind.Constant,
        detail: "Reserved token",
      });
    }

    return completions;
  }

  private getParameterizedRuleCompletions(): CompletionItem[] {
    const completions: CompletionItem[] = [];
    const symbols = this.symbolTable.getAllSymbols();

    for (const symbol of symbols) {
      if (
        symbol.type === SymbolType.ParameterizedRule &&
        symbol.definition &&
        symbol.parameters
      ) {
        const params = symbol.parameters.join(", ");
        completions.push({
          label: `${symbol.name}(${params})`,
          kind: CompletionItemKind.Method,
          detail: `Parameterized rule`,
          insertText: `${symbol.name}(${symbol.parameters
            .map((p, i) => `\${${i + 1}:${p}}`)
            .join(", ")})`,
          insertTextFormat: InsertTextFormat.Snippet,
        });
      }
    }

    return completions;
  }

  private getBuiltinFunctionCompletions(): CompletionItem[] {
    const functions = [
      { name: "option", params: ["X"], desc: "Optional (0 or 1)" },
      { name: "ioption", params: ["X"], desc: "Inline optional" },
      { name: "list", params: ["X"], desc: "List (0 or more)" },
      {
        name: "nonempty_list",
        params: ["X"],
        desc: "Non-empty list (1 or more)",
      },
      {
        name: "separated_list",
        params: ["separator", "X"],
        desc: "Separated list",
      },
      {
        name: "separated_nonempty_list",
        params: ["separator", "X"],
        desc: "Non-empty separated list",
      },
      { name: "preceded", params: ["opening", "X"], desc: "Preceded by" },
      { name: "terminated", params: ["X", "closing"], desc: "Terminated by" },
      {
        name: "delimited",
        params: ["opening", "X", "closing"],
        desc: "Delimited by",
      },
    ];

    return functions.map((f) => ({
      label: `${f.name}(${f.params.join(", ")})`,
      kind: CompletionItemKind.Function,
      detail: f.desc,
      insertText: `${f.name}(${f.params
        .map((p, i) => `\${${i + 1}:${p}}`)
        .join(", ")})`,
      insertTextFormat: InsertTextFormat.Snippet,
    }));
  }

  private getInlineCompletion(): CompletionItem[] {
    return [
      {
        label: "%inline",
        kind: CompletionItemKind.Keyword,
        detail: "Inline rule modifier",
        insertText: "%inline",
      },
    ];
  }

  private getPrecedenceTokenCompletions(): CompletionItem[] {
    const completions: CompletionItem[] = [];
    const symbols = this.symbolTable.getAllSymbols();

    // Add tokens that were defined with precedence
    for (const symbol of symbols) {
      if (symbol.type === SymbolType.Token && symbol.definition) {
        completions.push({
          label: symbol.name,
          kind: CompletionItemKind.Constant,
          detail: "Precedence token",
        });
      }
    }

    return completions;
  }
}

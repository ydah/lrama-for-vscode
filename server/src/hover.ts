import { Hover, MarkupKind, Position } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { SymbolTable, Symbol, SymbolType } from "./symbolTable";

export class HoverProvider {
  private symbolTable: SymbolTable;

  constructor(symbolTable: SymbolTable) {
    this.symbolTable = symbolTable;
  }

  public getHover(document: TextDocument, position: Position): Hover | null {
    const symbol = this.symbolTable.getSymbolAtPosition(document, position);

    if (!symbol) {
      // Check for built-in functions or reserved tokens
      const word = this.getWordAtPosition(document, position);
      if (word) {
        return this.getBuiltinHover(word) || this.getDirectiveHover(word);
      }
      return null;
    }

    const content = this.getSymbolHoverContent(symbol, document);

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: content,
      },
    };
  }

  private getWordAtPosition(
    document: TextDocument,
    position: Position
  ): string | null {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Find word boundaries
    let start = offset;
    let end = offset;

    // Check if we're on a directive
    if (start > 0 && text[start - 1] === "%") {
      start--;
    }

    while (start > 0 && /[a-zA-Z0-9_\-]/.test(text[start - 1])) {
      start--;
    }

    while (end < text.length && /[a-zA-Z0-9_\-]/.test(text[end])) {
      end++;
    }

    const word = text.substring(start, end);
    return word.length > 0 ? word : null;
  }

  private getSymbolHoverContent(
    symbol: Symbol,
    document: TextDocument
  ): string {
    const lines: string[] = [];

    // Header with symbol type
    lines.push(
      `**${this.getSymbolTypeLabel(symbol.type)}**: \`${symbol.name}\``
    );

    // Type information
    if (symbol.typeTag) {
      lines.push(`\n**Type**: \`<${symbol.typeTag}>\``);
    }

    // Parameters for parameterized rules
    if (symbol.parameters && symbol.parameters.length > 0) {
      lines.push(`\n**Parameters**: \`(${symbol.parameters.join(", ")})\``);
    }

    // Usage statistics
    const refCount = symbol.references.length;
    const callCount = symbol.parameterizedCalls?.length || 0;

    if (refCount > 0 || callCount > 0) {
      lines.push("\n---\n**Usage**:");
      if (refCount > 0) {
        lines.push(`- ${refCount} reference${refCount === 1 ? "" : "s"}`);
      }
      if (callCount > 0) {
        lines.push(
          `- ${callCount} parameterized call${callCount === 1 ? "" : "s"}`
        );
      }
    }

    // Show definition preview if available
    if (symbol.definition) {
      const defText = this.getDefinitionPreview(symbol, document);
      if (defText) {
        lines.push("\n---\n**Definition**:");
        lines.push("```yacc");
        lines.push(defText);
        lines.push("```");
      }
    }

    // Special notes
    if (symbol.isParameterized) {
      lines.push(
        "\n*This is a parameterized rule that can be called with different arguments.*"
      );
    }

    if (symbol.name === this.symbolTable.getStartSymbol()) {
      lines.push("\n**Note**: This is the start symbol of the grammar.");
    }

    return lines.join("\n");
  }

  private getSymbolTypeLabel(type: SymbolType): string {
    switch (type) {
      case SymbolType.Token:
        return "Token";
      case SymbolType.Type:
        return "Type Declaration";
      case SymbolType.Rule:
        return "Grammar Rule";
      case SymbolType.Nonterminal:
        return "Nonterminal";
      case SymbolType.ParameterizedRule:
        return "Parameterized Rule";
      case SymbolType.Union:
        return "Union Type";
      case SymbolType.Start:
        return "Start Symbol";
      default:
        return "Symbol";
    }
  }

  private getDefinitionPreview(
    symbol: Symbol,
    document: TextDocument
  ): string | null {
    if (!symbol.definition) {
      return null;
    }

    const startLine = symbol.definition.range.start.line;
    const endLine = Math.min(
      symbol.definition.range.end.line,
      startLine + 5 // Limit preview to 5 lines
    );

    const lines = document.getText().split("\n");
    const previewLines: string[] = [];

    for (let i = startLine; i <= endLine && i < lines.length; i++) {
      let line = lines[i].trim();
      if (line.length > 80) {
        line = line.substring(0, 77) + "...";
      }
      previewLines.push(line);
    }

    if (endLine < symbol.definition.range.end.line) {
      previewLines.push("    ...");
    }

    return previewLines.join("\n");
  }

  private getBuiltinHover(word: string): Hover | null {
    const builtins: { [key: string]: string } = {
      option: `**Built-in Function**: \`option(X)\`\n\nMakes X optional (zero or one occurrences).\n\n**Example**:\n\`\`\`yacc\nrule: option(expr)\n// Expands to:\n// rule: /* empty */ | expr\n\`\`\``,

      ioption: `**Built-in Function**: \`ioption(X)\`\n\nInline option - expands directly without creating intermediate rule.\n\n**Example**:\n\`\`\`yacc\nrule: ioption(expr) stmt\n// Expands inline to:\n// rule: stmt | expr stmt\n\`\`\``,

      list: `**Built-in Function**: \`list(X)\`\n\nZero or more occurrences of X.\n\n**Example**:\n\`\`\`yacc\nrule: list(stmt)\n// Expands to:\n// rule: /* empty */ | rule stmt\n\`\`\``,

      nonempty_list: `**Built-in Function**: \`nonempty_list(X)\`\n\nOne or more occurrences of X.\n\n**Example**:\n\`\`\`yacc\nrule: nonempty_list(stmt)\n// Expands to:\n// rule: stmt | rule stmt\n\`\`\``,

      separated_list: `**Built-in Function**: \`separated_list(SEP, X)\`\n\nZero or more X separated by SEP.\n\n**Example**:\n\`\`\`yacc\nrule: separated_list(',', expr)\n// Matches: /* empty */ | expr | expr ',' expr ',' expr ...\n\`\`\``,

      separated_nonempty_list: `**Built-in Function**: \`separated_nonempty_list(SEP, X)\`\n\nOne or more X separated by SEP.\n\n**Example**:\n\`\`\`yacc\nrule: separated_nonempty_list(',', expr)\n// Matches: expr | expr ',' expr | expr ',' expr ',' expr ...\n\`\`\``,

      preceded: `**Built-in Function**: \`preceded(A, X)\`\n\nMatches A followed by X, returns only X.\n\n**Example**:\n\`\`\`yacc\nrule: preceded('(', expr)\n// Matches: '(' expr\n\`\`\``,

      terminated: `**Built-in Function**: \`terminated(X, A)\`\n\nMatches X followed by A, returns only X.\n\n**Example**:\n\`\`\`yacc\nrule: terminated(expr, ';')\n// Matches: expr ';'\n\`\`\``,

      delimited: `**Built-in Function**: \`delimited(OPEN, X, CLOSE)\`\n\nMatches OPEN X CLOSE, returns only X.\n\n**Example**:\n\`\`\`yacc\nrule: delimited('(', expr, ')')\n// Matches: '(' expr ')'\n\`\`\``,

      error: `**Reserved Token**: \`error\`\n\nSpecial token for error recovery.\n\n**Usage**:\n\`\`\`yacc\nstmt: expr ';'\n    | error ';' { yyerrok; }\n    ;\n\`\`\`\n\nWhen a syntax error occurs, the parser can recover by matching the \`error\` token.`,

      YYEOF: `**Reserved Token**: \`YYEOF\`\n\nEnd-of-file token. Automatically added to the end of the input.`,

      YYUNDEF: `**Reserved Token**: \`YYUNDEF\`\n\nUndefined token. Used for tokens that don't match any defined pattern.`,
    };

    const hover = builtins[word];
    if (hover) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: hover,
        },
      };
    }

    return null;
  }

  private getDirectiveHover(word: string): Hover | null {
    const directives: { [key: string]: string } = {
      "%token": `**Directive**: \`%token\`\n\nDeclares terminal symbols (tokens).\n\n**Syntax**:\n\`\`\`yacc\n%token TOKEN_NAME\n%token <type> TYPED_TOKEN\n%token TOKEN1 TOKEN2 TOKEN3\n\`\`\``,

      "%type": `**Directive**: \`%type\`\n\nDeclares the type of nonterminals.\n\n**Syntax**:\n\`\`\`yacc\n%type <type> nonterminal1 nonterminal2\n\`\`\``,

      "%nterm": `**Directive**: \`%nterm\`\n\nDeclares nonterminal symbols with optional type.\n\n**Syntax**:\n\`\`\`yacc\n%nterm <type> nonterminal\n\`\`\``,

      "%start": `**Directive**: \`%start\`\n\nSpecifies the start symbol of the grammar.\n\n**Syntax**:\n\`\`\`yacc\n%start program\n\`\`\``,

      "%union": `**Directive**: \`%union\`\n\nDefines the union type for semantic values.\n\n**Syntax**:\n\`\`\`yacc\n%union {\n    int ival;\n    double dval;\n    char *sval;\n}\n\`\`\``,

      "%left": `**Directive**: \`%left\`\n\nDeclares left-associative operators.\n\n**Syntax**:\n\`\`\`yacc\n%left '+' '-'\n%left '*' '/'\n\`\`\`\n\nLater declarations have higher precedence.`,

      "%right": `**Directive**: \`%right\`\n\nDeclares right-associative operators.\n\n**Syntax**:\n\`\`\`yacc\n%right '^'  // Exponentiation\n%right '=' // Assignment\n\`\`\``,

      "%nonassoc": `**Directive**: \`%nonassoc\`\n\nDeclares non-associative operators.\n\n**Syntax**:\n\`\`\`yacc\n%nonassoc '<' '>' LEQ GEQ\n\`\`\`\n\nThese operators cannot be chained.`,

      "%precedence": `**Directive**: \`%precedence\`\n\nDeclares precedence without associativity.\n\n**Syntax**:\n\`\`\`yacc\n%precedence NEG  // Unary minus\n\`\`\``,

      "%prec": `**Directive**: \`%prec\`\n\nOverrides precedence for a specific rule.\n\n**Syntax**:\n\`\`\`yacc\nexpr: '-' expr %prec NEG\n\`\`\``,

      "%rule": `**Directive**: \`%rule\` *(Lrama extension)*\n\nDefines a parameterized rule.\n\n**Syntax**:\n\`\`\`yacc\n%rule list(X): /* empty */\n            | list(X) X\n            ;\n\`\`\``,

      "%inline": `**Directive**: \`%inline\` *(Lrama extension)*\n\nInlines a rule at its usage points.\n\n**Syntax**:\n\`\`\`yacc\n%rule %inline op: '+' | '-' ;\n\`\`\``,

      "%empty": `**Directive**: \`%empty\`\n\nExplicitly marks an empty rule.\n\n**Syntax**:\n\`\`\`yacc\noptional: %empty\n        | value\n        ;\n\`\`\``,

      "%destructor": `**Directive**: \`%destructor\`\n\nDefines cleanup code for semantic values.\n\n**Syntax**:\n\`\`\`yacc\n%destructor { free($$); } <string>\n\`\`\``,

      "%printer": `**Directive**: \`%printer\`\n\nDefines debug printing for semantic values.\n\n**Syntax**:\n\`\`\`yacc\n%printer { fprintf(yyoutput, "%d", $$); } <int>\n\`\`\``,

      "%define": `**Directive**: \`%define\`\n\nSets parser configuration variables.\n\n**Common uses**:\n\`\`\`yacc\n%define lr.type ielr\n%define api.pure full\n\`\`\``,

      "%locations": `**Directive**: \`%locations\`\n\nEnables location tracking for better error messages.`,

      "%no-stdlib": `**Directive**: \`%no-stdlib\` *(Lrama extension)*\n\nDisables Lrama standard library (parameterized rules).`,

      "%debug": `**Directive**: \`%debug\`\n\nEnables debug output in the generated parser.`,

      "%error-verbose": `**Directive**: \`%error-verbose\`\n\nGenerates more detailed error messages.`,
    };

    const hover = directives[word];
    if (hover) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: hover,
        },
      };
    }

    return null;
  }
}

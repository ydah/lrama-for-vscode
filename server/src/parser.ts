import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Position,
} from "vscode-languageserver/node";
import { SymbolTable, SymbolType } from "./symbolTable";

interface Token {
  type: string;
  value: string;
  line: number;
  column: number;
  length: number;
}

export class LramaParser {
  private diagnostics: Diagnostic[] = [];
  private symbolTable: SymbolTable = new SymbolTable();
  private tokens: Token[] = [];
  private currentTokenIndex = 0;
  private lines: string[] = [];

  public parse(text: string): SymbolTable {
    this.diagnostics = [];
    this.symbolTable = new SymbolTable();
    this.lines = text.split("\n");
    this.tokens = this.tokenize(text);
    this.currentTokenIndex = 0;

    this.parseGrammar();
    this.validateSymbols();

    return this.symbolTable;
  }

  public getDiagnostics(): Diagnostic[] {
    return this.diagnostics;
  }

  private tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    const lines = text.split("\n");

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      let column = 0;

      while (column < line.length) {
        // Skip whitespace
        if (/\s/.test(line[column])) {
          column++;
          continue;
        }

        // Skip line comments
        if (line.substr(column, 2) === "//") {
          break;
        }

        // Skip block comments
        if (line.substr(column, 2) === "/*") {
          const endComment = text.indexOf(
            "*/",
            text.indexOf(line) + column + 2
          );
          if (endComment !== -1) {
            // Find the position in the current line or skip to next lines
            const localEnd = line.indexOf("*/", column + 2);
            if (localEnd !== -1) {
              column = localEnd + 2;
            } else {
              break; // Comment continues to next line
            }
            continue;
          }
        }

        // Check for %% separator
        if (line.substr(column, 2) === "%%") {
          tokens.push({
            type: "SEPARATOR",
            value: "%%",
            line: lineNum,
            column: column,
            length: 2,
          });
          column += 2;
          continue;
        }

        // Check for %{ prologue start
        if (line.substr(column, 2) === "%{") {
          tokens.push({
            type: "PROLOGUE_START",
            value: "%{",
            line: lineNum,
            column: column,
            length: 2,
          });
          column += 2;
          continue;
        }

        // Check for %} prologue end
        if (line.substr(column, 2) === "%}") {
          tokens.push({
            type: "PROLOGUE_END",
            value: "%}",
            line: lineNum,
            column: column,
            length: 2,
          });
          column += 2;
          continue;
        }

        // Check for directives
        if (line[column] === "%") {
          const directiveMatch = line
            .substr(column)
            .match(
              /^%(rule|inline|token|type|nterm|start|union|left|right|nonassoc|precedence|prec|empty|destructor|printer|locations|no-stdlib|define|after-shift|before-reduce|after-reduce|after-shift-error-token|after-pop-stack|debug|error-verbose)/
            );
          if (directiveMatch) {
            tokens.push({
              type: "DIRECTIVE",
              value: directiveMatch[0],
              line: lineNum,
              column: column,
              length: directiveMatch[0].length,
            });
            column += directiveMatch[0].length;
            continue;
          }
        }

        // Check for identifiers
        const identMatch = line
          .substr(column)
          .match(/^[a-zA-Z_][a-zA-Z0-9_\-]*/);
        if (identMatch) {
          tokens.push({
            type: "IDENTIFIER",
            value: identMatch[0],
            line: lineNum,
            column: column,
            length: identMatch[0].length,
          });
          column += identMatch[0].length;
          continue;
        }

        // Check for strings
        if (line[column] === '"') {
          let endQuote = column + 1;
          while (endQuote < line.length) {
            if (line[endQuote] === '"' && line[endQuote - 1] !== "\\") {
              break;
            }
            endQuote++;
          }
          if (endQuote < line.length) {
            const value = line.substring(column, endQuote + 1);
            tokens.push({
              type: "STRING",
              value: value,
              line: lineNum,
              column: column,
              length: value.length,
            });
            column = endQuote + 1;
            continue;
          }
        }

        // Check for character literals
        if (line[column] === "'") {
          let endQuote = column + 1;
          while (endQuote < line.length) {
            if (line[endQuote] === "'" && line[endQuote - 1] !== "\\") {
              break;
            }
            endQuote++;
          }
          if (endQuote < line.length) {
            const value = line.substring(column, endQuote + 1);
            tokens.push({
              type: "CHARACTER",
              value: value,
              line: lineNum,
              column: column,
              length: value.length,
            });
            column = endQuote + 1;
            continue;
          }
        }

        // Check for type tags
        if (line[column] === "<") {
          const endTag = line.indexOf(">", column + 1);
          if (endTag !== -1) {
            const value = line.substring(column + 1, endTag);
            tokens.push({
              type: "TYPE_TAG",
              value: value,
              line: lineNum,
              column: column,
              length: endTag - column + 1,
            });
            column = endTag + 1;
            continue;
          }
        }

        // Check for special characters
        const specialChar = line[column];
        if (":;|()[]{},.?*+".includes(specialChar)) {
          tokens.push({
            type: "SPECIAL",
            value: specialChar,
            line: lineNum,
            column: column,
            length: 1,
          });
          column++;
          continue;
        }

        // Skip unknown characters
        column++;
      }
    }

    return tokens;
  }

  private parseGrammar(): void {
    let section: "declarations" | "rules" | "epilogue" = "declarations";

    while (this.currentTokenIndex < this.tokens.length) {
      const token = this.tokens[this.currentTokenIndex];

      if (token.type === "SEPARATOR" && token.value === "%%") {
        if (section === "declarations") {
          section = "rules";
        } else if (section === "rules") {
          section = "epilogue";
        }
        this.currentTokenIndex++;
        continue;
      }

      switch (section) {
        case "declarations":
          this.parseDeclaration();
          break;
        case "rules":
          this.parseRule();
          break;
        case "epilogue":
          // Skip epilogue for now
          this.currentTokenIndex++;
          break;
      }
    }
  }

  private parseDeclaration(): void {
    const token = this.tokens[this.currentTokenIndex];

    if (!token) return;

    if (token.type === "DIRECTIVE") {
      switch (token.value) {
        case "%token":
          this.parseTokenDeclaration();
          break;
        case "%type":
          this.parseTypeDeclaration();
          break;
        case "%nterm":
          this.parseNtermDeclaration();
          break;
        case "%rule":
          this.parseParameterizedRuleDeclaration();
          break;
        case "%start":
          this.parseStartDeclaration();
          break;
        case "%union":
          this.parseUnionDeclaration();
          break;
        case "%left":
        case "%right":
        case "%nonassoc":
        case "%precedence":
          this.parsePrecedenceDeclaration();
          break;
        case "%destructor":
        case "%printer":
          this.parseCodeBlockDeclaration();
          break;
        default:
          this.currentTokenIndex++;
          this.skipToEndOfLine();
      }
    } else if (token.type === "PROLOGUE_START") {
      this.skipPrologue();
    } else {
      this.currentTokenIndex++;
    }
  }

  private parseTokenDeclaration(): void {
    const startToken = this.tokens[this.currentTokenIndex];
    this.currentTokenIndex++; // Skip %token

    // Check for type tag
    let typeTag: string | undefined;
    if (
      this.currentTokenIndex < this.tokens.length &&
      this.tokens[this.currentTokenIndex].type === "TYPE_TAG"
    ) {
      typeTag = this.tokens[this.currentTokenIndex].value;
      this.currentTokenIndex++;
    }

    // Parse token names
    while (this.currentTokenIndex < this.tokens.length) {
      const token = this.tokens[this.currentTokenIndex];

      if (token.type === "IDENTIFIER") {
        const range = this.createRange(token);
        const symbol = this.symbolTable.addSymbol(
          token.value,
          SymbolType.Token,
          {
            range: range,
            nameRange: range,
          }
        );
        if (typeTag) {
          symbol.typeTag = typeTag;
        }
        this.currentTokenIndex++;
      } else if (token.type === "CHARACTER") {
        // Character literal tokens
        this.currentTokenIndex++;
      } else if (token.type === "STRING") {
        // String literal tokens (alias)
        this.currentTokenIndex++;
      } else if (this.isEndOfDeclaration(token)) {
        break;
      } else {
        this.currentTokenIndex++;
      }
    }
  }

  private parseTypeDeclaration(): void {
    this.currentTokenIndex++; // Skip %type

    // Check for type tag
    let typeTag: string | undefined;
    if (
      this.currentTokenIndex < this.tokens.length &&
      this.tokens[this.currentTokenIndex].type === "TYPE_TAG"
    ) {
      typeTag = this.tokens[this.currentTokenIndex].value;
      this.currentTokenIndex++;
    }

    // Parse nonterminal names
    while (this.currentTokenIndex < this.tokens.length) {
      const token = this.tokens[this.currentTokenIndex];

      if (token.type === "IDENTIFIER") {
        const range = this.createRange(token);
        const symbol = this.symbolTable.addSymbol(
          token.value,
          SymbolType.Type,
          {
            range: range,
            nameRange: range,
          }
        );
        if (typeTag) {
          symbol.typeTag = typeTag;
        }
        this.currentTokenIndex++;
      } else if (this.isEndOfDeclaration(token)) {
        break;
      } else {
        this.currentTokenIndex++;
      }
    }
  }

  private parseNtermDeclaration(): void {
    this.currentTokenIndex++; // Skip %nterm

    // Check for type tag
    let typeTag: string | undefined;
    if (
      this.currentTokenIndex < this.tokens.length &&
      this.tokens[this.currentTokenIndex].type === "TYPE_TAG"
    ) {
      typeTag = this.tokens[this.currentTokenIndex].value;
      this.currentTokenIndex++;
    }

    // Parse nonterminal names
    while (this.currentTokenIndex < this.tokens.length) {
      const token = this.tokens[this.currentTokenIndex];

      if (token.type === "IDENTIFIER") {
        const range = this.createRange(token);
        const symbol = this.symbolTable.addSymbol(
          token.value,
          SymbolType.Nonterminal,
          {
            range: range,
            nameRange: range,
          }
        );
        if (typeTag) {
          symbol.typeTag = typeTag;
        }
        this.currentTokenIndex++;
      } else if (this.isEndOfDeclaration(token)) {
        break;
      } else {
        this.currentTokenIndex++;
      }
    }
  }

  private parseStartDeclaration(): void {
    this.currentTokenIndex++; // Skip %start

    if (
      this.currentTokenIndex < this.tokens.length &&
      this.tokens[this.currentTokenIndex].type === "IDENTIFIER"
    ) {
      const token = this.tokens[this.currentTokenIndex];
      const range = this.createRange(token);
      this.symbolTable.addSymbol(token.value, SymbolType.Start, {
        range: range,
        nameRange: range,
      });
      this.currentTokenIndex++;
    }
  }

  private parseUnionDeclaration(): void {
    this.currentTokenIndex++; // Skip %union

    // Skip to opening brace
    while (this.currentTokenIndex < this.tokens.length) {
      if (
        this.tokens[this.currentTokenIndex].type === "SPECIAL" &&
        this.tokens[this.currentTokenIndex].value === "{"
      ) {
        break;
      }
      this.currentTokenIndex++;
    }

    // Skip union block content
    let braceDepth = 0;
    while (this.currentTokenIndex < this.tokens.length) {
      const token = this.tokens[this.currentTokenIndex];
      if (token.type === "SPECIAL" && token.value === "{") {
        braceDepth++;
      } else if (token.type === "SPECIAL" && token.value === "}") {
        braceDepth--;
        if (braceDepth === 0) {
          this.currentTokenIndex++;
          break;
        }
      }
      this.currentTokenIndex++;
    }
  }

  private parsePrecedenceDeclaration(): void {
    const directiveToken = this.tokens[this.currentTokenIndex];
    const directiveType = directiveToken.value; // %left, %right, %nonassoc, %precedence
    this.currentTokenIndex++; // Skip directive

    // Parse tokens/symbols in precedence declaration
    while (this.currentTokenIndex < this.tokens.length) {
      const token = this.tokens[this.currentTokenIndex];

      if (token.type === "IDENTIFIER") {
        // Add as a token definition with precedence
        const range = this.createRange(token);
        this.symbolTable.addSymbol(token.value, SymbolType.Token, {
          range: range,
          nameRange: range,
        });
        this.currentTokenIndex++;
      } else if (token.type === "CHARACTER") {
        // Character literal tokens (like '+', '-', etc.)
        // Add as a token definition
        const range = this.createRange(token);
        this.symbolTable.addSymbol(token.value, SymbolType.Token, {
          range: range,
          nameRange: range,
        });
        this.currentTokenIndex++;
      } else if (this.isEndOfDeclaration(token)) {
        break;
      } else {
        this.currentTokenIndex++;
      }
    }
  }

  private parseCodeBlockDeclaration(): void {
    this.currentTokenIndex++; // Skip directive

    // Skip to opening brace
    while (this.currentTokenIndex < this.tokens.length) {
      if (
        this.tokens[this.currentTokenIndex].type === "SPECIAL" &&
        this.tokens[this.currentTokenIndex].value === "{"
      ) {
        break;
      }
      this.currentTokenIndex++;
    }

    // Skip code block
    this.skipCodeBlock();
  }

  private parseParameterizedRuleDeclaration(): void {
    this.currentTokenIndex++; // Skip %rule

    // Check for %inline
    let isInline = false;
    if (
      this.currentTokenIndex < this.tokens.length &&
      this.tokens[this.currentTokenIndex].type === "DIRECTIVE" &&
      this.tokens[this.currentTokenIndex].value === "%inline"
    ) {
      isInline = true;
      this.currentTokenIndex++;
    }

    // Get rule name
    if (
      this.currentTokenIndex < this.tokens.length &&
      this.tokens[this.currentTokenIndex].type === "IDENTIFIER"
    ) {
      const nameToken = this.tokens[this.currentTokenIndex];
      const baseName = nameToken.value;
      const nameRange = this.createRange(nameToken);
      this.currentTokenIndex++;

      // Check if this has parameters (making it a parameterized rule)
      let params: string[] = [];
      let isParameterized = false;

      if (
        this.currentTokenIndex < this.tokens.length &&
        this.tokens[this.currentTokenIndex].type === "SPECIAL" &&
        this.tokens[this.currentTokenIndex].value === "("
      ) {
        isParameterized = true;
        this.currentTokenIndex++;

        while (this.currentTokenIndex < this.tokens.length) {
          const token = this.tokens[this.currentTokenIndex];
          if (token.type === "SPECIAL" && token.value === ")") {
            this.currentTokenIndex++;
            break;
          }
          if (token.type === "IDENTIFIER") {
            params.push(token.value);
          }
          this.currentTokenIndex++;
        }
      }

      // Create appropriate symbol based on whether it's parameterized
      let symbol;
      if (isParameterized) {
        // Parameterized rule (with or without %inline)
        symbol = this.symbolTable.addParameterizedRuleDefinition(
          baseName,
          {
            range: nameRange,
            nameRange: nameRange,
          },
          params
        );
      } else {
        // Regular rule (possibly with %inline)
        symbol = this.symbolTable.addSymbol(baseName, SymbolType.Rule, {
          range: nameRange,
          nameRange: nameRange,
        });
      }

      // Parse type tag
      if (
        this.currentTokenIndex < this.tokens.length &&
        this.tokens[this.currentTokenIndex].type === "TYPE_TAG"
      ) {
        symbol.typeTag = this.tokens[this.currentTokenIndex].value;
        this.currentTokenIndex++;
      }

      // Parse rule body
      if (
        this.currentTokenIndex < this.tokens.length &&
        this.tokens[this.currentTokenIndex].type === "SPECIAL" &&
        this.tokens[this.currentTokenIndex].value === ":"
      ) {
        this.currentTokenIndex++;

        if (isParameterized) {
          this.parseParameterizedRuleBody(baseName, params);
        } else {
          this.parseRuleBody(baseName);
        }
      }
    }
  }

  private parseParameterizedRuleBody(
    ruleName: string,
    parameters: string[]
  ): void {
    // Track that we're in a parameterized rule context
    const currentParameters = new Set(parameters);

    while (this.currentTokenIndex < this.tokens.length) {
      const token = this.tokens[this.currentTokenIndex];

      // End of rule
      if (token.type === "SPECIAL" && token.value === ";") {
        this.currentTokenIndex++;
        break;
      }

      // Alternative separator
      if (token.type === "SPECIAL" && token.value === "|") {
        this.currentTokenIndex++;
        continue;
      }

      // Action block
      if (token.type === "SPECIAL" && token.value === "{") {
        this.skipCodeBlock();
        // Check for midrule type tag
        if (
          this.currentTokenIndex < this.tokens.length &&
          this.tokens[this.currentTokenIndex].type === "TYPE_TAG"
        ) {
          this.currentTokenIndex++;
        }
        continue;
      }

      // Check for directives
      if (token.type === "DIRECTIVE") {
        if (token.value === "%prec") {
          this.currentTokenIndex++;
          // The next token is a precedence specifier
          if (this.currentTokenIndex < this.tokens.length) {
            const precToken = this.tokens[this.currentTokenIndex];
            if (
              precToken.type === "IDENTIFIER" ||
              precToken.type === "CHARACTER"
            ) {
              // Add reference to the precedence token
              const range = this.createRange(precToken);
              this.symbolTable.addReference(precToken.value, { range });
              this.currentTokenIndex++;
            }
          }
        } else if (token.value === "%empty") {
          // %empty is a special directive that can appear in rules
          this.currentTokenIndex++;
        } else {
          // Other directives, skip
          this.currentTokenIndex++;
        }
        continue;
      }

      // Symbol reference
      if (token.type === "IDENTIFIER") {
        const nextIndex = this.currentTokenIndex + 1;

        // Check if this is a parameterized call
        if (
          nextIndex < this.tokens.length &&
          this.tokens[nextIndex].type === "SPECIAL" &&
          this.tokens[nextIndex].value === "("
        ) {
          // This is a parameterized call like f_kw(value) or f_kwarg(value)
          const callRange = this.createRange(token);
          this.currentTokenIndex = nextIndex + 1; // Skip '('

          // Parse arguments and check if they use parameters
          const args = this.parseArgumentListWithContext(currentParameters);

          // Add parameterized call reference
          this.symbolTable.addParameterizedCall(token.value, {
            range: callRange,
            arguments: args,
          });

          // Check for named reference after the parameterized call
          if (
            this.currentTokenIndex < this.tokens.length &&
            this.tokens[this.currentTokenIndex].type === "SPECIAL" &&
            this.tokens[this.currentTokenIndex].value === "["
          ) {
            this.skipNamedReference();
          }
        } else if (currentParameters.has(token.value)) {
          // This is a parameter reference, skip it without adding as undefined
          this.currentTokenIndex++;
        } else {
          // Regular symbol reference
          const range = this.createRange(token);
          this.symbolTable.addReference(token.value, { range });
          this.currentTokenIndex++;

          // Check for named reference
          if (
            this.currentTokenIndex < this.tokens.length &&
            this.tokens[this.currentTokenIndex].type === "SPECIAL" &&
            this.tokens[this.currentTokenIndex].value === "["
          ) {
            this.skipNamedReference();
          }

          // Check for suffix operators
          if (
            this.currentTokenIndex < this.tokens.length &&
            this.tokens[this.currentTokenIndex].type === "SPECIAL" &&
            "?*+".includes(this.tokens[this.currentTokenIndex].value)
          ) {
            this.currentTokenIndex++;
          }
        }
        continue;
      }

      // Character literal
      if (token.type === "CHARACTER") {
        this.currentTokenIndex++;

        // Check for suffix operators
        if (
          this.currentTokenIndex < this.tokens.length &&
          this.tokens[this.currentTokenIndex].type === "SPECIAL" &&
          "?*+".includes(this.tokens[this.currentTokenIndex].value)
        ) {
          this.currentTokenIndex++;
        }
        continue;
      }

      this.currentTokenIndex++;
    }
  }

  private parseArgumentListWithContext(knownParameters: Set<string>): string[] {
    const args: string[] = [];
    let parenDepth = 1;

    while (this.currentTokenIndex < this.tokens.length && parenDepth > 0) {
      const token = this.tokens[this.currentTokenIndex];

      if (token.type === "SPECIAL" && token.value === "(") {
        parenDepth++;
        this.currentTokenIndex++;
      } else if (token.type === "SPECIAL" && token.value === ")") {
        parenDepth--;
        if (parenDepth === 0) {
          this.currentTokenIndex++;
          break;
        }
        this.currentTokenIndex++;
      } else if (
        token.type === "SPECIAL" &&
        token.value === "," &&
        parenDepth === 1
      ) {
        // Argument separator at top level
        this.currentTokenIndex++;
      } else if (token.type === "IDENTIFIER" && parenDepth === 1) {
        // Capture argument names at top level
        args.push(token.value);

        // If this is not a known parameter, add it as a reference
        if (!knownParameters.has(token.value)) {
          const range = this.createRange(token);
          this.symbolTable.addReference(token.value, { range });
        }
        this.currentTokenIndex++;
      } else if (token.type === "CHARACTER" && parenDepth === 1) {
        // Character literal as argument
        args.push(token.value);
        this.currentTokenIndex++;
      } else {
        this.currentTokenIndex++;
      }
    }

    return args;
  }

  private parseRule(): void {
    const token = this.tokens[this.currentTokenIndex];

    if (!token) return;

    // Check for %rule directive in rules section
    if (token.type === "DIRECTIVE" && token.value === "%rule") {
      this.parseParameterizedRuleDeclaration();
      return;
    }

    // Check for rule name
    if (token.type === "IDENTIFIER") {
      const nameToken = token;
      let nextIndex = this.currentTokenIndex + 1;

      // Skip named reference if present (this is for the rule name)
      if (
        nextIndex < this.tokens.length &&
        this.tokens[nextIndex].type === "SPECIAL" &&
        this.tokens[nextIndex].value === "["
      ) {
        // Skip the named reference for the rule itself
        nextIndex++; // Skip '['
        while (
          nextIndex < this.tokens.length &&
          this.tokens[nextIndex].value !== "]"
        ) {
          nextIndex++;
        }
        if (nextIndex < this.tokens.length) {
          nextIndex++; // Skip ']'
        }
      }

      // Check for colon
      if (
        nextIndex < this.tokens.length &&
        this.tokens[nextIndex].type === "SPECIAL" &&
        this.tokens[nextIndex].value === ":"
      ) {
        // This is a rule definition
        const range = this.createRange(nameToken);
        const symbol = this.symbolTable.addSymbol(
          nameToken.value,
          SymbolType.Rule,
          {
            range: range,
            nameRange: range,
          }
        );
        this.currentTokenIndex = nextIndex + 1; // Skip past ':'
        this.parseRuleBody(nameToken.value);
        return;
      }
    }

    this.currentTokenIndex++;
  }

  private parseRuleBody(ruleName: string): void {
    while (this.currentTokenIndex < this.tokens.length) {
      const token = this.tokens[this.currentTokenIndex];

      // End of rule
      if (token.type === "SPECIAL" && token.value === ";") {
        this.currentTokenIndex++;
        break;
      }

      // Alternative separator
      if (token.type === "SPECIAL" && token.value === "|") {
        this.currentTokenIndex++;
        continue;
      }

      // Action block
      if (token.type === "SPECIAL" && token.value === "{") {
        this.skipCodeBlock();
        // Check for midrule type tag
        if (
          this.currentTokenIndex < this.tokens.length &&
          this.tokens[this.currentTokenIndex].type === "TYPE_TAG"
        ) {
          this.currentTokenIndex++;
        }
        continue;
      }

      // Check for %prec directive (or other directives that might appear in rules)
      if (token.type === "DIRECTIVE") {
        if (token.value === "%prec") {
          this.currentTokenIndex++;
          // The next token is a precedence specifier
          if (this.currentTokenIndex < this.tokens.length) {
            const precToken = this.tokens[this.currentTokenIndex];
            if (
              precToken.type === "IDENTIFIER" ||
              precToken.type === "CHARACTER"
            ) {
              // Add reference to the precedence token
              const range = this.createRange(precToken);
              this.symbolTable.addReference(precToken.value, { range });
              this.currentTokenIndex++;
            }
          }
        } else if (token.value === "%empty") {
          // %empty is a special directive that can appear in rules
          this.currentTokenIndex++;
        } else {
          // Other directives, skip
          this.currentTokenIndex++;
        }
        continue;
      }

      // Symbol reference
      if (token.type === "IDENTIFIER") {
        const nextIndex = this.currentTokenIndex + 1;

        // Check if this is a parameterized function call
        if (
          nextIndex < this.tokens.length &&
          this.tokens[nextIndex].type === "SPECIAL" &&
          this.tokens[nextIndex].value === "("
        ) {
          // This is a function call like option(X) or compstmt(stmts)
          const callRange = this.createRange(token);

          // Parse the function call and its arguments
          this.currentTokenIndex = nextIndex + 1; // Skip '('
          const args = this.parseArgumentList();

          // Add parameterized call using base name
          this.symbolTable.addParameterizedCall(token.value, {
            range: callRange,
            arguments: args,
          });

          // Check for named reference after the parameterized call
          if (
            this.currentTokenIndex < this.tokens.length &&
            this.tokens[this.currentTokenIndex].type === "SPECIAL" &&
            this.tokens[this.currentTokenIndex].value === "["
          ) {
            this.skipNamedReference();
          }
        } else {
          // Regular symbol reference
          const range = this.createRange(token);
          this.symbolTable.addReference(token.value, { range });
          this.currentTokenIndex++;

          // Check for named reference
          if (
            this.currentTokenIndex < this.tokens.length &&
            this.tokens[this.currentTokenIndex].type === "SPECIAL" &&
            this.tokens[this.currentTokenIndex].value === "["
          ) {
            this.skipNamedReference();
          }

          // Check for suffix operators
          if (
            this.currentTokenIndex < this.tokens.length &&
            this.tokens[this.currentTokenIndex].type === "SPECIAL" &&
            "?*+".includes(this.tokens[this.currentTokenIndex].value)
          ) {
            this.currentTokenIndex++;
          }
        }
        continue;
      }

      // Character literal
      if (token.type === "CHARACTER") {
        this.currentTokenIndex++;

        // Check for suffix operators
        if (
          this.currentTokenIndex < this.tokens.length &&
          this.tokens[this.currentTokenIndex].type === "SPECIAL" &&
          "?*+".includes(this.tokens[this.currentTokenIndex].value)
        ) {
          this.currentTokenIndex++;
        }
        continue;
      }

      this.currentTokenIndex++;
    }
  }

  private skipPrologue(): void {
    this.currentTokenIndex++; // Skip %{

    while (this.currentTokenIndex < this.tokens.length) {
      if (this.tokens[this.currentTokenIndex].type === "PROLOGUE_END") {
        this.currentTokenIndex++;
        break;
      }
      this.currentTokenIndex++;
    }
  }

  private skipCodeBlock(): void {
    let braceDepth = 0;

    while (this.currentTokenIndex < this.tokens.length) {
      const token = this.tokens[this.currentTokenIndex];
      if (token.type === "SPECIAL" && token.value === "{") {
        braceDepth++;
      } else if (token.type === "SPECIAL" && token.value === "}") {
        braceDepth--;
        if (braceDepth === 0) {
          this.currentTokenIndex++;
          break;
        }
      }
      this.currentTokenIndex++;
    }
  }

  private parseArgumentList(): string[] {
    const args: string[] = [];
    let parenDepth = 1;

    while (this.currentTokenIndex < this.tokens.length && parenDepth > 0) {
      const token = this.tokens[this.currentTokenIndex];

      if (token.type === "SPECIAL" && token.value === "(") {
        parenDepth++;
        this.currentTokenIndex++;
      } else if (token.type === "SPECIAL" && token.value === ")") {
        parenDepth--;
        if (parenDepth === 0) {
          this.currentTokenIndex++;
          break;
        }
        this.currentTokenIndex++;
      } else if (
        token.type === "SPECIAL" &&
        token.value === "," &&
        parenDepth === 1
      ) {
        // Argument separator at top level
        this.currentTokenIndex++;
      } else if (token.type === "IDENTIFIER" && parenDepth === 1) {
        // Capture argument names at top level
        args.push(token.value);
        // Add reference for the argument (unless it's handled in context)
        const range = this.createRange(token);
        this.symbolTable.addReference(token.value, { range });
        this.currentTokenIndex++;
      } else if (token.type === "CHARACTER" && parenDepth === 1) {
        // Character literal as argument
        args.push(token.value);
        this.currentTokenIndex++;
      } else {
        this.currentTokenIndex++;
      }
    }

    return args;
  }

  private skipParentheses(): void {
    let parenDepth = 0;

    while (this.currentTokenIndex < this.tokens.length) {
      const token = this.tokens[this.currentTokenIndex];
      if (token.type === "SPECIAL" && token.value === "(") {
        parenDepth++;
      } else if (token.type === "SPECIAL" && token.value === ")") {
        parenDepth--;
        if (parenDepth === 0) {
          this.currentTokenIndex++;
          break;
        }
      }
      this.currentTokenIndex++;
    }
  }

  private skipBrackets(): void {
    while (this.currentTokenIndex < this.tokens.length) {
      const token = this.tokens[this.currentTokenIndex];
      this.currentTokenIndex++;
      if (token.type === "SPECIAL" && token.value === "]") {
        break;
      }
    }
  }

  private skipNamedReference(): void {
    // Skip the opening '['
    this.currentTokenIndex++;

    // Skip everything until we find the closing ']'
    // Named references contain alias names, not symbol references
    while (this.currentTokenIndex < this.tokens.length) {
      const token = this.tokens[this.currentTokenIndex];
      if (token.type === "SPECIAL" && token.value === "]") {
        this.currentTokenIndex++;
        break;
      }
      // Don't add identifiers inside [...] as symbol references
      this.currentTokenIndex++;
    }
  }

  private skipToEndOfLine(): void {
    const currentLine = this.tokens[this.currentTokenIndex - 1]?.line;
    while (
      this.currentTokenIndex < this.tokens.length &&
      this.tokens[this.currentTokenIndex].line === currentLine
    ) {
      this.currentTokenIndex++;
    }
  }

  private isEndOfDeclaration(token: Token): boolean {
    return (
      token.type === "DIRECTIVE" ||
      token.type === "SEPARATOR" ||
      token.type === "PROLOGUE_START"
    );
  }

  private createRange(token: Token): Range {
    return {
      start: { line: token.line, character: token.column },
      end: { line: token.line, character: token.column + token.length },
    };
  }

  private validateSymbols(): void {
    const symbols = this.symbolTable.getAllSymbols();
    const knownParameters = new Set<string>();

    // Collect all parameter names from parameterized rules
    for (const symbol of symbols) {
      if (symbol.type === SymbolType.ParameterizedRule && symbol.parameters) {
        for (const param of symbol.parameters) {
          knownParameters.add(param);
        }
      }
    }

    for (const symbol of symbols) {
      // Skip validation for parameterized rule base names without full definition
      if (
        symbol.type === SymbolType.ParameterizedRule &&
        !symbol.isParameterized &&
        !symbol.definition
      ) {
        continue;
      }

      // Check for undefined symbols
      if (symbol.references.length > 0 && !symbol.definition) {
        // Skip warning for parameters used in parameterized rules
        if (knownParameters.has(symbol.name)) {
          continue;
        }

        // Skip warning for character literals (they are implicitly defined tokens)
        if (this.isCharacterLiteral(symbol.name)) {
          continue;
        }

        // Only warn for non-terminal symbols (not tokens or built-in functions)
        if (
          !this.isBuiltinFunction(symbol.name) &&
          !this.isLikelyToken(symbol.name) &&
          !this.isCommonParameter(symbol.name)
        ) {
          for (const ref of symbol.references) {
            this.addDiagnostic(
              ref.range,
              `Symbol '${symbol.name}' is not defined`,
              DiagnosticSeverity.Warning
            );
          }
        }
      }

      // Check for unused symbols (but not for character literal tokens)
      if (
        symbol.definition &&
        symbol.references.length === 0 &&
        symbol.parameterizedCalls?.length === 0 &&
        symbol.type === SymbolType.Rule &&
        !this.isCharacterLiteral(symbol.name)
      ) {
        this.addDiagnostic(
          symbol.definition.nameRange,
          `Rule '${symbol.name}' is defined but never used`,
          DiagnosticSeverity.Information
        );
      }
    }
  }

  private isCharacterLiteral(name: string): boolean {
    // Check if the name is a character literal like '+', '-', etc.
    return name.startsWith("'") && name.endsWith("'");
  }

  private isBuiltinFunction(name: string): boolean {
    const builtins = [
      "option",
      "ioption",
      "list",
      "nonempty_list",
      "separated_list",
      "separated_nonempty_list",
      "preceded",
      "terminated",
      "delimited",
    ];
    // Check both with and without parameters
    const baseName = name.split("(")[0];
    return builtins.includes(baseName);
  }

  private isLikelyToken(name: string): boolean {
    // Tokens often use uppercase or specific patterns
    const baseName = name.split("(")[0];
    return (
      /^[A-Z_]+$/.test(baseName) ||
      baseName.startsWith("t") ||
      baseName.startsWith("k") ||
      baseName.startsWith("TOKEN")
    );
  }

  private isCommonParameter(name: string): boolean {
    // Common parameter names used in parameterized rules
    const commonParams = [
      "X",
      "Y",
      "Z",
      "A",
      "B",
      "C",
      "item",
      "element",
      "separator",
      "value",
      "arg",
      "args",
      "param",
      "params",
      "list",
      "elem",
      "expr",
      "stmt",
    ];
    return commonParams.includes(name);
  }

  private addDiagnostic(
    range: Range,
    message: string,
    severity: DiagnosticSeverity
  ): void {
    this.diagnostics.push({
      severity,
      range,
      message,
      source: "lrama",
    });
  }
}

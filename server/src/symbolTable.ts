import { TextDocument } from "vscode-languageserver-textdocument";
import {
  Position,
  Range,
  DocumentSymbol,
  SymbolKind,
} from "vscode-languageserver/node";

export enum SymbolType {
  Token = "token",
  Type = "type",
  Rule = "rule",
  Nonterminal = "nonterminal",
  ParameterizedRule = "parameterized_rule",
  Union = "union",
  Start = "start",
}

export interface SymbolDefinition {
  range: Range;
  nameRange: Range;
}

export interface SymbolReference {
  range: Range;
}

export interface ParameterizedCall {
  range: Range;
  arguments: string[];
}

export interface Symbol {
  name: string;
  type: SymbolType;
  definition?: SymbolDefinition;
  references: SymbolReference[];
  parameterizedCalls?: ParameterizedCall[];
  parameters?: string[];
  typeTag?: string;
  isParameterized?: boolean; // Flag to distinguish parameterized symbols
}

export class SymbolTable {
  private symbols: Map<string, Symbol> = new Map();
  private parameterizedRules: Map<string, Symbol> = new Map(); // Separate storage for parameterized rules
  private startSymbol: string | undefined = undefined; // Start symbol name

  public setStartSymbol(name: string | undefined): void {
    this.startSymbol = name;
  }

  public getStartSymbol(): string | undefined {
    return this.startSymbol;
  }

  public addSymbol(
    name: string,
    type: SymbolType,
    definition?: SymbolDefinition
  ): Symbol {
    let symbol = this.symbols.get(name);

    if (!symbol) {
      symbol = {
        name,
        type,
        definition,
        references: [],
        parameterizedCalls: [],
      };
      this.symbols.set(name, symbol);
    } else if (definition && !symbol.definition) {
      symbol.definition = definition;
      symbol.type = type; // Update type when definition is added
    }

    return symbol;
  }

  public addParameterizedRuleDefinition(
    baseName: string,
    definition: SymbolDefinition,
    parameters: string[]
  ): Symbol {
    // Store parameterized rule separately
    let symbol = this.parameterizedRules.get(baseName);

    if (!symbol) {
      symbol = {
        name: baseName,
        type: SymbolType.ParameterizedRule,
        definition,
        references: [],
        parameterizedCalls: [],
        parameters,
        isParameterized: true,
      };
      this.parameterizedRules.set(baseName, symbol);
    } else {
      // Update existing symbol with definition
      symbol.definition = definition;
      symbol.type = SymbolType.ParameterizedRule;
      symbol.parameters = parameters;
      symbol.isParameterized = true;
    }

    return symbol;
  }

  public addReference(name: string, reference: SymbolReference): void {
    const symbol = this.symbols.get(name);
    if (symbol) {
      symbol.references.push(reference);
    } else {
      // Create a symbol without definition (forward reference)
      const newSymbol: Symbol = {
        name,
        type: SymbolType.Nonterminal,
        references: [reference],
        parameterizedCalls: [],
      };
      this.symbols.set(name, newSymbol);
    }
  }

  public addPrecedenceReference(
    name: string,
    reference: SymbolReference
  ): void {
    // Precedence references should link to tokens defined with %left, %right, %nonassoc
    // Check if the symbol exists (it should have been defined as a token)
    const symbol = this.symbols.get(name);
    if (symbol && symbol.type === SymbolType.Token) {
      // Add as a regular reference to the token
      symbol.references.push(reference);
    } else {
      // Create as a token reference (precedence tokens are implicitly tokens)
      const newSymbol: Symbol = {
        name,
        type: SymbolType.Token,
        references: [reference],
        parameterizedCalls: [],
      };
      this.symbols.set(name, newSymbol);
    }
  }

  public addParameterizedCall(baseName: string, call: ParameterizedCall): void {
    // Add to parameterized rules map
    let symbol = this.parameterizedRules.get(baseName);
    if (symbol) {
      if (!symbol.parameterizedCalls) {
        symbol.parameterizedCalls = [];
      }
      symbol.parameterizedCalls.push(call);
    } else {
      // Create a symbol for parameterized rule without definition yet
      const newSymbol: Symbol = {
        name: baseName,
        type: SymbolType.ParameterizedRule,
        references: [],
        parameterizedCalls: [call],
        isParameterized: true,
      };
      this.parameterizedRules.set(baseName, newSymbol);
    }
  }

  public getSymbol(name: string): Symbol | undefined {
    // First check parameterized rules
    const paramRule = this.parameterizedRules.get(name);
    if (paramRule) return paramRule;

    // Then check regular symbols
    return this.symbols.get(name);
  }

  public getSymbolAtPosition(
    document: TextDocument,
    position: Position
  ): Symbol | undefined {
    const offset = document.offsetAt(position);
    let bestMatch: Symbol | undefined = undefined;
    let bestMatchPriority = -1;

    // Check parameterized rules first (higher priority)
    for (const symbol of this.parameterizedRules.values()) {
      // Check definition
      if (symbol.definition) {
        const defStart = document.offsetAt(symbol.definition.nameRange.start);
        const defEnd = document.offsetAt(symbol.definition.nameRange.end);
        if (offset >= defStart && offset <= defEnd) {
          // Parameterized rule definition has highest priority
          const priority = 100;
          if (priority > bestMatchPriority) {
            bestMatch = symbol;
            bestMatchPriority = priority;
          }
        }
      }

      // Check parameterized calls
      if (symbol.parameterizedCalls) {
        for (const call of symbol.parameterizedCalls) {
          const callStart = document.offsetAt(call.range.start);
          const callEnd = document.offsetAt(call.range.end);
          if (offset >= callStart && offset <= callEnd) {
            // Parameterized calls navigate to parameterized definition
            const priority = 90;
            if (priority > bestMatchPriority) {
              bestMatch = symbol;
              bestMatchPriority = priority;
            }
          }
        }
      }
    }

    // Then check regular symbols
    for (const symbol of this.symbols.values()) {
      // Check definition
      if (symbol.definition) {
        const defStart = document.offsetAt(symbol.definition.nameRange.start);
        const defEnd = document.offsetAt(symbol.definition.nameRange.end);
        if (offset >= defStart && offset <= defEnd) {
          const priority = 50;
          if (priority > bestMatchPriority) {
            bestMatch = symbol;
            bestMatchPriority = priority;
          }
        }
      }

      // Check references
      for (const ref of symbol.references) {
        const refStart = document.offsetAt(ref.range.start);
        const refEnd = document.offsetAt(ref.range.end);
        if (offset >= refStart && offset <= refEnd) {
          const priority = 10;
          if (priority > bestMatchPriority) {
            bestMatch = symbol;
            bestMatchPriority = priority;
          }
        }
      }
    }

    return bestMatch;
  }

  public getDocumentSymbols(): DocumentSymbol[] {
    const symbols: DocumentSymbol[] = [];

    // Add parameterized rules
    for (const symbol of this.parameterizedRules.values()) {
      if (symbol.definition) {
        const kind = this.getSymbolKind(symbol.type);
        const docSymbol: DocumentSymbol = {
          name:
            symbol.name +
            (symbol.parameters ? `(${symbol.parameters.join(", ")})` : ""),
          detail: this.getSymbolDetail(symbol),
          kind: kind,
          range: symbol.definition.range,
          selectionRange: symbol.definition.nameRange,
        };
        symbols.push(docSymbol);
      }
    }

    // Add regular symbols
    for (const symbol of this.symbols.values()) {
      if (symbol.definition) {
        const kind = this.getSymbolKind(symbol.type);
        const docSymbol: DocumentSymbol = {
          name: symbol.name,
          detail: this.getSymbolDetail(symbol),
          kind: kind,
          range: symbol.definition.range,
          selectionRange: symbol.definition.nameRange,
        };
        symbols.push(docSymbol);
      }
    }

    return symbols;
  }

  private getSymbolKind(type: SymbolType): SymbolKind {
    switch (type) {
      case SymbolType.Token:
        return SymbolKind.Constant;
      case SymbolType.Type:
        return SymbolKind.TypeParameter;
      case SymbolType.Rule:
      case SymbolType.Nonterminal:
        return SymbolKind.Function;
      case SymbolType.ParameterizedRule:
        return SymbolKind.Method;
      case SymbolType.Union:
        return SymbolKind.Struct;
      case SymbolType.Start:
        return SymbolKind.Module;
      default:
        return SymbolKind.Variable;
    }
  }

  private getSymbolDetail(symbol: Symbol): string {
    let detail: string = symbol.type;

    if (symbol.parameters && symbol.parameters.length > 0) {
      detail += `(${symbol.parameters.join(", ")})`;
    }

    if (symbol.typeTag) {
      detail += ` <${symbol.typeTag}>`;
    }

    // Show usage statistics
    const refCount = symbol.references.length;
    const callCount = symbol.parameterizedCalls?.length || 0;

    if (refCount > 0 || callCount > 0) {
      const usages = [];
      if (refCount > 0) usages.push(`${refCount} refs`);
      if (callCount > 0) usages.push(`${callCount} calls`);
      detail += ` [${usages.join(", ")}]`;
    }

    return detail;
  }

  public getAllSymbols(): Symbol[] {
    return [
      ...Array.from(this.parameterizedRules.values()),
      ...Array.from(this.symbols.values()),
    ];
  }
}

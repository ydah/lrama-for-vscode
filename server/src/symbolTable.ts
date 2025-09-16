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

export interface Symbol {
  name: string;
  type: SymbolType;
  definition?: SymbolDefinition;
  references: SymbolReference[];
  parameters?: string[];
  typeTag?: string;
}

export class SymbolTable {
  private symbols: Map<string, Symbol> = new Map();

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
      };
      this.symbols.set(name, symbol);
    } else if (definition && !symbol.definition) {
      symbol.definition = definition;
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
      };
      this.symbols.set(name, newSymbol);
    }
  }

  public getSymbol(name: string): Symbol | undefined {
    return this.symbols.get(name);
  }

  public getSymbolAtPosition(
    document: TextDocument,
    position: Position
  ): Symbol | undefined {
    const offset = document.offsetAt(position);

    for (const symbol of this.symbols.values()) {
      // Check definition
      if (symbol.definition) {
        const defStart = document.offsetAt(symbol.definition.nameRange.start);
        const defEnd = document.offsetAt(symbol.definition.nameRange.end);
        if (offset >= defStart && offset <= defEnd) {
          return symbol;
        }
      }

      // Check references
      for (const ref of symbol.references) {
        const refStart = document.offsetAt(ref.range.start);
        const refEnd = document.offsetAt(ref.range.end);
        if (offset >= refStart && offset <= refEnd) {
          return symbol;
        }
      }
    }

    return undefined;
  }

  public getDocumentSymbols(): DocumentSymbol[] {
    const symbols: DocumentSymbol[] = [];

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

    return detail;
  }

  public getAllSymbols(): Symbol[] {
    return Array.from(this.symbols.values());
  }
}

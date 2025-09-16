import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  TextDocumentSyncKind,
  InitializeResult,
  Location,
  Range,
  Position,
  DefinitionParams,
  ReferenceParams,
  DocumentSymbol,
  SymbolKind,
  DocumentSymbolParams,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import { LramaParser } from "./parser";
import { SymbolTable, Symbol, SymbolType } from "./symbolTable";

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Symbol tables for each document
const symbolTables = new Map<string, SymbolTable>();

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      definitionProvider: true,
      referencesProvider: true,
      documentSymbolProvider: true,
    },
  };

  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }

  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log("Workspace folder change event received.");
    });
  }
});

// The content of a text document has changed
documents.onDidChangeContent((change) => {
  validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const text = textDocument.getText();
  const uri = textDocument.uri;

  // Parse the document and build symbol table
  const parser = new LramaParser();
  const symbolTable = parser.parse(text);
  symbolTables.set(uri, symbolTable);

  // You can also send diagnostics here
  const diagnostics = parser.getDiagnostics();
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

// Go to Definition
connection.onDefinition((params: DefinitionParams): Location[] | null => {
  const uri = params.textDocument.uri;
  const symbolTable = symbolTables.get(uri);

  if (!symbolTable) {
    return null;
  }

  const document = documents.get(uri);
  if (!document) {
    return null;
  }

  const position = params.position;
  const symbol = symbolTable.getSymbolAtPosition(document, position);

  if (!symbol || !symbol.definition) {
    return null;
  }

  return [
    {
      uri: uri,
      range: symbol.definition.range,
    },
  ];
});

// Find References
connection.onReferences((params: ReferenceParams): Location[] | null => {
  const uri = params.textDocument.uri;
  const symbolTable = symbolTables.get(uri);

  if (!symbolTable) {
    return null;
  }

  const document = documents.get(uri);
  if (!document) {
    return null;
  }

  const position = params.position;
  const symbol = symbolTable.getSymbolAtPosition(document, position);

  if (!symbol) {
    return null;
  }

  return symbol.references.map((ref) => ({
    uri: uri,
    range: ref.range,
  }));
});

// Document Symbols (for outline view)
connection.onDocumentSymbol(
  (params: DocumentSymbolParams): DocumentSymbol[] | null => {
    const uri = params.textDocument.uri;
    const symbolTable = symbolTables.get(uri);

    if (!symbolTable) {
      return null;
    }

    const document = documents.get(uri);
    if (!document) {
      return null;
    }

    return symbolTable.getDocumentSymbols();
  }
);

// Make the text document manager listen on the connection
documents.listen(connection);

// Listen on the connection
connection.listen();

# Change Log

All notable changes to the "lrama" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [v0.1.2] - 2025-09-18

### Changed

- Enhanced `LramaParser` and `SymbolTable` to support start symbol tracking and validation
- Enhanced `LramaParser` to skip warnings for reserved tokens in diagnostics
- Enhanced `LramaParser` to support named references after action blocks and character literals
- Enhanced `LramaParser` to support named references
- Enhanced `LramaParser` to support `%prec` and `%empty` directives in rule parsing
- Enhanced `LramaParser` to support parameterized rules and improve symbol handling
- Enhanced `parsePrecedenceDeclaration` to support token definitions with precedence
- Enhanced `LramaParser` to support parameterized rule context and improve argument parsing
- Implemented parameterized rule support in `LramaParser` and `SymbolTable`

## [v0.1.1] - 2025-09-16

### Fixed

- Fix not working LSP server features, such as Go to Definition and Find All References and Document Symbols and Diagnostics


## [v0.1.0] - 2025-09-16

### Added

- Add snippets for common Lrama constructs to speed up development
- Implement IntelliSense features including Go to Definition, Find All References, Document Symbols, and Diagnostics

### Changed

- Enhance syntax highlighting for better readability

## [v0.0.1] - 2024-11-02

### Added

- Initial release

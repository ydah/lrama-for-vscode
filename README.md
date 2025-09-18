# Lrama for Visual Studio Code

This extension provides comprehensive support for the [Lrama](https://github.com/ruby/lrama) parser generator in Visual Studio Code.
It offers syntax highlighting, convenient snippets, and advanced IntelliSense features powered by the Language Server Protocol (LSP) to enhance your Lrama development workflow.

## Features

### Syntax Highlighting

- Accurately highlights Lrama grammar, including directives, rules, action blocks, and comments, to improve code readability.

### Snippets

- A rich set of snippets is available for quickly scaffolding common Lrama constructs.
- For instance, typing `lrama-template` generates a complete grammar file template. Other snippets like `token`, `rule`, and `union` are also available to streamline declarations.

### IntelliSense (Language Server Features)

A dedicated language server analyzes your code to provide intelligent features.

- Go to Definition
  - Jump to the definition of a symbol by holding `Ctrl/Cmd` and clicking it.
  - Also accessible with the `F12` key.
- Find All References
  - Find all references to a symbol. Use the shortcut `Ctrl/Cmd` and clicking it.
  - Also accessible with the `Shift+F12` key.
- Hover
  - View detailed information about symbols by hovering over them with your mouse.
- Auto Completion
  - Get context-aware suggestions as you type, including rule names, token names, and directives.
- Document Symbols (Outline)
  - Get a complete outline of your grammar file in the Explorer, showing all rule definitions for quick navigation.
- Diagnostics
  - The server identifies potential issues in your code, such as references to undefined symbols or rules that are defined but never used.

## License

This extension is released under the [MIT License](./LICENSE.txt).

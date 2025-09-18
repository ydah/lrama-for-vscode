# Lrama for Visual Studio Code

Lrama for Visual Studio Code is a powerful extension that provides comprehensive support for the [Lrama](https://github.com/ruby/lrama) parser generator.

It offers advanced syntax highlighting, a rich set of snippets, and IntelliSense features powered by the Language Server Protocol (LSP) to dramatically improve your Lrama development workflow.

## Features

### Syntax Highlighting
- Accurately highlights Lrama grammar, including directives, rules, action blocks, and comments, to improve code readability.

### Snippets

  - Simply type `lrama-template` to generate a complete grammar file template.
  - Numerous other snippets for common constructs like `%token`, `%rule`, and `%union` are available to streamline your development process.

| Prefix                    | Description                                  |
| ------------------------- | -------------------------------------------- |
| `lrama-template`          | A complete template for a Lrama grammar file |
| `rule`                    | Defines a parameterized rule                 |
| `token`                   | Declares a token with a type                 |
| `type`                    | Declares the type for a non-terminal         |
| `union`                   | Defines a union type                         |
| `option`                  | Makes an element optional (zero or one)      |
| `list`                    | A list of elements (zero or more)            |
| `nonempty-list`           | A non-empty list (one or more)               |
| `separated-list`          | A list with a separator                      |
| `separated-nonempty-list` | A non-empty list with a separator            |

### IntelliSense (Language Server Features)

This extension includes a dedicated language server that analyzes your code to provide the following intelligent features:

- Go to Definition
  - Jump to a symbol's definition by holding `Ctrl/Cmd` and clicking, or by pressing `F12`.
- Find All References
  - Find all references to a symbol by pressing `Shift+F12`.
- Document Symbols (Outline View)
  - Get a complete outline of your grammar file in the Explorer, showing all rule definitions for quick navigation.
- Hover Information
  - Hover over a symbol or directive to see detailed information about its definition and usage.
- Completion
  - Get intelligent suggestions for directives, defined symbols, and built-in functions as you type, triggered by characters like `%` and `(`.
- Diagnostics
  - Identifies potential issues in your code, such as references to undefined symbols or rules that are defined but never used, and displays warnings.


## License

This extension is released under the [MIT License](https://www.google.com/search?q=./LICENSE.txt).

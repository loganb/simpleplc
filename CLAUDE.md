# Claude Code Instructions

## Notes Directory

- Maintain a `claude/` subdirectory for working notes.
- Keep `claude/overview.md` up to date with the project's purpose, design, and features. Update it as understanding evolves.
- For each new task, agree on a short name with the user, then create `claude/<task-name>.md` containing:
  1. The design as discussed during planning.
  2. An implementation plan written **before** starting implementation.
- Ask questions, especially when starting in a new session. I'll talk to you like you have all the context. If it sounds like you're missing something and reading the docs in the claude/ directory don't resolve the ambiguity, ask me a question and then update the claude/overview.md so you have the relevent context next time
- When starting a new task and I specify how something should work. Take a moment to ask yourself, "does this seem reasonable? What's an alternative implementation?" If you have a quick answer, then ask yourself, "is this better?" If it seems likely it is, ask me about my design choices. 
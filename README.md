# Daily Task Mover

[ English | [简体中文](https://github.com/moziar/obsidian-daily-task-mover/blob/main/docs/README_zh.md) ]


Move a task (with all its rich-text sub-items) from the current daily note or Journals entry to the previous or next period’s note, and re-position it under the same heading it came from in the source note.

## Features

- Move tasks via an inline icon at the end of each top-level task line, or via the command palette
- Customizable left-click / right-click actions: popup menu, move to previous period, move to next period, or no action
- Whole-task move: a task block including sub-items (nested lists, embeds, references, etc.) moves together
- Heading re-positioning: appended at the end of the matching same-level heading in the target note; auto-creates the heading if the target note does not have it
- Conflict detection: shows a Notice and skips the move if the target note already contains the same task line
- Format compatibility: supports any moment.js date format configured in the Daily Notes plugin (e.g. `YYYY-MM-DD`, `YYYY.MM.DD`, `YYYY/MM/DD`, nested `YYYY/YYYY-MM/YYYY-MM-DD`, etc.)

## Prerequisites

- Enable either the built-in **Daily notes** core plugin or the [**Journals** community plugin](https://github.com/srg-kostyrko/obsidian-journal) (version 3.0 or later).
- For Daily Notes, the configured date format, folder, and template determine how notes are recognized and created.
- For Journals, open a journal entry. Tasks stay in that journal, and Journals handles the destination note's location, templates, and any creation prompts. Daily, weekly, monthly, quarterly, yearly, and custom journals are supported. Moves use the day before the current period starts or the day after it ends, so Journals can find the adjacent period.
- **Note provider** defaults to **Automatic**: Journals is preferred when its API is available, otherwise Daily Notes is used. One provider handles the entire vault; an unrecognized note does not trigger a fallback to another provider. You can explicitly select Daily Notes or Journals to override the automatic choice. Journals can be used with the Daily Notes core plugin disabled.

Daily Notes moves by one day; Journals moves by one period in the source journal.

## Usage

1. Open a daily note or Journals entry
2. Hover over a top-level task — an arrow icon appears at the end of the line
3. Click (or right-click, depending on your settings) the icon to move the task to the previous or next period, or use the corresponding command in the command palette

## Settings

- **Note provider**: choose `Automatic` (default), `Daily / Periodic notes`, or `Journals`. The dropdown marks providers as unavailable (not installed), disabled, or unsupported version; only compatible, enabled providers can be selected. If a saved selection becomes unavailable, that selection is preserved and task moves stop; enable the provider again or choose Automatic. Explicit selections never fall back to another provider.

- **Left click action** / **Right click action**: choose what happens when clicking the inline task icon — `Popup menu`, `Move to previous period`, `Move to next period`, or `No action`
- **Enable previous period** / **Enable next period**: control whether the corresponding options appear in the popup menu. These are editable only when the left or right click action is set to `Popup menu`

## License

MIT

## Adding a note provider

Implement a `NoteProviderDefinition` in `src/noteProviders` and add it to the registry in `src/noteProviders/index.ts`. Registry order determines automatic preference and supplies the settings choices. Each adapter reports availability, identifies the source note’s period, and creates or finds a destination note; adapters may also subscribe to changes. The shared resolver handles selection, caching, and provider changes, so task movement does not need plugin-specific branches.

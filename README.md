# Daily Task Mover

[ English | [简体中文](https://github.com/moziar/obsidian-daily-task-mover/blob/main/docs/README_zh.md) ]


Move a task (with all its rich-text sub-items) from the current daily note to the previous or next day's daily note, and re-position it under the same heading it came from in the source note.

## Features

- Move tasks via an inline icon at the end of each top-level task line, or via the command palette
- Customizable left-click / right-click actions: popup menu, move to previous day, move to next day, or no action
- Whole-task move: a task block including sub-items (nested lists, embeds, references, etc.) moves together
- Heading re-positioning: appended at the end of the matching same-level heading in the target note; auto-creates the heading if the target note does not have it
- Conflict detection: shows a Notice and skips the move if the target note already contains the same task line
- Format compatibility: supports any moment.js date format configured in the Daily Notes plugin (e.g. `YYYY-MM-DD`, `YYYY.MM.DD`, `YYYY/MM/DD`, nested `YYYY/YYYY-MM/YYYY-MM-DD`, etc.)

## Prerequisites

- **The built-in "Daily notes" core plugin must be enabled**: this plugin relies on its settings (date format, folder, template) to recognize and locate daily notes. Confirm "Daily notes" is turned on under `Settings → Core plugins`.

## Usage

1. Open any daily note
2. Hover over a top-level task — an arrow icon appears at the end of the line
3. Click (or right-click, depending on your settings) the icon to move the task to the previous or next day, or use the corresponding command in the command palette

To move several tasks, select their lines in editing mode. Use a move command or click a move icon inside the selection.
A selected parent includes all its children, even when the selection ends before them. Each task moves only once.
If any selected task conflicts with a destination task, the plugin stops the whole move before writing either note.

## Settings

- **Left click action** / **Right click action**: choose what happens when clicking the inline task icon — `Popup menu`, `Move to previous day`, `Move to next day`, or `No action`
- **Enable previous day** / **Enable next day**: control whether the corresponding options appear in the popup menu. These are editable only when the left or right click action is set to `Popup menu`

## License

MIT
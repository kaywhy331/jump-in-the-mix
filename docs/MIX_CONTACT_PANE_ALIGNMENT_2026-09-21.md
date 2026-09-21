# Mix workspace alignment with Contacts

The owner clarified that the Mix workspace should follow Contacts' pane composition. The previous rounded workspace below a full-width page header did not match that structure.

Mixes now places its heading and creation/tools controls in the left directory. Search and a filter sheet sit above compact rows with selected-row highlighting, channel-independent Mix icons and personal favorites. Secondary destinations remain available in More. The center shows Beat preview/editing; the related start, people and Journey information uses flat section headings and rows.

The workspace meets the application rail directly, fills the available page and uses Contacts' pane widths and vertical dividers. At 1200px the directory is 360px wide and details appear below the center content. At 1700px the directory becomes 440px and the right context pane is 340px. Very wide screens retain a bounded reading column. Below 1200px, the existing Mixes/Beats/Details controls switch between mounted panes so drafts survive. This is a Mix-specific adaptation of the Contacts directory/detail navigation. Original design exports and Contacts behavior are unchanged.

The change affects layout and directory controls only. Favorites, ownership boundaries, saves, activation, scheduling and Journey execution retain their existing behavior. No database migration is required.

Verification evidence is retained in `.artifacts/mix-contact-panes-20260921/`. All seven browser scenarios passed: search/pagination, favorites, preview/edit/save with unsaved-change protection, the unified ready-made entry, responsive layout, direct Contacts/Mix pane-boundary comparisons and keyboard filter/tool behavior. The responsive checks cover 21 widths from 320px to 3840px in both themes, with scoped Axe scans at five representative widths. Screenshots were compared with Contacts and the supplied export. The production build, its TypeScript check and static schema/syntax/import/server-action validation passed. Two cold-compilation timing failures and one overly strict test label lookup were resolved on the focused three-case rerun. Live verification follows deployment.

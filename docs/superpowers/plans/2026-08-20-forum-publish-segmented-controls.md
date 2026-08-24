# Forum Publish Segmented Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the publish-page administrator radio rows with compact segmented controls.

**Architecture:** Keep existing `postType`, `featureType`, event handlers, permission guard and conditional registration fields. Change only administrator-only WXML structure and LESS visual treatment.

**Tech Stack:** WeChat Mini Program WXML, LESS, TDesign Mini Program, Node test runner.

---

### Task 1: Capture the desired UI structure

**Files:**
- Modify: `test/forum-functional-posts.spec.mjs`

- [ ] Add a failing static UI test requiring two `publish-segmented` groups, labels `展示位置` and `帖子类型`, the selected-state class binding, and the existing `REGISTRATION` conditional block.
- [ ] Run `node --test test/forum-functional-posts.spec.mjs` and confirm the new assertion fails because the old radio markup remains.

### Task 2: Replace presentation markup and styles

**Files:**
- Modify: `packageForum/publish/index.wxml`
- Modify: `packageForum/publish/index.less`

- [ ] Replace each administrator-only radio group with a two-option `t-radio-group` retaining the existing values and change handlers, but style each option as an equal-width segment.
- [ ] Add the selected/unselected segmented styles using existing theme variables; remove the old stacked-row spacing.
- [ ] Keep capacity/deadline conditional on `featureType === 'REGISTRATION'` and move the pin switch beneath a `发布设置` label.
- [ ] Run `node --test test/forum-functional-posts.spec.mjs` and confirm all tests pass.

### Task 3: Verify rendered result

**Files:**
- No source files

- [ ] Run `npx eslint packageForum/publish/index.js && git diff --check`.
- [ ] Recompile the Mini Program and inspect the publish page in WeChat Developer Tools; confirm both selectors are compact, the activity fields expand only for `活动报名`, and the pin switch remains available.

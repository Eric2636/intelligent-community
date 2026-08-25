# Forum Publish Segmented Controls Design

## Goal

Replace the administrator-only stacked radio rows on the Mini Program publish page with compact, two-option segmented controls.

## Interaction

- `展示位置` presents `普通帖` and `社区公告` in one equal-width segmented group.
- `活动类型` presents `内容` and `活动报名` in a second segmented group.
- The existing `postType` and `featureType` values remain unchanged; only the presentation and labels change.
- Selecting `活动报名` expands the existing capacity and deadline fields.
- `置顶` is grouped under `发布设置`, keeping it visually separate from classification choices.
- The whole section remains visible only to administrators; ordinary users continue to see the title, body, media and publish controls only.

## Visual rules

- Use existing TDesign radio semantics and a custom segmented visual treatment so accessibility and value handling remain unchanged.
- The selected segment uses the shared primary color; unselected segments use the existing section background and muted border.
- Remove the per-option horizontal dividers and reduce vertical height.

## Verification

- Extend the publish-page static UI test to assert the segmented-control markup and the conditional activity fields.
- Inspect the Mini Program in WeChat Developer Tools at the current iPhone simulator size.

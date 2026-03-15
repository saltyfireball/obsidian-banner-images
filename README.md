# Banner Images for Obsidian

![works on my machine](https://img.shields.io/badge/worksonmymachien-on%20my%20machine-fff?style=flat&logo=apple&logoColor=FFFFFF&logoSize=FF6188&label=works&labelColor=5B595C&color=A9DC76) ![Cache](https://img.shields.io/badge/cache-have%20you%20cleared%20it-fff?style=flat&logo=cachet&logoColor=FFFFFF&label=cache&labelColor=5B595C&color=FFD866) ![Meeting](https://img.shields.io/badge/meeting-could%20be%20an%20email-fff?style=flat&logo=googlecalendar&logoColor=FFFFFF&label=meeting&labelColor=5B595C&color=FF6188) ![All Your Base](https://img.shields.io/badge/all%20your%20base-are%20belong%20to%20us-fff?style=flat&logo=retroarch&label=all%20your%20base&labelColor=5B595C&color=5C7CFA) ![Spam Filter](https://img.shields.io/badge/spam%20filter-on%20vacation-fff?style=flat&logo=protonmail&logoColor=FFFFFF&label=spam%20filter&labelColor=5B595C&color=A9DC76) ![Node Modules](https://img.shields.io/badge/node__modules-heavier%20than%20sun-fff?style=flat&logo=nodedotjs&logoColor=FFFFFF&label=node_modules&labelColor=5B595C&color=FFD866) ![TODO](<https://img.shields.io/badge/todo-fix%20later%20(2019)-fff?style=flat&logo=todoist&logoColor=FFFFFF&label=TODO&labelColor=5B595C&color=5C7CFA>) ![Tutorial](https://img.shields.io/badge/tutorial-rest%20of%20the%20owl-fff?style=flat&logo=udemy&logoColor=FFFFFF&label=tutorial&labelColor=5B595C&color=A9DC76) ![Diet](https://img.shields.io/badge/diet-pizza%20powered-fff?style=flat&logo=pizzahut&logoColor=FFFFFF&label=diet&labelColor=5B595C&color=A9DC76)

<p align="center">
  <img src="assets/header.svg" width="600" />
</p>

Display banner images at the top of your notes using frontmatter fields.

## Features

- **Frontmatter-driven** -- Add a single field to your note's frontmatter and a banner image appears at the top
- **Multiple image sources** -- Use vault-relative paths, wikilink-style paths (`[[image.png]]`), or external URLs
- **Customizable height** -- Set banner height globally or per-note via frontmatter
- **Opacity control** -- Adjust banner transparency globally or per-note
- **Vertical positioning** -- Control which part of the image is shown (top, center, bottom, or percentage)
- **Fit modes** -- Choose how the image fills the banner: cover (default), fit to height, or fit to width
- **Gradient transparency** -- Smooth fade from full opacity at the top to your chosen opacity at the bottom
- **Command palette** -- Insert banner frontmatter into any note via the command palette
- **Works in all views** -- Renders in both Reading View and Live Preview/Source mode
- **Mobile support** -- Full-width banners on mobile devices

## Installation

### From Obsidian Community Plugins

**Might not be approved yet**

1. Open Obsidian Settings
2. Go to Community Plugins and disable Safe Mode
3. Click Browse and search for "Banner Images"
4. Install and enable the plugin

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](../../releases/latest)
2. Create a folder called `banner-images` inside your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into that folder
4. Enable the plugin in Obsidian Settings > Community Plugins

## Usage

### Quick Start

1. Enable the plugin in settings
2. Add `banner_image` to your note's frontmatter manually, or use the command palette (`Ctrl/Cmd+P`) and run **Banner Images: Insert banner frontmatter** to insert all available fields automatically:

```yaml
---
banner_image: path/to/your/image.png
---
```

The command will add only missing banner fields if frontmatter already exists.

### Frontmatter Fields

| Field             | Type          | Default | Description                                                                       |
| ----------------- | ------------- | ------- | --------------------------------------------------------------------------------- |
| `banner_image`    | string        | --      | Path to image file (required). Also accepts `backdrop` or `banner` as field names |
| `banner_height`   | number        | 200     | Height of the banner in pixels                                                    |
| `banner_opacity`  | number        | 1       | Opacity from 0 (transparent) to 1 (fully visible)                                 |
| `banner_offset`   | string/number | center  | Vertical position: `top`, `center`, `bottom`, or a percentage like `20%`          |
| `banner_gradient` | boolean       | false   | When true, fades from full opacity at top to selected opacity at bottom           |
| `banner_fit`      | string        | none    | Image fit mode: `none` (cover), `fit_height`, or `fit_width`                     |

### Examples

**Basic banner:**

```yaml
---
banner_image: attachments/header.jpg
---
```

**Full customization:**

```yaml
---
banner_image: attachments/landscape.png
banner_height: 300
banner_opacity: 0.7
banner_offset: 30%
banner_gradient: true
banner_fit: fit_width
---
```

**Using a URL:**

```yaml
---
banner_image: https://example.com/image.jpg
banner_height: 250
---
```

**Using wikilink syntax:**

```yaml
---
banner_image: "[[my-banner.png]]"
---
```

### Fit Modes

The `banner_fit` field controls how the image is sized within the banner area:

- **`none`** (default) -- The image covers the entire banner area. Parts of the image may be cropped to fill the space.
- **`fit_height`** -- The image scales so its full height is visible within `banner_height`. The image is centered horizontally, and the sides may be cropped if the image is wider than the banner area.
- **`fit_width`** -- The image scales so its full width matches the banner width. Resizing the window effectively zooms in or out. The top/bottom may be cropped based on `banner_offset`.

### Supported Image Formats

- Vault-relative paths: `attachments/banner.png`
- Wikilink-style paths: `[[image.png]]`
- External URLs: `https://example.com/image.png`
- All common image formats: PNG, JPG, GIF, WebP, SVG

## Settings

Access settings via Obsidian Settings > Banner Images:

- **Enable banner images** -- Master toggle for the feature
- **Default height** -- Default banner height in pixels (used when `banner_height` is not set in frontmatter)
- **Default opacity** -- Default transparency level (used when `banner_opacity` is not set)
- **Gradient transparency** -- Enable gradient fade by default
- **Default vertical position** -- Default image positioning (used when `banner_offset` is not set)
- **Default fit mode** -- Default image fit behavior (used when `banner_fit` is not set)

## Compatibility

This plugin uses the `banner_image` frontmatter key by default. For compatibility with other banner plugins, it also reads the `backdrop` and `banner` fields.

## Cross-Plugin API

This plugin exposes its default settings so that other plugins (such as export tools) can read the user's configured defaults. The API is accessible via the standard Obsidian plugin registry pattern:

```typescript
// Access from another plugin
const bannerPlugin = (app as any).plugins?.plugins?.["banner-images"];
const defaults = bannerPlugin?.api?.getDefaults();
```

The `getDefaults()` method returns an object with the current default settings:

| Property   | Type    | Description                                              |
| ---------- | ------- | -------------------------------------------------------- |
| `height`   | number  | Default banner height in pixels                          |
| `opacity`  | number  | Default opacity (0 to 1)                                 |
| `offset`   | string  | Default vertical position (e.g. "center", "30%")         |
| `gradient` | boolean | Whether gradient transparency is enabled by default      |
| `fit`      | string  | Default fit mode ("none", "fit_height", or "fit_width")  |

If the banner-images plugin is not installed or not enabled, callers should provide their own fallback defaults. Always use optional chaining when accessing the API.

## License

This plugin is released under the [MIT License](LICENSE).

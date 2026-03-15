import {
	App,
	Editor,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	WorkspaceLeaf,
} from "obsidian";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

interface BannerSettings {
	enabled: boolean;
	defaultHeight: number;
	defaultOpacity: number;
	defaultOffset: string;
	defaultGradient: boolean;
}

const DEFAULT_SETTINGS: BannerSettings = {
	enabled: false,
	defaultHeight: 200,
	defaultOpacity: 1,
	defaultOffset: "center",
	defaultGradient: false,
};

// ---------------------------------------------------------------------------
// Banner config parsed from frontmatter
// ---------------------------------------------------------------------------

interface BannerConfig {
	image: string;
	height: number;
	opacity: number;
	offset: string;
	gradient: boolean;
}

// ---------------------------------------------------------------------------
// Public API -- accessible by other plugins via app.plugins.plugins['banner-images']
// ---------------------------------------------------------------------------

export interface BannerImagesAPI {
	/** Current default settings configured by the user. */
	getDefaults(): {
		height: number;
		opacity: number;
		offset: string;
		gradient: boolean;
	};
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export default class BannerImagesPlugin extends Plugin {
	settings!: BannerSettings;
	private active = false;
	private eventRefs: Array<() => void> = [];
	private metadataHandler: ((file: TFile) => void) | null = null;
	private renderDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private pendingRenderAll = false;

	/** Public API for cross-plugin communication. */
	api: BannerImagesAPI = {
		getDefaults: () => ({
			height: this.settings.defaultHeight,
			opacity: this.settings.defaultOpacity,
			offset: this.settings.defaultOffset,
			gradient: this.settings.defaultGradient,
		}),
	};

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new BannerSettingTab(this.app, this));

		this.addCommand({
			id: "insert-banner-frontmatter",
			name: "Insert banner frontmatter",
			editorCallback: (editor: Editor) => {
				this.insertBannerFrontmatter(editor);
			},
		});

		if (this.settings.enabled) {
			this.startBanners();
		}
	}

	onunload() {
		this.stopBanners();
	}

	async loadSettings() {
		const saved = (await this.loadData()) as Partial<BannerSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// -------------------------------------------------------------------
	// Frontmatter insertion
	// -------------------------------------------------------------------

	private insertBannerFrontmatter(editor: Editor): void {
		const bannerKeys = [
			"banner_image",
			"banner_height",
			"banner_opacity",
			"banner_offset",
			"banner_gradient",
		];

		const content = editor.getValue();
		const hasFrontmatter =
			content.startsWith("---\n") || content.startsWith("---\r\n");

		if (hasFrontmatter) {
			const endMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
			if (!endMatch) {
				new Notice("Could not parse existing frontmatter");
				return;
			}

			const existing = endMatch[1];
			const missingKeys = bannerKeys.filter(
				(key) => !new RegExp(`^${key}\\s*:`, "m").test(existing)
			);

			if (missingKeys.length === 0) {
				new Notice("Banner frontmatter already exists");
				return;
			}

			const insertion = missingKeys
				.map((key) => `${key}: `)
				.join("\n");

			// Insert before the closing ---
			const endIndex = content.indexOf("\n---", 4);
			const insertPos = editor.offsetToPos(endIndex);
			editor.replaceRange("\n" + insertion, insertPos);
			new Notice(`Inserted ${missingKeys.length} banner field(s)`);
		} else {
			const block =
				"---\n" +
				bannerKeys.map((key) => `${key}: `).join("\n") +
				"\n---\n";
			editor.replaceRange(block, { line: 0, ch: 0 });
			new Notice("Inserted banner frontmatter");
		}
	}

	// -------------------------------------------------------------------
	// Lifecycle
	// -------------------------------------------------------------------

	startBanners(): void {
		this.active = true;
		this.registerBannerEvents();
		this.app.workspace.onLayoutReady(() => {
			this.renderAllBanners();
		});
	}

	stopBanners(): void {
		this.active = false;
		this.unregisterBannerEvents();
		if (this.renderDebounceTimer) {
			clearTimeout(this.renderDebounceTimer);
			this.renderDebounceTimer = null;
		}
		// Remove all existing banners and classes
		document.querySelectorAll(".bi-banner-container").forEach((el) => el.remove());
		document.querySelectorAll(".bi-has-banner").forEach((el) => el.classList.remove("bi-has-banner"));
		document.querySelectorAll(".bi-has-banner-scroll").forEach((el) => {
			el.classList.remove("bi-has-banner-scroll");
			const cmScroller = el.querySelector<HTMLElement>(".cm-scroller");
			if (cmScroller) {
				cmScroller.setCssStyles({ overflow: "", height: "" });
			}
		});
	}

	// -------------------------------------------------------------------
	// Debounced rendering
	// -------------------------------------------------------------------

	private debouncedRender(renderAll = false): void {
		if (renderAll) {
			this.pendingRenderAll = true;
		}
		if (this.renderDebounceTimer) {
			clearTimeout(this.renderDebounceTimer);
		}
		this.renderDebounceTimer = setTimeout(() => {
			this.renderDebounceTimer = null;
			if (this.pendingRenderAll) {
				this.pendingRenderAll = false;
				this.renderAllBanners();
			} else {
				this.renderBannerForActiveLeaf();
			}
		}, 50);
	}

	// -------------------------------------------------------------------
	// Events
	// -------------------------------------------------------------------

	private registerBannerEvents(): void {
		const fileOpenRef = this.app.workspace.on("file-open", (file) => {
			if (file) this.debouncedRender();
		});
		this.registerEvent(fileOpenRef);

		const layoutRef = this.app.workspace.on("layout-change", () => {
			this.debouncedRender(true);
		});
		this.registerEvent(layoutRef);

		const leafRef = this.app.workspace.on("active-leaf-change", () => {
			this.debouncedRender();
		});
		this.registerEvent(leafRef);

		this.metadataHandler = (file: TFile) => {
			this.renderBannerForFile(file);
		};
		this.app.metadataCache.on("changed", this.metadataHandler);
		this.eventRefs.push(() => {
			if (this.metadataHandler) {
				this.app.metadataCache.off("changed", this.metadataHandler);
			}
		});
	}

	private unregisterBannerEvents(): void {
		this.eventRefs.forEach((cleanup) => cleanup());
		this.eventRefs = [];
	}

	// -------------------------------------------------------------------
	// Rendering
	// -------------------------------------------------------------------

	private renderAllBanners(): void {
		if (!this.active) return;
		this.app.workspace.iterateAllLeaves((leaf) => {
			this.renderBannerForLeaf(leaf);
		});
	}

	private renderBannerForActiveLeaf(): void {
		if (!this.active) return;
		const leaf = this.app.workspace.getMostRecentLeaf();
		if (leaf) this.renderBannerForLeaf(leaf);
	}

	private renderBannerForFile(file: TFile): void {
		if (!this.active) return;
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (view.getViewType() === "markdown") {
				const mdView = view as MarkdownView;
				if (mdView.file?.path === file.path) {
					this.renderBannerForLeaf(leaf);
				}
			}
		});
	}

	private findBannerInsertPoint(
		viewContent: HTMLElement,
		mode: "source" | "preview"
	): { container: HTMLElement; insertBefore: Element | null } | null {
		if (mode === "source") {
			const sourceView = viewContent.querySelector<HTMLElement>(".markdown-source-view");
			if (sourceView) {
				sourceView.classList.add("bi-has-banner-scroll");
				return { container: sourceView, insertBefore: sourceView.firstElementChild };
			}
		} else {
			const previewView = viewContent.querySelector<HTMLElement>(".markdown-preview-view");
			if (previewView) {
				return { container: previewView, insertBefore: previewView.firstElementChild };
			}
			const readingView = viewContent.querySelector<HTMLElement>(".markdown-reading-view");
			if (readingView) {
				return { container: readingView, insertBefore: readingView.firstElementChild };
			}
		}
		return { container: viewContent, insertBefore: viewContent.firstElementChild };
	}

	private renderBannerForLeaf(leaf: WorkspaceLeaf): void {
		if (!this.active) return;

		const view = leaf.view;
		if (view.getViewType() !== "markdown") return;

		const mdView = view as MarkdownView;
		const file = mdView.file;
		if (!file) return;

		const contentEl = view.containerEl;
		if (!contentEl) return;

		const viewContent = contentEl.querySelector<HTMLElement>(".view-content");
		if (!viewContent) return;

		// Remove existing banners from this view
		contentEl.querySelectorAll(".bi-banner-container").forEach((el) => el.remove());

		const config = this.getBannerConfig(this.app, file);

		if (!config) {
			viewContent.classList.remove("bi-has-banner");
			const sourceView = viewContent.querySelector<HTMLElement>(".markdown-source-view");
			if (sourceView) {
				sourceView.classList.remove("bi-has-banner-scroll");
				const cmScroller = sourceView.querySelector<HTMLElement>(".cm-scroller");
				if (cmScroller) {
					cmScroller.setCssStyles({ overflow: "", height: "" });
				}
			}
			return;
		}

		viewContent.classList.add("bi-has-banner");

		const imageUrl = this.resolveImageUrl(this.app, config.image, file.path);
		const mode = mdView.getMode();
		const insertPoint = this.findBannerInsertPoint(viewContent, mode);
		if (!insertPoint) return;

		const bannerEl = this.createBannerElement(config, imageUrl);
		insertPoint.container.insertBefore(bannerEl, insertPoint.insertBefore);
	}

	// -------------------------------------------------------------------
	// Frontmatter parsing
	// -------------------------------------------------------------------

	private getBannerConfig(app: App, file: TFile): BannerConfig | null {
		if (!this.active) return null;

		const cache = app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (!frontmatter) return null;

		const bannerRaw: unknown = frontmatter.banner_image || frontmatter.backdrop || frontmatter.banner;
		if (!bannerRaw || typeof bannerRaw !== "string") return null;
		const bannerImage: string = bannerRaw;

		const height =
			typeof frontmatter.banner_height === "number"
				? frontmatter.banner_height
				: this.settings.defaultHeight;

		const opacity =
			typeof frontmatter.banner_opacity === "number"
				? Math.min(1, Math.max(0, frontmatter.banner_opacity))
				: this.settings.defaultOpacity;

		const offset = this.parseOffset(
			frontmatter.banner_offset ?? frontmatter.banner_position,
			this.settings.defaultOffset
		);

		const gradient = this.parseGradient(
			frontmatter.banner_gradient,
			this.settings.defaultGradient
		);

		return { image: bannerImage, height, opacity, offset, gradient };
	}

	private parseGradient(value: unknown, defaultValue: boolean): boolean {
		if (value === undefined || value === null) return defaultValue;
		if (typeof value === "boolean") return value;
		if (typeof value === "string") {
			const lower = value.toLowerCase().trim();
			return lower === "true" || lower === "yes" || lower === "1";
		}
		return defaultValue;
	}

	private parseOffset(value: unknown, defaultValue: string): string {
		if (value === undefined || value === null) return defaultValue;

		if (typeof value === "number") {
			const clamped = Math.min(100, Math.max(0, value));
			return `${clamped}%`;
		}

		if (typeof value === "string") {
			const lower = value.toLowerCase().trim();
			if (lower === "top" || lower === "center" || lower === "bottom") return lower;
			if (lower.endsWith("%")) {
				const num = parseFloat(lower);
				if (!isNaN(num)) {
					const clamped = Math.min(100, Math.max(0, num));
					return `${clamped}%`;
				}
			}
			if (lower.endsWith("px")) return lower;
		}

		return defaultValue;
	}

	// -------------------------------------------------------------------
	// Image URL resolution
	// -------------------------------------------------------------------

	private resolveImageUrl(app: App, imagePath: string, sourcePath: string): string {
		if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
			return imagePath;
		}
		if (imagePath.startsWith("data:")) return imagePath;

		let cleanPath = imagePath;
		if (cleanPath.startsWith("[[") && cleanPath.endsWith("]]")) {
			cleanPath = cleanPath.slice(2, -2);
		}

		const file = app.metadataCache.getFirstLinkpathDest(cleanPath, sourcePath);
		if (file) return app.vault.getResourcePath(file);

		const directFile = app.vault.getAbstractFileByPath(cleanPath);
		if (directFile instanceof TFile) {
			return app.vault.getResourcePath(directFile);
		}

		return imagePath;
	}

	// -------------------------------------------------------------------
	// DOM creation
	// -------------------------------------------------------------------

	private createBannerElement(config: BannerConfig, imageUrl: string): HTMLElement {
		const container = createDiv({ cls: "bi-banner-container" });
		const banner = container.createDiv({ cls: "bi-banner" });
		banner.setCssProps({
			"--bi-bg-image": `url("${imageUrl}")`,
			"--bi-height": `${config.height}px`,
			"--bi-bg-position": `center ${config.offset}`,
		});

		if (config.gradient) {
			banner.setCssProps({
				"--bi-opacity": "1",
				"--bi-mask": `linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,${config.opacity}) 100%)`,
			});
			banner.classList.add("bi-banner-gradient");
		} else {
			banner.setCssProps({ "--bi-opacity": String(config.opacity) });
		}

		return container;
	}
}

// ---------------------------------------------------------------------------
// Settings Tab
// ---------------------------------------------------------------------------

function updateSliderProgress(
	slider: HTMLInputElement,
	value: number,
	min: number,
	max: number
): void {
	const progress = ((value - min) / (max - min)) * 100;
	slider.style.setProperty("--slider-progress", `${progress}%`);
}

class BannerSettingTab extends PluginSettingTab {
	plugin: BannerImagesPlugin;

	constructor(app: App, plugin: BannerImagesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("p", {
			text: "Display banner images at the top of notes based on frontmatter configuration.",
			cls: "setting-item-description",
		});

		const settings = this.plugin.settings;

		// Enable/disable toggle
		new Setting(containerEl)
			.setName("Enable banner images")
			.setDesc("Display banner images in notes that have banner frontmatter fields.")
			.addToggle((toggle) =>
				toggle.setValue(settings.enabled).onChange(async (value) => {
					settings.enabled = value;
					await this.plugin.saveSettings();
					if (value) {
						this.plugin.startBanners();
					} else {
						this.plugin.stopBanners();
					}
				})
			);

		// Default height
		new Setting(containerEl)
			.setName("Default height")
			.setDesc("Default banner height in pixels when not specified in frontmatter.")
			.addText((text) =>
				text
					.setPlaceholder("200")
					.setValue(String(settings.defaultHeight))
					.onChange(async (value) => {
						const parsed = parseInt(value, 10);
						settings.defaultHeight = isNaN(parsed) || parsed < 50 ? 200 : parsed;
						await this.plugin.saveSettings();
					})
			);

		// Default opacity with slider and value display
		const opacitySetting = new Setting(containerEl)
			.setName("Default opacity")
			.setDesc("Default banner opacity when not specified in frontmatter.");

		const opacityValueDisplay = opacitySetting.controlEl.createSpan({
			text: settings.defaultOpacity.toFixed(1),
			cls: "bi-slider-value",
		});

		opacitySetting.addSlider((slider) => {
			slider
				.setLimits(0, 1, 0.1)
				.setValue(settings.defaultOpacity)
				.onChange(async (value) => {
					settings.defaultOpacity = value;
					await this.plugin.saveSettings();
				});

			const sliderEl = slider.sliderEl;
			updateSliderProgress(sliderEl, settings.defaultOpacity, 0, 1);

			sliderEl.addEventListener("input", () => {
				const value = parseFloat(sliderEl.value);
				opacityValueDisplay.setText(value.toFixed(1));
				updateSliderProgress(sliderEl, value, 0, 1);
			});
		});

		// Gradient transparency toggle
		new Setting(containerEl)
			.setName("Gradient transparency")
			.setDesc("Fade from full opacity at the top to the selected opacity at the bottom. Creates a smooth blend into your content.")
			.addToggle((toggle) =>
				toggle.setValue(settings.defaultGradient).onChange(async (value) => {
					settings.defaultGradient = value;
					await this.plugin.saveSettings();
				})
			);

		// Default offset
		new Setting(containerEl)
			.setName("Default vertical position")
			.setDesc("Default vertical position of the image. Use 'top', 'center', 'bottom', or a percentage (0% = top, 100% = bottom).")
			.addText((text) =>
				text
					.setPlaceholder("Center")
					.setValue(settings.defaultOffset)
					.onChange(async (value) => {
						settings.defaultOffset = value.trim() || "center";
						await this.plugin.saveSettings();
					})
			);

		// Usage instructions
		new Setting(containerEl).setName("Frontmatter reference").setHeading();
		containerEl.createEl("p", {
			text: "Add these fields to your note's frontmatter to display and customize a banner:",
			cls: "setting-item-description",
		});

		const codeWrapper = containerEl.createDiv({ cls: "bi-code-wrapper" });
		const codeExample = codeWrapper.createDiv({ cls: "bi-code-example" });
		const codeEl = codeExample.createEl("code");
		const exampleText = "---\nbanner_image: path/to/image.png\nbanner_height: 250\nbanner_opacity: 0.8\nbanner_offset: 20%\nbanner_gradient: true\n---";
		codeEl.setText(exampleText);

		const copyBtn = codeWrapper.createEl("button", {
			cls: "bi-copy-button",
			text: "Copy",
		});
		copyBtn.addEventListener("click", () => {
			void window.navigator.clipboard.writeText(exampleText).then(() => {
				copyBtn.setText("Copied!");
				setTimeout(() => copyBtn.setText("Copy"), 2000);
			});
		});

		// Field descriptions
		new Setting(containerEl).setName("Available fields").setHeading();
		const fieldsList = containerEl.createEl("ul");

		const fields = [
			{ field: "banner_image", desc: "Path to image file (required). Also accepts: backdrop, banner" },
			{ field: "banner_height", desc: "Height in pixels (default: from settings)" },
			{ field: "banner_opacity", desc: "Opacity from 0 to 1 (default: from settings)" },
			{ field: "banner_offset", desc: "Vertical position: top, center, bottom, or percentage like 20%" },
			{ field: "banner_gradient", desc: "true/false - Fade from top to bottom using the opacity value" },
		];

		fields.forEach(({ field, desc }) => {
			const li = fieldsList.createEl("li");
			li.createEl("code", { text: field });
			li.createSpan({ text: ` - ${desc}` });
		});

		// Supported formats
		new Setting(containerEl).setName("Supported image formats").setHeading();
		const formatsList = containerEl.createEl("ul");

		const formats = [
			"Vault-relative paths: attachments/banner.png",
			"Wikilink-style paths: [[image.png]]",
			"External URLs: https://example.com/image.png",
			"All common image formats: PNG, JPG, GIF, WebP, SVG",
		];

		formats.forEach((format) => {
			formatsList.createEl("li", { text: format });
		});

		containerEl.createEl("p", {
			text: "You can use 'backdrop:' instead of 'banner_image:' for compatibility with other plugins.",
			cls: "setting-item-description",
		});

		// Status indicator
		if (settings.enabled) {
			const statusEl = containerEl.createDiv("bi-banner-status bi-banner-enabled");
			statusEl.createEl("span", { text: "Banner images are active", cls: "bi-status-text" });
		} else {
			const statusEl = containerEl.createDiv("bi-banner-status bi-banner-disabled");
			statusEl.createEl("span", { text: "Banner images are disabled", cls: "bi-status-text" });
		}
	}
}

<script lang="ts">
	import {
		TAG_PRESETS,
		addTag,
		addTags,
		hasTag,
		isBuiltInTagPreset,
		isHiddenSystemTag,
		normalizeTag,
		parseTagList,
		removeTag,
		visibleTags
	} from '$lib/domain';

	let {
		tags = $bindable([]),
		recentTags = [],
		disabled = false,
		inputId,
		placeholder = 'Add tag…'
	}: {
		tags?: string[];
		recentTags?: string[];
		disabled?: boolean;
		inputId?: string;
		placeholder?: string;
	} = $props();

	let draft = $state('');
	let draftInput: HTMLInputElement | undefined = $state();

	const visibleSelectedTags = $derived(visibleTags(tags));

	const visibleRecentTags = $derived(
		recentTags.filter((tag) => {
			const trimmed = normalizeTag(tag);
			if (!trimmed) return false;
			if (hasTag(tags, trimmed)) return false;
			if (isHiddenSystemTag(trimmed)) return false;
			return !isBuiltInTagPreset(trimmed);
		})
	);

	const visiblePresetTags = $derived(TAG_PRESETS.filter((preset) => !hasTag(tags, preset)));

	function focusDraft() {
		draftInput?.focus();
	}

	function commitDraft(source = draft) {
		const trimmed = source.trim();
		if (!trimmed) {
			draft = '';
			return;
		}

		if (/[,;\n]/.test(trimmed)) {
			tags = addTags(tags, parseTagList(trimmed));
			draft = '';
			return;
		}

		const tag = normalizeTag(trimmed);
		if (!tag) {
			draft = '';
			return;
		}

		tags = addTag(tags, tag);
		draft = '';
	}

	function onDraftKeydown(event: KeyboardEvent) {
		if (event.key === ',' || event.key === ';') {
			event.preventDefault();
			commitDraft(draft);
			return;
		}

		if (event.key === 'Enter') {
			event.preventDefault();
			commitDraft(draft);
			return;
		}

		if (event.key === 'Backspace' && draft === '' && visibleSelectedTags.length > 0) {
			event.preventDefault();
			const last = visibleSelectedTags.at(-1);
			if (last) tags = removeTag(tags, last);
		}
	}

	function onDraftPaste(event: ClipboardEvent) {
		const text = event.clipboardData?.getData('text') ?? '';
		if (!/[,;\n]/.test(text)) return;
		event.preventDefault();
		tags = addTags(tags, parseTagList(text));
		draft = '';
	}

	function onDraftBlur() {
		commitDraft(draft);
	}

	function onRemoveTag(tag: string) {
		if (disabled) return;
		tags = removeTag(tags, tag);
		focusDraft();
	}

	function onSuggestion(tag: string) {
		if (disabled || hasTag(tags, tag)) return;
		tags = addTag(tags, tag);
		focusDraft();
	}
</script>

<div class="tag-input">
	<div class="token-field" class:disabled>
		<ul class="token-list" aria-label="Selected tags">
			{#each visibleSelectedTags as tag (tag)}
				<li class="token-item">
					<button
						type="button"
						class="token"
						{disabled}
						aria-label="Remove {tag}"
						onclick={(event) => {
							event.stopPropagation();
							onRemoveTag(tag);
						}}
					>
						{tag}
					</button>
				</li>
			{/each}
		</ul>
		<input
			bind:this={draftInput}
			id={inputId}
			class="token-draft"
			type="text"
			bind:value={draft}
			{disabled}
			{placeholder}
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			enterkeyhint="done"
			aria-label={inputId ? undefined : 'Add tag'}
			onkeydown={onDraftKeydown}
			onpaste={onDraftPaste}
			onblur={onDraftBlur}
		/>
	</div>

	{#if visibleRecentTags.length > 0}
		<div class="chip-block">
			<div class="chips">
				{#each visibleRecentTags as tag (tag)}
					<button type="button" class="chip chip-user" {disabled} onclick={() => onSuggestion(tag)}>
						{tag}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="chip-block">
		<div class="chips">
			{#each visiblePresetTags as preset (preset)}
				<button
					type="button"
					class="chip chip-preset"
					{disabled}
					onclick={() => onSuggestion(preset)}
				>
					{preset}
				</button>
			{/each}
		</div>
	</div>
</div>

<style>
	.tag-input {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		--tag-chip-font-size: var(--text-meta);
	}

	.token-field {
		box-sizing: border-box;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
		width: 100%;
		min-height: var(--touch-min);
		padding: var(--space-1) var(--space-2);
		border: none;
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--ink);
		font-family: var(--font-mono);
		box-shadow:
			0 1px var(--space-1) color-mix(in srgb, var(--ink) 6%, transparent),
			0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 8%, transparent),
			inset 0 1px 0 color-mix(in srgb, var(--surface) 80%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 6%, transparent);
	}

	@media (prefers-reduced-motion: no-preference) {
		.token-field {
			transition: box-shadow 140ms ease;
		}
	}

	.token-field:focus-within {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
		box-shadow:
			0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 8%, transparent),
			0 var(--space-2) var(--space-3) color-mix(in srgb, var(--ink) 10%, transparent),
			inset 0 1px 0 var(--surface),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 5%, transparent);
	}

	.token-field.disabled {
		background: var(--surface-subtle);
		color: var(--disabled);
		box-shadow:
			inset 0 var(--space-1) var(--space-1) color-mix(in srgb, var(--ink) 10%, transparent),
			inset 0 calc(var(--space-1) * -1) var(--space-1)
				color-mix(in srgb, var(--paper) 50%, transparent);
	}

	.token-list {
		display: contents;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.token-item {
		display: contents;
	}

	.token {
		box-sizing: border-box;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: calc(var(--touch-min) - var(--space-4));
		padding: 0 var(--space-2);
		border: none;
		border-radius: var(--radius-round);
		background: var(--brand-soft);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: var(--tag-chip-font-size);
		font-weight: 600;
		line-height: 1.2;
		cursor: default;
		box-shadow:
			0 1px 0 color-mix(in srgb, var(--brand) 16%, transparent),
			inset 0 1px 0 color-mix(in srgb, var(--surface) 55%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--brand) 10%, transparent);
	}

	@media (prefers-reduced-motion: no-preference) {
		.token {
			transition:
				background-color 140ms ease,
				box-shadow 140ms ease;
		}
	}

	.token:focus {
		outline: none;
	}

	.token:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 1px;
	}

	.token:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.token-draft {
		flex: 1 1 6rem;
		min-width: 4rem;
		min-height: calc(var(--touch-min) - var(--space-3));
		padding: 0 var(--space-1);
		border: none;
		background: transparent;
		color: inherit;
		font-family: var(--font-mono);
		font-size: var(--text-body);
	}

	.token-draft:focus {
		outline: none;
	}

	.token-draft:disabled {
		color: var(--disabled);
		cursor: not-allowed;
	}

	.token-draft::placeholder {
		color: var(--ink-muted);
	}

	.chip-block {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.chip {
		box-sizing: border-box;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: calc(var(--touch-min) - var(--space-3));
		padding: 0 var(--space-2);
		border: none;
		border-radius: var(--radius-round);
		font-family: var(--font-mono);
		font-size: var(--tag-chip-font-size);
		font-weight: 600;
		line-height: 1.2;
		text-align: center;
		color: var(--ink);
		cursor: default;
		box-shadow:
			0 1px 0 color-mix(in srgb, var(--ink) 8%, transparent),
			inset 0 1px 0 color-mix(in srgb, var(--surface) 70%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 6%, transparent);
	}

	@media (prefers-reduced-motion: no-preference) {
		.chip {
			transition:
				background-color 140ms ease,
				box-shadow 140ms ease,
				transform 140ms ease;
		}
	}

	.chip:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.chip:focus-visible,
	.chip:active:not(:disabled) {
		outline: 2px solid var(--ink);
		outline-offset: 1px;
	}

	.chip-preset {
		background: var(--surface);
	}

	@media (hover: hover) {
		.chip-preset:hover:not(:disabled) {
			box-shadow:
				0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 8%, transparent),
				inset 0 1px 0 var(--surface),
				inset 0 -1px 0 color-mix(in srgb, var(--ink) 4%, transparent);
		}
	}

	@media (hover: hover) and (prefers-reduced-motion: no-preference) {
		.chip-preset:hover:not(:disabled) {
			transform: translateY(-1px);
		}
	}

	.chip-preset:active:not(:disabled) {
		transform: none;
	}

	.chip-user {
		background: var(--brand-soft);
		box-shadow:
			0 1px 0 color-mix(in srgb, var(--brand) 14%, transparent),
			inset 0 1px 0 color-mix(in srgb, var(--surface) 55%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--brand) 10%, transparent);
	}

	@media (hover: hover) {
		.chip-user:hover:not(:disabled) {
			box-shadow:
				0 var(--space-1) var(--space-2) color-mix(in srgb, var(--brand) 12%, transparent),
				inset 0 1px 0 color-mix(in srgb, var(--surface) 70%, transparent),
				inset 0 -1px 0 color-mix(in srgb, var(--brand) 8%, transparent);
		}
	}

	@media (hover: hover) and (prefers-reduced-motion: no-preference) {
		.chip-user:hover:not(:disabled) {
			transform: translateY(-1px);
		}
	}

	.chip-user:active:not(:disabled) {
		transform: none;
	}
</style>

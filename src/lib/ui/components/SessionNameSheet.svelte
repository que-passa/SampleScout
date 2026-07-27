<script lang="ts">
	import {
		DEFAULT_SESSION_NAME,
		SESSION_NAME_PRESETS,
		normalizeSessionName
	} from '$lib/domain';
	import PrimaryButton from '$lib/ui/components/PrimaryButton.svelte';
	import SheetOverlay from '$lib/ui/components/SheetOverlay.svelte';

	let {
		open = false,
		name,
		userPresets = [],
		onclose,
		onapply
	}: {
		open?: boolean;
		name: string;
		userPresets?: string[];
		onclose: () => void;
		onapply: (name: string) => void | Promise<void>;
	} = $props();

	let draft = $state('');
	let busy = $state(false);

	const visibleUserPresets = $derived(
		userPresets.filter((preset) => {
			const trimmed = preset.trim();
			if (!trimmed) return false;
			const key = trimmed.toLowerCase();
			return !SESSION_NAME_PRESETS.some((builtIn) => builtIn.toLowerCase() === key);
		})
	);

	function prepareInput(node: HTMLInputElement) {
		draft = name;
		busy = false;
		node.focus();
		node.select();
	}

	async function apply(raw: string) {
		if (busy) return;
		busy = true;
		try {
			await onapply(normalizeSessionName(raw));
		} finally {
			busy = false;
		}
	}

	function onChip(label: string) {
		void apply(label);
	}

	function onDone() {
		void apply(draft);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			onDone();
		}
	}
</script>

{#if open}
	<SheetOverlay title="Session name" onclose={onclose}>
		<div class="sheet">
			<div class="field">
				<input
					{@attach prepareInput}
					type="text"
					class="control"
					bind:value={draft}
					onkeydown={onKeydown}
					disabled={busy}
					placeholder={DEFAULT_SESSION_NAME}
					autocomplete="off"
					autocapitalize="words"
					enterkeyhint="done"
					aria-label="Field Session name"
				/>
			</div>

			{#if visibleUserPresets.length > 0}
				<div class="chip-block">
					<div class="chips">
						{#each visibleUserPresets as preset (preset)}
							<button
								type="button"
								class="chip chip-user"
								disabled={busy}
								onclick={() => onChip(preset)}
							>
								{preset}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<div class="chip-block">
				<div class="chips">
					{#each SESSION_NAME_PRESETS as preset (preset)}
						<button
							type="button"
							class="chip chip-preset"
							disabled={busy}
							onclick={() => onChip(preset)}
						>
							{preset}
						</button>
					{/each}
				</div>
			</div>

			<div class="footer">
				<PrimaryButton type="button" disabled={busy} onclick={onDone}>Done</PrimaryButton>
			</div>
		</div>
	</SheetOverlay>
{/if}

<style>
	.sheet {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.field {
		display: flex;
		justify-content: center;
	}

	.control {
		box-sizing: border-box;
		width: 100%;
		max-width: 30ch;
		min-height: var(--touch-min);
		padding: var(--space-2) var(--space-4);
		border: none;
		border-radius: var(--radius-round);
		background: var(--surface);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: var(--text-body);
		text-align: center;
		box-shadow:
			0 1px var(--space-1) color-mix(in srgb, var(--ink) 6%, transparent),
			0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 8%, transparent),
			inset 0 1px 0 color-mix(in srgb, var(--surface) 80%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 6%, transparent);
	}

	@media (prefers-reduced-motion: no-preference) {
		.control {
			transition: box-shadow 140ms ease;
		}
	}

	.control:focus {
		outline: none;
	}

	.control:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
		box-shadow:
			0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 8%, transparent),
			0 var(--space-2) var(--space-3) color-mix(in srgb, var(--ink) 10%, transparent),
			inset 0 1px 0 var(--surface),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 5%, transparent);
	}

	.control:disabled {
		background: var(--surface-subtle);
		color: var(--disabled);
		box-shadow:
			inset 0 var(--space-1) var(--space-1) color-mix(in srgb, var(--ink) 10%, transparent),
			inset 0 calc(var(--space-1) * -1) var(--space-1)
				color-mix(in srgb, var(--paper) 50%, transparent);
	}

	.chip-block {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-2);
	}

	.chip {
		box-sizing: border-box;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: calc(var(--touch-min) - var(--space-2));
		padding: var(--space-1) var(--space-3);
		border: none;
		border-radius: var(--radius-round);
		font-family: var(--font-mono);
		font-size: var(--text-annotation);
		font-weight: 600;
		line-height: 1.25;
		text-align: center;
		color: var(--ink);
		cursor: default;
		/* Match Capture session-display raised pill, scaled down. */
		box-shadow:
			0 1px 0 color-mix(in srgb, var(--ink) 10%, transparent),
			0 1px var(--space-1) color-mix(in srgb, var(--ink) 12%, transparent),
			inset 0 1px 0 color-mix(in srgb, var(--surface) 70%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 8%, transparent);
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
		/* Match `.control:focus-visible` outline. */
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.chip-preset {
		background: var(--surface);
	}

	@media (hover: hover) {
		.chip-preset:hover:not(:disabled) {
			box-shadow:
				0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 8%, transparent),
				0 var(--space-2) var(--space-3) color-mix(in srgb, var(--ink) 10%, transparent),
				inset 0 1px 0 var(--surface),
				inset 0 -1px 0 color-mix(in srgb, var(--ink) 5%, transparent);
		}
	}

	@media (hover: hover) and (prefers-reduced-motion: no-preference) {
		.chip-preset:hover:not(:disabled) {
			transform: translateY(-1px);
		}
	}

	.chip-preset:active:not(:disabled) {
		background: var(--surface);
		box-shadow:
			0 1px 0 color-mix(in srgb, var(--ink) 8%, transparent),
			inset 0 1px var(--space-1) color-mix(in srgb, var(--ink) 10%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--surface) 60%, transparent);
		transform: none;
	}

	.chip-user {
		background: var(--brand-soft);
		box-shadow:
			0 1px 0 color-mix(in srgb, var(--brand) 18%, transparent),
			0 1px var(--space-1) color-mix(in srgb, var(--brand) 16%, transparent),
			inset 0 1px 0 color-mix(in srgb, var(--surface) 55%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--brand) 12%, transparent);
	}

	@media (hover: hover) {
		.chip-user:hover:not(:disabled) {
			box-shadow:
				0 var(--space-1) var(--space-2) color-mix(in srgb, var(--brand) 14%, transparent),
				0 var(--space-2) var(--space-3) color-mix(in srgb, var(--brand) 12%, transparent),
				inset 0 1px 0 color-mix(in srgb, var(--surface) 70%, transparent),
				inset 0 -1px 0 color-mix(in srgb, var(--brand) 10%, transparent);
		}
	}

	@media (hover: hover) and (prefers-reduced-motion: no-preference) {
		.chip-user:hover:not(:disabled) {
			transform: translateY(-1px);
		}
	}

	.chip-user:active:not(:disabled) {
		background: var(--brand-soft);
		box-shadow:
			0 1px 0 color-mix(in srgb, var(--brand) 14%, transparent),
			inset 0 1px var(--space-1) color-mix(in srgb, var(--brand) 14%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--surface) 50%, transparent);
		transform: none;
	}

	.footer {
		display: flex;
		justify-content: flex-end;
		padding-top: var(--space-2);
	}

	.footer :global(.ss-primary-button) {
		min-width: 8rem;
	}

	.footer :global(.ss-primary-button .well),
	.footer :global(.ss-primary-button .face) {
		width: 100%;
	}
</style>

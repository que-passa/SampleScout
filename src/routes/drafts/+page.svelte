<script lang="ts">
	import { onMount } from 'svelte';
	import { listSessions, listTakesForSession } from '$lib/persistence';
	import {
		batchSaveTakeMetadata,
		discardLocalDraft,
		discardLocalDrafts,
		importAudioFiles,
		actionToast,
		onTakeInventoryChanged,
		openAccountOverlay,
		renameTakeDisplayName,
		retryTakeUpload,
		audiotoolAuth
	} from '$lib/state';
	import {
		deriveCatalogReference,
		deriveSpecimenMark,
		isTakeSavedLocally,
		type TakeMetadataPatch
	} from '$lib/domain';
	import type { CaptureSession, Take, TakeId } from '$lib/domain/types';
	import BatchFieldNotesPanel from '$lib/ui/components/BatchFieldNotesPanel.svelte';
	import ConfirmDialog from '$lib/ui/components/ConfirmDialog.svelte';
	import EmptyState from '$lib/ui/components/EmptyState.svelte';
	import TakeRow from '$lib/ui/components/TakeRow.svelte';
	import AppShell from '$lib/ui/layouts/AppShell.svelte';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';

	interface SessionWithTakes {
		session: CaptureSession;
		takes: Take[];
	}

	let sessions = $state<SessionWithTakes[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let importing = $state(false);
	let importStatus = $state<string | null>(null);
	let importError = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let selectMode = $state(false);
	let selectedIds = $state<Record<string, true>>({});
	let batchBusy = $state(false);
	let batchStatus = $state<string | null>(null);
	let batchError = $state<string | null>(null);
	let discardConfirm = $state<
		| { kind: 'single'; takeId: string; displayName: string }
		| { kind: 'batch'; takeIds: string[]; count: number }
		| null
	>(null);
	let discarding = $state(false);
	let retryingTakeId = $state<string | null>(null);

	const selectedCount = $derived(Object.keys(selectedIds).length);
	const allTakeIds = $derived(sessions.flatMap((entry) => entry.takes.map((take) => take.id)));

	async function load() {
		const allSessions = await listSessions();
		const sessionsWithTakes: SessionWithTakes[] = [];

		for (const session of allSessions) {
			const takes = await listTakesForSession(session.id);
			if (takes.length > 0) {
				sessionsWithTakes.push({
					session,
					takes: [...takes].sort((a, b) => b.sequence - a.sequence)
				});
			}
		}

		sessionsWithTakes.sort((a, b) => {
			const aTime = a.takes[0]?.updatedAt || a.session.updatedAt;
			const bTime = b.takes[0]?.updatedAt || b.session.updatedAt;
			return bTime.localeCompare(aTime);
		});

		sessions = sessionsWithTakes;
		loadError = null;

		const visible = new Set(sessionsWithTakes.flatMap((entry) => entry.takes.map((t) => t.id)));
		const nextSelected: Record<string, true> = {};
		for (const id of Object.keys(selectedIds)) {
			if (visible.has(id)) nextSelected[id] = true;
		}
		selectedIds = nextSelected;
	}

	async function retryLoad() {
		loading = true;
		loadError = null;
		try {
			await load();
		} catch (error) {
			loadError =
				error && typeof error === 'object' && 'message' in error
					? String((error as { message: string }).message)
					: 'Could not load Collection.';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		const unsubInventory = onTakeInventoryChanged(() => {
			void load().catch((error) => {
				console.error('Failed to refresh Collection:', error);
			});
		});
		void (async () => {
			try {
				await load();
			} catch (error) {
				console.error('Failed to load sessions:', error);
				loadError =
					error && typeof error === 'object' && 'message' in error
						? String((error as { message: string }).message)
						: 'Could not load Collection.';
			} finally {
				loading = false;
			}
		})();
		return unsubInventory;
	});

	function requestDiscard(takeId: string, displayName: string) {
		discardConfirm = {
			kind: 'single',
			takeId,
			displayName: displayName.trim() || 'this Local Draft'
		};
	}

	function requestBatchDiscard() {
		const takeIds = Object.keys(selectedIds);
		if (takeIds.length === 0 || batchBusy || discarding) return;
		discardConfirm = { kind: 'batch', takeIds, count: takeIds.length };
	}

	function cancelDiscard() {
		if (discarding) return;
		discardConfirm = null;
	}

	async function confirmDiscard() {
		const pending = discardConfirm;
		if (!pending || discarding) return;
		discarding = true;
		try {
			if (pending.kind === 'single') {
				await discardLocalDraft(pending.takeId);
			} else {
				batchBusy = true;
				batchError = null;
				batchStatus = `Discarding ${pending.count} Local Draft${pending.count === 1 ? '' : 's'}…`;
				const result = await discardLocalDrafts(pending.takeIds);
				const ok = result.discarded.length;
				const fail = result.errors.length;
				if (ok > 0 && fail === 0) {
					batchStatus = `Discarded ${ok} Local Draft${ok === 1 ? '' : 's'}.`;
					selectedIds = {};
				} else if (ok > 0 && fail > 0) {
					batchStatus = `Discarded ${ok}; ${fail} failed.`;
					batchError = result.errors.map((error) => error.message).join(' ');
					const failed = new Set(result.errors.map((error) => error.takeId));
					const next: Record<string, true> = {};
					for (const id of pending.takeIds) {
						if (failed.has(id)) next[id] = true;
					}
					selectedIds = next;
				} else {
					batchStatus = null;
					batchError =
						result.errors.map((error) => error.message).join(' ') || 'Discard failed.';
				}
			}
			discardConfirm = null;
		} catch (cause) {
			if (pending.kind === 'batch') {
				batchStatus = null;
				batchError =
					cause && typeof cause === 'object' && 'message' in cause
						? String((cause as { message: string }).message)
						: 'Discard failed.';
			}
		} finally {
			discarding = false;
			batchBusy = false;
		}
	}

	async function onRetryUpload(takeId: TakeId) {
		if (retryingTakeId) return;
		if (audiotoolAuth.status.state !== 'connected') {
			openAccountOverlay();
			return;
		}
		retryingTakeId = takeId;
		batchError = null;
		try {
			await retryTakeUpload(takeId);
			await load();
		} catch (cause) {
			batchError =
				cause && typeof cause === 'object' && 'message' in cause
					? String((cause as { message: string }).message)
					: 'Could not retry upload.';
		} finally {
			retryingTakeId = null;
		}
	}

	async function onRename(takeId: string, name: string) {
		await renameTakeDisplayName(takeId, name);
		actionToast.show('Name updated');
	}

	function bindFileInput(node: HTMLInputElement) {
		fileInput = node;
		return () => {
			if (fileInput === node) fileInput = null;
		};
	}

	function openImportPicker() {
		if (importing) return;
		importError = null;
		fileInput?.click();
	}

	async function onImportFiles(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files ? Array.from(input.files) : [];
		input.value = '';
		if (files.length === 0) return;

		importing = true;
		importError = null;
		importStatus = `Importing ${files.length} file${files.length === 1 ? '' : 's'}…`;

		try {
			const result = await importAudioFiles(files);
			const ok = result.imported.length;
			const fail = result.errors.length;
			if (ok > 0 && fail === 0) {
				importStatus = `Imported ${ok} Local Draft${ok === 1 ? '' : 's'}.`;
			} else if (ok > 0 && fail > 0) {
				importStatus = `Imported ${ok}; ${fail} failed.`;
				importError = result.errors.map((error) => error.message).join(' ');
			} else {
				importStatus = null;
				importError = result.errors.map((error) => error.message).join(' ') || 'Import failed.';
			}
		} catch (cause) {
			importStatus = null;
			importError =
				cause && typeof cause === 'object' && 'message' in cause
					? String((cause as { message: string }).message)
					: 'Import failed.';
		} finally {
			importing = false;
		}
	}

	function toggleSelectMode() {
		selectMode = !selectMode;
		if (!selectMode) {
			selectedIds = {};
			batchStatus = null;
			batchError = null;
		}
	}

	function setSelected(takeId: TakeId, selected: boolean) {
		const next = { ...selectedIds };
		if (selected) next[takeId] = true;
		else delete next[takeId];
		selectedIds = next;
	}

	function selectAllVisible() {
		const next: Record<string, true> = {};
		for (const id of allTakeIds) next[id] = true;
		selectedIds = next;
	}

	function clearSelection() {
		selectedIds = {};
		batchStatus = null;
		batchError = null;
	}

	async function onBatchApply(patch: TakeMetadataPatch) {
		const ids = Object.keys(selectedIds);
		if (ids.length === 0) return;
		batchBusy = true;
		batchError = null;
		batchStatus = `Updating ${ids.length} take${ids.length === 1 ? '' : 's'}…`;
		try {
			const result = await batchSaveTakeMetadata(ids, patch);
			const ok = result.updated.length;
			const fail = result.errors.length;
			if (ok > 0 && fail === 0) {
				batchStatus = `Updated Field Notes on ${ok} take${ok === 1 ? '' : 's'}.`;
			} else if (ok > 0 && fail > 0) {
				batchStatus = `Updated ${ok}; ${fail} failed.`;
				batchError = result.errors.map((error) => error.message).join(' ');
			} else {
				batchStatus = null;
				batchError =
					result.errors.map((error) => error.message).join(' ') ||
					'Batch Field Notes update failed.';
			}
		} catch (cause) {
			batchStatus = null;
			batchError =
				cause && typeof cause === 'object' && 'message' in cause
					? String((cause as { message: string }).message)
					: 'Batch Field Notes update failed.';
		} finally {
			batchBusy = false;
		}
	}
</script>

<svelte:head>
	<title>Collection · SampleScout</title>
</svelte:head>

<AppShell>
	<section class="drafts">
		<div class="drafts-scroll">
			{#if importStatus}
				<p class="status-line" role="status">{importStatus}</p>
			{/if}
			{#if importError}
				<p class="error-line" role="alert">{importError}</p>
			{/if}

			{#if selectMode && sessions.length > 0}
				<div class="select-bar">
					<p class="select-count">{selectedCount} selected</p>
					<div class="select-actions">
						<button type="button" class="text-button" onclick={selectAllVisible}> Select all </button>
						<button type="button" class="text-button" onclick={clearSelection}>Clear</button>
						{#if selectedCount > 0}
							<button
								type="button"
								class="text-button danger"
								disabled={batchBusy || discarding}
								onclick={requestBatchDiscard}
							>
								Discard
							</button>
						{/if}
					</div>
				</div>
				{#if selectedCount > 0}
					<BatchFieldNotesPanel
						{selectedCount}
						busy={batchBusy || discarding}
						onapply={onBatchApply}
						onclear={clearSelection}
					/>
				{/if}
				{#if batchStatus}
					<p class="status-line" role="status">{batchStatus}</p>
				{/if}
				{#if batchError}
					<p class="error-line" role="alert">{batchError}</p>
				{/if}
			{:else if batchError}
				<p class="error-line" role="alert">{batchError}</p>
			{/if}

			{#if loading}
				<p class="loading">Loading Collection and Field Sessions…</p>
			{:else if loadError}
				<EmptyState
					title="Could not load Collection"
					body={loadError}
					actionLabel="Retry"
					onaction={() => {
						void retryLoad();
					}}
				/>
			{:else if sessions.length === 0}
				<EmptyState
					title="Collection is empty"
					body="Capture a take or import an audio file to create a Local Draft. Saved takes are grouped into Field Sessions on this device for review, discard, and upload."
					actionLabel="Go to Capture"
					onaction={() => {
						void goto(resolve('/capture'));
					}}
					secondaryActionLabel="Import"
					onsecondaryaction={openImportPicker}
				/>
			{:else}
				<div class="sessions-list">
					{#each sessions as { session, takes } (session.id)}
						<section class="session-block">
							<header class="session-header">
								<h2 class="session-name">{session.name}</h2>
								<p class="session-meta">
									{takes.length} take{takes.length === 1 ? '' : 's'}
								</p>
							</header>
							<div class="takes">
								{#each takes as take (take.id)}
									<TakeRow
										name={take.metadata.displayName}
										durationSeconds={take.source.durationSeconds}
										kind={take.metadata.kind}
										savedLocally={isTakeSavedLocally(take)}
										catalogReference={deriveCatalogReference(take)}
										specimenMark={deriveSpecimenMark(take)}
										uploadState={take.uploadState === 'not-queued' ? undefined : take.uploadState}
										takeId={take.id}
										editable={!selectMode}
										selectable={selectMode}
										selected={Boolean(selectedIds[take.id])}
										onselect={(selected) => setSelected(take.id, selected)}
										onrename={(name) => onRename(take.id, name)}
										ondiscard={
											selectMode
												? undefined
												: () => requestDiscard(take.id, take.metadata.displayName)
										}
										onretry={
											!selectMode && take.uploadState === 'failed'
												? () => void onRetryUpload(take.id)
												: undefined
										}
										retryBusy={retryingTakeId === take.id}
									/>
								{/each}
							</div>
						</section>
					{/each}
				</div>
			{/if}

			<p class="lead">
				Local Drafts stay on this device only. There is no cloud backup or cross-device sync, and
				clearing site data removes them.
			</p>
		</div>

		<footer class="actions-bar" aria-label="Collection actions">
			{#if sessions.length > 0}
				<button
					type="button"
					class="header-button"
					class:active={selectMode}
					onclick={toggleSelectMode}
				>
					{selectMode ? 'Done' : 'Select'}
				</button>
			{/if}
			<button
				type="button"
				class="header-button import-button"
				onclick={openImportPicker}
				disabled={importing}
			>
				Import
			</button>
			<input
				{@attach bindFileInput}
				type="file"
				accept="audio/*"
				multiple
				class="file-input"
				onchange={(event) => void onImportFiles(event)}
			/>
		</footer>
	</section>

	{#if discardConfirm}
		<ConfirmDialog
			title="Discard"
			message={discardConfirm.kind === 'single'
				? `Discard “${discardConfirm.displayName}”? It will be removed from this device.`
				: `Discard ${discardConfirm.count} Local Draft${discardConfirm.count === 1 ? '' : 's'}? They will be removed from this device.`}
			confirmLabel="Discard"
			busy={discarding}
			oncancel={cancelDiscard}
			onconfirm={() => void confirmDiscard()}
		/>
	{/if}
</AppShell>

<style>
	.drafts {
		height: 100%;
		min-height: 0;
		display: grid;
		grid-template-rows: 1fr auto;
		overflow: hidden;
	}

	.drafts-scroll {
		min-height: 0;
		overflow: auto;
		display: grid;
		align-content: start;
		gap: var(--space-4);
		padding: var(--space-4);
	}

	.actions-bar {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-4);
		padding-bottom: calc(var(--space-2) + env(safe-area-inset-bottom, 0px));
		border-top: 1px solid var(--line);
		background: var(--paper);
		z-index: 1;
	}

	.import-button {
		margin-left: auto;
	}

	.header-button {
		min-height: var(--touch-min);
		padding: 0 var(--space-4);
		border: 1px solid var(--ink);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--ink);
		font-size: var(--text-button);
		font-weight: 600;
	}

	.header-button.active {
		background: var(--ink);
		color: var(--surface);
	}

	.header-button:disabled {
		border-color: var(--disabled);
		color: var(--disabled);
	}

	.file-input {
		display: none;
	}

	.status-line {
		margin: 0;
		font-size: var(--text-meta);
		color: var(--ink-muted);
	}

	.error-line {
		margin: 0;
		font-size: var(--text-meta);
		color: var(--signal);
	}

	.select-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.select-count {
		margin: 0;
		font-size: var(--text-meta);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.select-actions {
		display: flex;
		gap: var(--space-3);
	}

	.text-button {
		min-height: var(--touch-min);
		padding: 0;
		border: none;
		background: transparent;
		color: var(--ink);
		font-size: var(--text-annotation);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		text-decoration: underline;
		text-underline-offset: var(--space-1);
		cursor: pointer;
	}

	.text-button.danger {
		color: var(--signal);
	}

	.text-button:disabled {
		opacity: 0.5;
		cursor: wait;
		text-decoration: none;
	}

	.loading {
		color: var(--ink-muted);
	}

	.sessions-list {
		display: grid;
		gap: var(--space-5);
	}

	.session-block {
		display: grid;
		gap: var(--space-3);
	}

	.session-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.session-name {
		margin: 0;
		font-size: var(--text-screen);
		font-weight: 600;
	}

	.session-meta {
		margin: 0;
		font-size: var(--text-meta);
		color: var(--ink-muted);
		font-weight: 600;
		flex-shrink: 0;
	}

	.takes {
		display: grid;
		gap: var(--space-3);
	}

	.lead {
		margin: 0;
		max-width: 40rem;
		font-size: var(--text-meta);
		color: var(--ink-muted);
	}

	@media (min-width: 900px) {
		.drafts-scroll {
			padding: var(--space-5);
		}

		.actions-bar {
			padding-left: var(--space-5);
			padding-right: var(--space-5);
		}
	}
</style>

<script lang="ts">
	import type { RecordingSettings } from '$lib/domain/types';
	import {
		DEFAULT_UPLOAD_OUTPUT,
		outputToValue,
		UPLOAD_OUTPUT_OPTIONS,
		valueToOutput,
		type UploadOutput,
		type UploadOutputValue
	} from '$lib/config/upload-output';
	import PrimaryButton from '$lib/ui/components/PrimaryButton.svelte';
	import SheetOverlay from '$lib/ui/components/SheetOverlay.svelte';

	type RecordingChannelMode = RecordingSettings['channelMode'];
	type RecordingSampleRate = RecordingSettings['sampleRate'];
	type RecordingEncoderBitrate = RecordingSettings['encoderBitrateKbps'];

	const CHANNEL_OPTIONS: { value: RecordingChannelMode; label: string }[] = [
		{ value: 'device', label: 'Device default' },
		{ value: 'mono', label: 'Mono' },
		{ value: 'stereo', label: 'Stereo' }
	];

	const SAMPLE_RATE_OPTIONS: { value: RecordingSampleRate; label: string }[] = [
		{ value: 'device', label: 'Device default' },
		{ value: 44100, label: '44.1 kHz' },
		{ value: 48000, label: '48 kHz' }
	];

	const ENCODER_BITRATE_OPTIONS: { value: RecordingEncoderBitrate; label: string }[] = [
		{ value: 'device', label: 'Device default' },
		{ value: 96, label: '96 kbps' },
		{ value: 128, label: '128 kbps' },
		{ value: 192, label: '192 kbps' }
	];

	let {
		open = false,
		recordingSettings,
		preferredOutput,
		onclose,
		onapply
	}: {
		open?: boolean;
		recordingSettings: RecordingSettings;
		preferredOutput: UploadOutput;
		onclose: () => void;
		onapply: (next: {
			recordingSettings: RecordingSettings;
			preferredOutput: UploadOutput;
		}) => void | Promise<void>;
	} = $props();

	let channelMode = $state<RecordingChannelMode>('device');
	let sampleRate = $state<RecordingSampleRate>('device');
	let encoderBitrateKbps = $state<RecordingEncoderBitrate>('device');
	let outputValue = $state<UploadOutputValue>('mp3-192');
	let busy = $state(false);

	function prepareSheet() {
		channelMode = recordingSettings.channelMode;
		sampleRate = recordingSettings.sampleRate;
		encoderBitrateKbps = recordingSettings.encoderBitrateKbps;
		outputValue = outputToValue(preferredOutput ?? DEFAULT_UPLOAD_OUTPUT);
		busy = false;
	}

	const selectedOutputHint = $derived(
		UPLOAD_OUTPUT_OPTIONS.find((option) => option.value === outputValue)?.hint ?? ''
	);

	async function onDone() {
		if (busy) return;
		busy = true;
		try {
			await onapply({
				recordingSettings: {
					channelMode,
					sampleRate,
					encoderBitrateKbps
				},
				preferredOutput: valueToOutput(outputValue)
			});
		} finally {
			busy = false;
		}
	}
</script>

{#if open}
	<SheetOverlay title="Capture settings" {onclose}>
		<div class="sheet" {@attach prepareSheet}>
			<section class="section" aria-labelledby="recording-section-title">
				<div class="section-heading">
					<h3 id="recording-section-title" class="section-title">Recording</h3>
					<p class="section-note">
						Requested at capture. Your browser or microphone may ignore these.
					</p>
				</div>

				<div class="fields">
					<label class="field">
						<span class="field-label">Channels</span>
						<select class="control select-control" bind:value={channelMode} disabled={busy}>
							{#each CHANNEL_OPTIONS as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
						<p class="field-hint field-hint-soft">May differ on your device.</p>
					</label>

					<label class="field">
						<span class="field-label">Sample rate</span>
						<select class="control select-control" bind:value={sampleRate} disabled={busy}>
							{#each SAMPLE_RATE_OPTIONS as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
						<p class="field-hint field-hint-soft">May differ on your device.</p>
					</label>

					<label class="field">
						<span class="field-label">Encoder bitrate</span>
						<select class="control select-control" bind:value={encoderBitrateKbps} disabled={busy}>
							{#each ENCODER_BITRATE_OPTIONS as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
						<p class="field-hint field-hint-soft">May differ on your device.</p>
					</label>
				</div>
			</section>

			<section class="section" aria-labelledby="upload-section-title">
				<div class="section-heading">
					<h3 id="upload-section-title" class="section-title">Upload</h3>
					<p class="section-note">Applied when encoding files for Audiotool upload.</p>
				</div>

				<label class="field">
					<span class="field-label">Upload quality</span>
					<select class="control select-control" bind:value={outputValue} disabled={busy}>
						{#each UPLOAD_OUTPUT_OPTIONS as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
					<p class="field-hint">{selectedOutputHint}</p>
				</label>
			</section>

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

	.section {
		display: grid;
		gap: var(--space-3);
	}

	.section-heading {
		display: grid;
		gap: var(--space-1);
	}

	.section-title {
		margin: 0;
		font-size: var(--text-label);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.section-note {
		margin: 0;
		font-size: var(--text-annotation);
		line-height: 1.35;
		color: var(--ink-muted);
	}

	.fields {
		display: grid;
		gap: var(--space-3);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.field-label {
		font-size: var(--text-label);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.field-hint {
		margin: 0;
		font-size: var(--text-annotation);
		color: var(--ink-muted);
		line-height: 1.35;
	}

	.field-hint-soft {
		font-style: italic;
	}

	.control {
		box-sizing: border-box;
		width: 100%;
		min-height: var(--touch-min);
		padding: var(--space-2) var(--space-3);
		border: none;
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: var(--text-body);
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

	.select-control {
		appearance: none;
		padding-right: calc(var(--space-3) + var(--touch-min));
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' fill='none' viewBox='0 0 24 24'%3E%3Cpath stroke='%23000' stroke-width='2' d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
		background-position: right var(--space-2) center;
		background-repeat: no-repeat;
		background-size: 1rem 1rem;
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

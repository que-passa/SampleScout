export {
	INSTALL_DISMISSED_KEY,
	INSTALL_SOFT_TIP_KEY,
	installGuideKind,
	isIosLike,
	isStandaloneDisplay,
	readLocalFlag,
	writeLocalFlag
} from './install-detect';
export type { InstallGuideKind, PlatformProbe, StandaloneProbe } from './install-detect';
export {
	closeInstallSheet,
	dismissInstallOffer,
	getInstallGuide,
	hydrateInstallPrompt,
	installPrompt,
	openInstallFlow,
	openInstallSheet,
	promptNativeInstall,
	scheduleSoftTip
} from './install-prompt.svelte';
export type { BeforeInstallPromptEvent } from './install-prompt.svelte';
